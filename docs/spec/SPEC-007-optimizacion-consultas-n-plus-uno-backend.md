---
title: "SPEC-007: Optimización de consultas N+1 en backend-portaqr"
date: 2026-08-09
tags:
  - spec
  - backend
  - rendimiento
  - mongodb
  - n-plus-one
  - nestjs
status: borrador
aliases:
  - SPEC-007
  - Optimización N+1 backend
---

# SPEC-007: Optimización de consultas N+1 en `backend-portaqr`

> [!abstract] Decisión clave
> Eliminar los **4 patrones N+1** detectados en `backend-portaqr` reemplazando operaciones por-documento por **operaciones batch atómicas de Mongo** (`insertMany` / `updateMany` / `findOneAndUpdate` condicional), **paginando en la BD** (no en memoria) y **consolidando contadores** con `$facet`. Prioridad: el flujo Webpay (P0) porque combina N+1 con **updates fire-and-forget que pueden dejar una compra pagada sin QRs activos**.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-09
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-001]] (arquitectura modular del backend)

---

## 1. Objetivo

Eliminar las consultas N+1 (y anti-patrones asociados) del backend `backend-portaqr` para:

1. Reducir la latencia de endpoints de lote (`generate` pet-tags, activación de QRs por compra).
2. Corregir una **inconsistencia de datos crítica** en el flujo de pago Webpay (QRs que no se activan tras el pago).
3. Evitar que endpoints de listado escalen de forma lineal con el catálogo del usuario (paginación en memoria).
4. Reducir la carga de CPU de MongoDB (counts múltiples, escrituras duplicadas).

**No es una auditoría exhaustiva de rendimiento**: cubre los 7 hallazgos confirmados por revisión de código (agosto 2026), con severidad y plan de remediación.

## 2. Estado actual (2026-08-09)

Backend NestJS + Mongoose/MongoDB, arquitectura hexagonal (domain/application/infrastructure). Revisados: 7 repositorios Mongo, ~50 use-cases, 8 controllers.

### 2.1 Resumen de hallazgos

| # | Hallazgo | Archivo(s) | Patrón | Severidad |
|---|----------|-----------|--------|-----------|
| H1 | N inserts secuenciales (`save()` por tag) | `mongo-pet-tag.repository.ts` `generateBatch` | N+1 escritura | 🔴 Crítico |
| H2 | N updates **fire-and-forget** al activar QRs de una compra | `create-qr-activate.usecase.ts`, `update-webpay-qr-activate.usecase.ts` | N+1 escritura + inconsistencia | 🔴 Crítico |
| H3 | Fetch completo + paginación en memoria | `mongo-qr.repository.ts` `findUserByFavorites` | N+1 lectura (carga lineal) | 🟠 Alto |
| H4 | 5-7 `countDocuments` por request | `mongo-statistics.repository.ts` | N consultas paralelas | 🟠 Medio |
| H5 | Escritura en 2 round-trips + race condition (TOCTOU) | `mongo-pet-tag.repository.ts` `activate` | Redundancia + bug concurrencia | 🟡 Medio |
| H6 | Escritura en 2 round-trips | `mongo-pet-tag.repository.ts` `update` | Redundancia | 🟡 Bajo |
| H7 | 5 round-trips para crear 1 usuario | `create-user.usecase.ts` | Redundancia | 🟡 Bajo |

### 2.2 Lo que está bien (no tocar)

- **Paginación estándar**: `findPaginatedByUser`, `findAllWithSearch`, `getAll` (users), `findReserved`, `getAll` (plan/qr-free/qr-activate) usan `Promise.all([find + skip/limit, count])` — correcto.
- **Stats de scans**: `mongo-scan.repository.ts` usa `aggregate` (`$group`) — evita el N+1 por día.
- **Populates**: `qr-activate` usa `populate` correctamente (1 query extra con `$in`).
- **Controllers**: sin loops de re-consulta.

