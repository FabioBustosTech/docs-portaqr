---
title: "SPEC-013: Índices de texto $text para búsquedas (backend-portaqr)"
date: 2026-08-11
tags:
  - spec
  - backend
  - rendimiento
  - mongodb
  - busqueda
  - text-index
  - backlog
status: borrador
aliases:
  - SPEC-013
  - Índices $text búsqueda
---

# SPEC-013: Índices de texto `$text` para búsquedas (`backend-portaqr`)

> [!abstract] Decisión clave
> Reemplazar la búsqueda por `$regex` (full-collection scan en ~50 campos sin índice) por **índices de texto MongoDB (`$text`)** en las colecciones principales. **Cambio de semántica**: substring match → búsqueda tokenizada con score de relevancia — requiere decisión de producto sobre qué debe encontrar el usuario. Nace del backlog de [[SPEC-008]] (§10): el ReDoS ya se eliminó con `escape-string-regexp`, pero el problema de rendimiento persiste.

> [!info] Metadatos
> - **Estado:** Borrador (pendiente decisión de producto sobre semántica)
> - **Fecha:** 2026-08-11
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-008]] (eliminó ReDoS; este trabajo cierra el problema de rendimiento restante)

---

## 1. Objetivo

Eliminar el **full-collection scan** que hoy hace toda búsqueda `$regex` no anclada (patrón `/término/i` sobre ~50 campos sin índice), usando índices de texto de MongoDB. La búsqueda debe responder en tiempo constante respecto al tamaño de la colección y devolver resultados ordenados por relevancia.

## 2. Contexto

### 2.1 Estado actual (línea base tras SPEC-008)

Todas las búsquedas del monolito usan `$regex` con input escapado (`escapeStringRegexp`, SPEC-008 H3):

| Colección | Campos buscados hoy | Uso |
|---|---|---|
| `qrs` | ~40: `idQr`, `userId`, `typeQr`, `name`, `data.username`, `data.platform`, `data.email`, `data.phone`, `data.message`, `data.petName`, `data.petBreed`, `data.petData.ownerPhone`, `data.latitude`, `data.longitude`, `data.address`, `data.urlList.url`, `data.urlList.typeUrl`, `data.vcard.fn/org/n.firstName/n.lastName/nickname` | `buildSearchConditions` + `findUserByFavorites` (favorites: `qrId`, `activationPin`, `name`, `petData.petName`, `petData.ownerName` de `pettagschemas`) |
| `pettagschemas` | `idQr`, `activationPin`, `petData.petName`, `petData.ownerName` (+ `assignedStoreName` por filtro exacto) | `findReserved` |
| `users` | `userName`, `email` | `getAll` |
| `plans` | `name`, `description`, `typeQr` | `getAll` |
| `qrfreegenerations` | `email`, `information.data` | `getAll` |
| `qractivates` | `descriptionAdministrator`, `WebpayTransaction.id` (+ parse booleano de `sendDocument`) | `getAll` |

**Problema**: `$regex: /término/i` sin anclaje **no puede usar índices** → MongoDB escanea la colección completa por cada búsqueda. Con colecciones grandes (miles de QRs con `data` complejo), cada búsqueda degrada el rendimiento de toda la instancia.

### 2.2 Lo que ya está resuelto (se preserva)

- **ReDoS**: input escapado con `escape-string-regexp` en los 6 repositorios (SPEC-008 H3, CA-02).
- **Límite de longitud**: `@MaxLength(100)` en `PaginationDto.search` y `QueryReservedTagsDto` (SPEC-008 H3).
- **Seguridad**: NoSQL injection bloqueada por DTOs + whitelist + `MongoSanitizeInterceptor` (SPEC-008 H2/H6).

## 3. Cambio de semántica (decisión de producto REQUERIDA)

`$text` **no hace substring match** — tokeniza el contenido e indexa tokens completos:

| Búsqueda | `$regex` (hoy) | `$text` (propuesto) |
|---|---|---|
| `rex` | encuentra `Rex`, `rex-1`, `prex` (substring) | encuentra `Rex` como token (NO `prex`, NO `rex-1`) |
| `ca` | encuentra `casa`, `carpeta` (prefijo) | **NO encuentra nada** (no es token completo) |
| `juan pérez` | substring exacto de la frase | tokens AND: documentos con `juan` Y `pérez` |
| `+web` / `-plan` | no soportado | operadores propios de `$text` (requieren escape propio) |
| Orden | por fecha (`sort createdAt`) | **por score de relevancia** (o sort explícito) |

**Pregunta para el producto**: ¿el usuario espera que "re" encuentre "recepción"? Si sí, `$text` requiere un *text search fallback* (o se mantiene `$regex` para campos cortos tipo `idQr`/`userName` y `$text` solo para texto largo).

### 3.1 Recomendación de alcance (mínima viable)

- **`$text` SOLO para campos de texto largo**: `data.vcard.*`, `data.petName`, `data.address`, `name`, `description`, `petData.*`, `email`, `information.data`, `descriptionAdministrator`.
- **`$regex` anclado al inicio (`^término`) se mantiene para campos de identificación cortos**: `idQr`, `qrId`, `activationPin`, `userId`, `userName`, `WebpayTransaction.id` — donde el usuario escribe el ID exacto o prefijo (el patrón `^` SÍ usa índice regular).
- Esto preserva el comportamiento esperado de "buscar por ID" y mejora el caso de texto libre.

## 4. Solución propuesta

### 4.1 Índices por colección (un `text` index por colección)

```ts
// qr.schema.ts (índice compuesto: text + sort)
qrSchema.index(
  { 'data.vcard.fn': 'text', 'data.vcard.org': 'text', 'name': 'text',
    'data.petName': 'text', 'data.address': 'text', 'data.username': 'text',
    'data.platform': 'text', 'data.email': 'text', 'data.message': 'text',
    'data.urlList.url': 'text' },
  { name: 'search_text', default_language: 'es', weights: { name: 10, 'data.vcard.fn': 5 } },
);
```

- `default_language: 'es'` → stemming español (evita el stemming inglés por defecto).
- **Un solo text index por colección**: los campos no incluidos no serán buscables por `$text` (decisión de qué indexar por colección, ver §3.1).
- Índices en schemas (patrón SPEC-007 RF-6/RF-11: `createIndex` en schema + verificación de existencia).

### 4.2 Repositorios — de `$regex` a `$text`

```ts
// Antes (SPEC-008 H3):
const safe = escapeStringRegexp(search);
{ name: { $regex: safe, $options: 'i' } }

// Después:
{ $text: { $search: sanitizeTextSearch(search), $language: 'es' } }
// + sort: { score: { $meta: 'textScore' } } o sort explícito según UX
```

- `sanitizeTextSearch`: escapa los **operadores de `$text`** (`+ - "`), no los de regex — helper nuevo en `src/common/utils/` con unit tests.
- `$text` **no admite** `$regex` dentro de `$or` combinado con otros operadores de texto: cada query pasa a `{ $and: [ {$text: {...}}, ...filtros exactos ] }`.
- El total de resultados con `countDocuments({ $text })` funciona (soporta text query).

### 4.3 Casos especiales por colección

| Colección | Nota |
|---|---|
| `qrs` | `findUserByFavorites` une `qrs` + `pettagschemas` en `$facet` (SPEC-007 H3): el `$match` de texto debe replicarse por colección con su propio `$text`; el índice de `qrs` debe incluir los campos de pet-tag si se busca unificado |
| `pettagschemas` | `assignedStoreName` es filtro exacto (no search): queda como hoy |
| `qractivates` | el parse booleano de `search` (`sendDocument`) es anterior al `$or` de texto: se preserva |
| `users` | `userName` es identificación → `$regex` anclado; `email` → `$text` o `$regex` anclado (decisión UX) |