## 3. Especificación

### 3.1 H2 — Activación batch de QRs (P0, corregir primero)

**Problema** (`update-webpay-qr-activate.usecase.ts:51-57` y `create-qr-activate.usecase.ts:60-66`):

```ts
activation.qrList.forEach((qr) => {
  this.qrActivator.updateQr(qr.qrCode, { active: true, expiration: qr.expirationDate }, tracking);
  // sin await → promesa huérfana; error → unhandled rejection; estado PAYED se guarda sin garantía de activación
});
```

Cadena por QR: `QrActivateQrAdapter.updateQr` → `UpdateQrUseCase` → `findOneAndUpdate` (1 round-trip/QR). Además `UpdateQrUseCase` lanza `NotFoundException` si el QR no existe → error perdido.

**Requisito funcional RF-1**: Activar N QRs de una compra con **1 sola operación** de BD, esperada, con resultado comprobable.
**Requisito funcional RF-2**: En el flujo Webpay, el estado `PAYED` se persiste **solo después** de que la activación batch haya completado.
**Requisito funcional RF-3**: La operación debe ser idempotente (re-procesar un pago no debe fallar).

### 3.2 H1 — Generación de lote de pet-tags (P0)

**Requisito funcional RF-4**: Generar `quantity` pet-tags en **1 sola operación** de BD (`insertMany`), preservando el contrato actual de retorno (`GeneratedPetTagResult[]` con `qrId` + `activationPin`).

### 3.3 H3 — Listado combinado QR + pet-tag paginado (P1)

**Requisito funcional RF-5**: `GET /qr/user/favorites` debe ejecutar consultas **con `skip/limit` en BD** (no traer toda la colección para descartarla), manteniendo el orden actual (favoritos primero, luego `updatedAt` desc) y la unión de fuentes QR + pet-tag.
**Requisito funcional RF-6**: Crear índices compuestos `{ userId: 1, isFavorite: -1, updatedAt: -1 }` en `qr` y `pet-tag` para soportar el sort sin escaneo.
**Requisito funcional RF-7**: Eliminar los `countDocuments` duplicados de la misma query del `find` (consolidar con `$facet`).

### 3.4 H4 — Statistics (P2)

**Requisito funcional RF-8**: Consolidar los counts de cada colección en **1 `aggregate` con `$facet`** por colección (`getUserStatistics`: 2 consultas; `getSystemStatistics`: 3), sin cambiar el contrato de respuesta.

### 3.5 H5/H6 — Pet-tag activación y actualización atómicas (P1/P2)

**Requisito funcional RF-9**: `activate()` debe ser **atómico**: un solo `findOneAndUpdate` con filtro condicional (`status: 'RESERVADO'`) que elimine la race condition TOCTOU y reduzca a 1 round-trip.
**Requisito funcional RF-10**: `update()` debe usar `findOneAndUpdate` (1 round-trip) en vez de find + mutate + save.
**Requisito funcional RF-11**: Índices `{ idQr: 1, userId: 1 }` y `{ idQr: 1, activationPin: 1 }` en `pet-tag`.

### 3.6 H7 — Creación de usuario (P3)

**Requisito funcional RF-12**: Crear usuario en **1 round-trip**: índices únicos en `email`/`userName` + captura de error `E11000` (elimina pre-checks) + `verificationCode` generado e incluido en el insert + envío de email con el doc retornado (elimina update y getById posteriores).

## 4. Diseño Técnico

### 4.1 Nuevo contrato del puerto QR (H2)

**`src/modules/qr/domain/ports/queries/qr.port.ts`** — añadir a `ICanUpdateQr`:

```ts
activateMany(qrCodes: string[], expiration: Date, tracking: TrackingContext): Promise<{ matchedCount: number }>;
```

**`src/modules/qr/infrastructure/repository/mongo/mongo-qr.repository.ts`**:

```ts
async activateMany(qrCodes: string[], expiration: Date, tracking: TrackingContext) {
  const result = await this.qrModel.updateMany(
    { idQr: { $in: qrCodes } },
    { $set: { active: true, expiration } },
  ).exec();
  return { matchedCount: result.matchedCount };
}
```

**`src/modules/qr-activate/infrastructure/adapters/QrActivateQrAdapter.ts`** — implementar `activateMany` delegando al repositorio (inyectando el puerto QR directamente o un nuevo use-case `ActivateManyQrsUseCase`; recomendado: use-case para mantener la capa de aplicación).

**Use-cases** (`create-qr-activate.usecase.ts`, `update-webpay-qr-activate.usecase.ts`):

```ts
const codes = activation.qrList.map(q => q.qrCode);
const { matchedCount } = await this.qrActivator.activateMany(codes, expiration, tracking);
// log de matchedCount vs codes.length si no coincide (QRs inexistentes, no fatal)
await this.updater.update(activation.id, { state: ActivationState.PAYED, ... }, tracking);
```

### 4.2 Flujo Webpay objetivo (H2)

```
Webpay callback (token_ws)
  → getByWebpayToken (1 read)
  → commitTransaction (gateway + updateByToken 1 write)
  → [authorized]
      activateMany($in) → 1 write atómica     ← ANTES: N writes huérfanas
      updater.update(PAYED) → 1 write          ← ANTES: se hacía sin esperar lo anterior
  → respuesta
```

Total: 4 round-trips fijos, independientes del número de QRs. Consistencia: `PAYED` solo si la activación batch completó.

### 4.3 generateBatch (H1)

```ts
const docs = Array.from({ length: quantity }, () => ({
  idQr: uuidv4(),
  activationPin: nanoid(),
  status: 'RESERVADO',
  commercialStatus: assignedStoreName ? 'ASIGNADO_COMERCIO' : 'EN_BODEGA',
  assignedStoreName: assignedStoreName || null,
}));
const saved = await this.petTagModel.insertMany(docs);  // 1 round-trip
return saved.map(tag => ({ qrId: tag.idQr, activationPin: tag.activationPin, assignedStoreName: tag.assignedStoreName }));
```

### 4.4 findUserByFavorites (H3)

Opción elegida (paginación en origen, unión aproximada):

```ts
const sort = { isFavorite: -1, updatedAt: -1 };
const [qrFacet, petTagFacet] = await Promise.all([
  this.qrModel.aggregate([
    { $match: qrQuery },
    { $sort: sort },
    { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'v' }] } },
  ]),
  this.petTagModel.aggregate([
    { $match: petTagQuery },
    { $sort: sort },
    { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'v' }] } },
  ]),
]);
// unir, re-ordenar las 2*limit filas en memoria, slice(skip offset dentro de las 2*limit)
```

- Cada colección trae **a lo sumo `limit`** docs (2×limit en total a unir), no la colección completa.
- Índices RF-6 hacen el `$sort` sin escaneo.
- Trade-off: en la unión, el orden global exacto puede desviarse ligeramente entre páginas cuando la página cae en el borde de ambas fuentes (ver §5).
- Alternativa exacta (backlog): keyset por colección con `(isFavorite, updatedAt)` como cursor — documentada, no implementada en esta SPEC.

**Buscar (search)**: reemplazar el `$or` masivo de regex por **índice de texto** en los campos relevantes (`name`, `idQr`, `petData.petName`, …) o limitar campos. Se deja como mejora asociada (RF-7.1, opcional) — no bloquea.

### 4.5 Statistics con $facet (H4)

```ts
// getUserStatistics: 2 consultas totales
const [scanStats] = await this.scanModel.aggregate([
  { $match: { userId } },
  { $facet: {
    total:   [{ $count: 'v' }],
    monthly: [{ $match: { scanDate: { $gte: startOfMonth } } }, { $count: 'v' }],
    daily:   [{ $match: { scanDate: { $gte: startOfDay } } }, { $count: 'v' }],
  }},
]);
const [qrStats] = await this.qrModel.aggregate([
  { $match: { userId } },
  { $facet: { total: [{ $count: 'v' }], active: [{ $match: { active: true } }, { $count: 'v' }] } },
]);
```

`getSystemStatistics`: 3 aggregates (scan, qr, user) con el mismo patrón; `activeUsers` se mantiene como aggregate de `distinct userId` (ya optimizado).

### 4.6 activate/update atómicos (H5/H6)

```ts
// activate — 1 round-trip atómico
const updatedTag = await this.petTagModel.findOneAndUpdate(
  { idQr, activationPin, status: 'RESERVADO' },
  { $set: { status: 'ACTIVO', userId, petData, expiration, commercialStatus: 'VENDIDO' } },
  { new: true },
).lean();

if (!updatedTag) {
  // distinguir causa: findOne({ idQr, activationPin }) → 404 vs 409 (ya activo)
}

// update — 1 round-trip
const tag = await this.petTagModel.findOneAndUpdate(
  { idQr: petTagIdQr, userId: userObjectId },
  { $set: { petData, ...(name !== undefined && { name }), ...(isFavorite !== undefined && { isFavorite }) } },
  { new: true },
).lean();
```

Nota: en `activate`, el caso de fallo reintenta 1 read para distinguir error (solo en la rama de error, no en el camino feliz).

### 4.7 create-user (H7)

- Schema: `email: { unique: true }`, `userName: { unique: true }` (verificar que no existan duplicados antes del deploy — script de migración en backlog).
- `CreateUserUseCase`: eliminar `checkEmailExists`/`checkUserNameExists`; envolver `create` en try/catch y mapear `E11000` → `ConflictException` con mensaje del campo duplicado.
- Generar `verificationCode` antes del `create` e incluir en el documento; `sendVerificationEmail` recibe `resultado.email` directo (sin `getById`).

## 5. Trade-offs

| Decisión | Opciones | Elegida | Razón |
|---|---|---|---|
| Activación batch | (a) `updateMany` batch · (b) `Promise.all` de updates individuales · (c) transacción con session | (a) + await, con log de matchedCount | 1 write, idempotente, sin dependencia de session (el resto del flujo no usa transacciones). (b) arregla el fire-and-forget pero conserva N writes. |
| `activateMany` retorna matchedCount vs lanzar si hay faltantes | Lanzar error vs log | Log + no fatal | QRs inexistentes no deben revertir un pago ya cobrado; la traza registra la discrepancia. |
| Paginación unión QR+pet-tag | (a) paginar en origen (2×limit) · (b) keyset exacto · (c) denormalizar items | (a) ahora, (b) backlog | (a) resuelve el problema de carga con cambio local; (b) es exacto pero más complejo; (c) requiere migración de datos. |
| Conteo con `$facet` vs rollup de contadores | `$facet` vs colección de resumen | `$facet` | Sin infraestructura nueva; el rollup queda como backlog si la colección scan crece mucho. |
| Errores `E11000` vs pre-checks | Índices únicos vs queries previas | Índices únicos | Elimina 2 round-trips por registro y la race condition de doble registro; requiere limpieza de duplicados previa. |
| `findOneAndUpdate` condicional vs validar en JS | Atómico vs 2 round-trips | Atómico | Elimina TOCTOU (doble activación de un pet-tag). |

## 6. Criterios de aceptación