## 5. Criterios de aceptación

- [ ] **CA-01**: con 10.000 documentos de prueba en `qrs`, `GET /qr?search=término` responde en **< 100 ms** (medido con profiler, comparado contra línea base `$regex` actual)
- [ ] **CA-02**: la búsqueda no degrada el servidor: `explain()` muestra `stage: TEXT_OR` / índice `search_text` (sin `COLLSCAN`)
- [ ] **CA-03**: semántica documentada y aprobada por producto: qué encuentra `search=re` y `search=rex` en cada colección (ver §3)
- [ ] **CA-04**: búsqueda por ID corto (`idQr`, `qrId`, `activationPin`, `userName`) sigue funcionando por prefijo (índice regular + `$regex` anclado)
- [ ] **CA-05**: los operadores de `$text` no inyectan: `search='+"web" -plan'` no rompe ni altera resultados (escape propio)
- [ ] **CA-06**: suite unit (146+) + suite E2E de búsqueda (favorites-union, admin search) verde con la nueva semántica
- [ ] **CA-07**: `tsc --noEmit` sin errores; eslint sin errores nuevos
- [ ] **CA-08**: índices creados y verificados en dev y en el pipeline de deploy (sin índice en prod = query falla o full scan con warning)

## 6. No funcionales

- **Rendimiento**: `$text` indexado → O(log n) por término vs O(n) hoy; tamaño del índice a medir (pesos y campos largos de `data`).
- **Compatibilidad**: contrato de API sin cambios (misma query `search`); cambia el **orden y contenido de resultados** (score vs fecha) — requiere revisión UX del dashboard.
- **Portabilidad**: patrón estándar MongoDB, aplicable a cualquier colección.
- **Mantenibilidad**: `sanitizeTextSearch` + tabla de campos indexados por colección documentada en el schema.

## 7. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| `$text` para texto largo | Mantener `$regex` (status quo) | Elimina full scan; a cambio cambia semántica (requiere decisión de producto) |
| `$regex ^anclado` para IDs | `$text` también para IDs | El usuario busca IDs exactos/prefijos; `$text` no hace prefijo y tokeniza `rex-1` como `rex` `1` |
| Un índice por colección | Múltiples índices | Mongo permite UN solo text index por colección; hay que elegir campos |
| `default_language: 'es'` | `none` (sin stemming) | Stemming es útil para "correos"/"correo"; `none` si se quiere matching exacto de tokens |
| Orden por score | Orden por fecha (actual) | Relevancia > recencia para búsqueda; se puede combinar con `sort: { score: { $meta } }` |
| Atlas Search (Lucene) | `$text` nativo | `$text` es gratis y suficiente; Atlas Search solo si se necesitan synonyms/fuzzy (fuera de alcance) |

## 8. Plan de implementación (estimación)

1. **Decisión de producto** sobre semántica (§3) + elección de campos por colección — 1 sesión
2. Índices en schemas (`qrs`, `pettagschemas`, `users`, `plans`, `qrfreegenerations`, `qractivates`) — 1h
3. Helper `sanitizeTextSearch` + unit tests — 30 min
4. Migrar repositorios a `$text` + ajustar `$facet` de favorites — 2-3h
5. Seed de 10k documentos de prueba + medición de CAs 01-02 — 1h
6. Ajuste de E2E de búsqueda + validación final (CA-06/07/08) — 1-2h

## 9. Trabajo futuro (backlog)

- [ ] Evaluar Atlas Search (synonyms, fuzzy, autocomplete) si la búsqueda se vuelve feature de producto
- [ ] Autocomplete/suggestions en el input de búsqueda del dashboard (fuera de alcance)

## 10. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-11 | Equipo | Borrador inicial — documenta el backlog de SPEC-008 §10 (índices `$text`): línea base de `$regex` post-hardening, cambio de semántica (decisión de producto pendiente), índices propuestos por colección, CAs medibles y plan |