- [ ] **CA-01 (H2)**: Una activación admin de 50 QRs genera **1** `updateMany` (verificar con logs del `TraceService` o perfilado de Mongo); el estado de la activación se guarda después.
- [ ] **CA-02 (H2)**: Una compra Webpay de N QRs queda `PAYED` **y todos** sus QRs `active: true`; si un QR no existe, el resto se activa igual y queda traza de `matchedCount < qrList.length`.
- [ ] **CA-03 (H2)**: Re-procesar el mismo `token_ws` (retry/idempotencia) no duplica activaciones ni errores (el guard `state !== PENDING` sigue funcionando).
- [ ] **CA-04 (H1)**: `POST /pet-tag/admin/generate` con `quantity=100` completa con **1 insert** (log de Mongo / tiempo < 300ms local).
- [ ] **CA-05 (H3)**: `GET /qr/user/favorites` con usuario de 5000 QRs devuelve la página en tiempo constante (sin fetch completo). Comprobable con `explain()`/logs: las queries tienen `limit` aplicado en BD.
- [ ] **CA-06 (H3)**: El orden (favoritos → updatedAt desc) se mantiene dentro de cada página; la paginación no duplica ni pierde ítems en la mayoría de casos (borde documentado en §4.4).
- [ ] **CA-07 (H4)**: `GET /statistics/user` y `GET /statistics/system` devuelven el **mismo contrato** de respuesta con ≤3 queries de agregación por endpoint.
- [ ] **CA-08 (H5)**: Dos `PATCH /pet-tag/activate` concurrentes para el mismo tag: exactamente **1** gana (segundo recibe 409).
- [ ] **CA-09 (H7)**: Registrar usuario duplicado (email o userName) → `409` con mensaje correcto, sin errores 500; registrar usuario nuevo → **1 insert**.
- [ ] **CA-10**: `tsc --noEmit` sin errores nuevos en `backend-portaqr`; suite de tests existente verde; tests nuevos para `activateMany`, `generateBatch` (insertMany), `activate` atómico y `create-user` (E11000).

## 7. No funcionales

- **Latencia**: endpoints de lote pasan de `O(N)` round-trips a `O(1)`.
- **Consistencia**: el flujo Webpay queda ordenado: activación batch → estado PAYED (sin ventanas de "pagado pero inactivo").
- **Concurrencia**: eliminado el TOCTOU de activación de pet-tags.
- **Compatibilidad**: los contratos HTTP (respuesta de `findUserByFavorites`, statistics, generate) no cambian; los cambios son internos (repositorios/use-cases).
- **Mantenibilidad**: los nuevos métodos batch viven en los repositorios con el mismo patrón de traceo (`TraceService.log` con `matchedCount`).

## 8. Plan de implementación y rama

Rama: `feat/spec-007-n-plus-one`. Orden recomendado (desbloquea valor por costo):

1. **P0** H2 — contrato `activateMany` + use-cases con await (Webpay + admin).
2. **P0** H1 — `insertMany` en `generateBatch`.
3. **P1** H5 — `activate` atómico (arregla N+1 + bug de concurrencia).
4. **P1** H3 — paginación en BD + índices + `$facet`.
5. **P2** H6 — `update` con `findOneAndUpdate` + índices.
6. **P2** H4 — `$facet` en statistics.
7. **P3** H7 — índices únicos + refactor `create-user`.

Validación continua: `tsc --noEmit`, `npm test` (unit de repositorios), pruebas manuales con Newman/Postman en los endpoints tocados.

## 9. Trabajo futuro (backlog)

- [ ] Script de deduplicación de `email`/`userName` antes de habilitar índices únicos (H7).
- [ ] Keyset exacto para la unión QR+pet-tag (H3 opción b).
- [ ] Reemplazar búsqueda regex `$or` por índice de texto en QR/pet-tag (H3 RF-7.1).
- [ ] Rollup de contadores de scan (colección de resumen) si `scan` crece (H4).
- [ ] Transacción Mongo (session) para el flujo Webpay completo: commit + activación + estado (elimina la ventana entre writes; hoy mitigada por orden).
- [ ] Verificar en `mongo-qr-activate.repository.ts` `getAll` el `populate('qrList.plan')` (validar planos reales; nota existente de CastError en `qrList.qrCode`).
