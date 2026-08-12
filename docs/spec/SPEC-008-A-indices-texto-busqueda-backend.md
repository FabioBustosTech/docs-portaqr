---
title: "SPEC-008-A: Índices de texto $text para búsquedas (backend-portaqr) — spec hija de SPEC-008"
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
  - SPEC-008-A
  - Índices $text búsqueda
parent: SPEC-008
---

# SPEC-008-A: Índices de texto `$text` para búsquedas (`backend-portaqr`)

> [!abstract] Decisión clave
> **EVALUADA — NO ACCIONABLE HOY (medición CA-00, 2026-08-11)**: con los volúmenes reales (648 `qrs`, 762 `users`, 171 `pettagschemas`), las 5 búsquedas del frontend responden en **0-2 ms** (objetivo: < 100 ms). El full-collection scan existe pero es despreciable a este tamaño → **no se cambia nada** (la opción A `$text` puro rompería la UX del frontend; los índices de las opciones C/D no justifican su costo para ahorrar 1 ms). La spec queda como referencia de decisión para reabrir cuando las colecciones crezcan (ver §4.1).

> [!info] Metadatos
> - **Estado:** Evaluada — no accionable hoy (medición CA-00)
> - **Fecha:** 2026-08-11
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-008]] (eliminó ReDoS; este trabajo cierra el problema de rendimiento restante)

---

## 1. Objetivo

Eliminar el **full-collection scan** que hoy hace toda búsqueda `$regex` no anclada, **sin romper la experiencia de búsqueda que el frontend ya ofrece a los usuarios**. La búsqueda debe responder rápido y seguir encontrando lo que el usuario espera.

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

**Problema**: `$regex: /término/i` sin anclaje **no puede usar índices** → escaneo completo por búsqueda.

> [!warning] Paso 0 obligatorio — MEDIR antes de decidir
> **HECHO (2026-08-11, datos reales vía mongosh contra `sistema` en dev)**:
>
> | Colección | Docs | Búsqueda medida (query real del backend) | Tiempo | Docs examinados |
> |---|---|---|---|---|
> | `qrs` | 648 | `$or` 15 campos `$regex` + sort createdAt (dashboard QR) — `search=hola` | **1 ms** | 648 (full scan) |
> | `qrs` | 648 | idem — `search=a` (match amplio) | **1 ms** | 648 |
> | `pettagschemas` | 171 | `$or` 4 campos (admin pet-tag) — `search=123` | **0 ms** | — |
> | `users` | 762 | `$or` userName+email — `search=a` | **2 ms** | 760 |
> | `plans` | 2 | `$or` 3 campos | **0 ms** | 2 |
>
> **Conclusión**: tiempos 0-2 ms vs. objetivo < 100 ms → el full scan NO es un problema a estos volúmenes. Decisión: **no accionable hoy**; reabrir cuando las colecciones superen ~10-20k docs (el costo del `$or` de 15 regex crece linealmente; a 100k docs se estima 100-200 ms).

### 2.2 Lo que ya está resuelto (se preserva)

- **ReDoS**: input escapado con `escape-string-regexp` en los 6 repositorios (SPEC-008 H3, CA-02).
- **Límite de longitud**: `@MaxLength(100)` en `PaginationDto.search` y `QueryReservedTagsDto` (SPEC-008 H3).
- **Seguridad**: NoSQL injection bloqueada por DTOs + whitelist + `MongoSanitizeInterceptor` (SPEC-008 H2/H6).

## 3. Impacto en el frontend (la otra mitad de la película)

Análisis de `qr-app` completado el 2026-08-11 — **todos los buscadores del frontend dependen de la semántica substring actual**:

### 3.1 Inventario de buscadores reales

| Buscador | Página | Qué busca el usuario hoy | Campos visibles | Dependencia de substring |
|---|---|---|---|---|
| **Mis Códigos QR** | `/dashboard/qr` | su QR por lo que recuerda: nombre, tipo, contenido (vcard, pet, red social…) | `QrCard` (nombre, tipo) | **ALTA**: escribe prefijos y fragmentos ("pla" para "Playa", "qr" para "QR 1") |
| **QRs de cliente** | `/dashboard/users/[id]/qr` | idem (admin) | idem | ALTA (idem) |
| **Placas (pet-tag)** | `/dashboard/admin/pet-tag` | **PINs parciales** ("123" para "12345"), idQr, nombre mascota, dueño | tabla (PIN, idQr, mascota) | **CRÍTICA**: buscar por fragmento de PIN es el caso de uso principal |
| **Planes** | `/dashboard/plan` | nombre de plan | tabla | MEDIA |
| **Activaciones** | `/dashboard/admin/qr/email` (y activate) | token Webpay (largo), descripción admin, bool `sendDocument` | tabla | MEDIA (tokens largos, pero se tipean parciales) |

### 3.2 Regresiones concretas si se migra a `$text` puro

| Caso real de usuario | Hoy (`$regex`) | Con `$text` | Impacto |
|---|---|---|---|
| Buscar `qr` (nombres tipo "QR 1", "QR casa") | ✅ encuentra | ❌ **tokens < 3 chars se ignoran** | Rojo |
| Buscar `pla` (prefijo de "Playa") | ✅ encuentra | ❌ solo matchea el token completo "playa" | Rojo |
| Buscar `123` (PIN parcial) | ✅ encuentra "12345" | ❌ no matchea token "12345" | Rojo (admin pet-tag) |
| Buscar `jua` (prefijo de "Juan") | ✅ encuentra | ❌ | Rojo |
| Buscar `hola mundo` | ✅ substring de la frase | ✅ tokens AND (documentos con ambos) | Ámbar (puede dar menos resultados) |
| Orden de resultados | `createdAt desc` / `isFavorite+updatedAt` (SPEC-007 RF-6) | score por defecto | Ámbar (UX cambia: "Mis Códigos QR" ya no muestra los nuevos primero) |
| Búsqueda con guiones/IDs UUID | `idQr` parcial "89302960" ✅ | tokenización rompe el UUID en fragmentos | Rojo |

**Conclusión del análisis**: migrar la búsqueda a `$text` puro rompe el caso de uso principal del producto (encontrar el QR propio por nombre/fragmento) y el buscador de placas por PIN. **No es aceptable sin mecanismo de compatibilidad.**

### 3.3 Orden de resultados que el frontend espera (sorts actuales del backend)

| Endpoint | Sort actual | Con `$text` |
|---|---|---|
| `GET /qr` (admin, findAll) | `updatedAt desc` (L50) | requiere `$sort: { score: { $meta: 'textScore' } }` o mantener sort → pierde relevancia |
| `GET /qr/user/:id/paginated` (dashboard) | `createdAt desc` (L208) | idem |
| `GET /qr/user/favorites` | `isFavorite desc, updatedAt desc` (L318, RF-6) + re-sort en memoria | idem — además el `$facet` por colección complica el `$text` |

El frontend no controla el orden: **cualquier cambio de sort se ve directamente en el grid del dashboard**.

## 4. Opciones consideradas (con el impacto FE en la mesa)

| Opción | Cómo funciona | Semántica FE | Rendimiento | Esfuerzo | Veredicto |
|---|---|---|---|---|---|
| **A. `$text` puro** | tokenizado, score | ❌ rompe prefijos/IDs/términos cortos | ✅ O(log n) | medio | ❌ No viable solo |
| **B. Híbrido: `$text` + fallback `$regex`** | `$text` primero; si 0 resultados → `$regex` actual | ✅ compatible (fallback preserva todo) | ⚠️ el fallback es full scan, pero solo cuando `$text` no encuentra nada | medio | ⚠️ Mitiga pero el fallback se dispara justo en los casos frecuentes (términos cortos) |
| **C. Híbrido por campo: `$regex ^` con índices regulares + `$text` para texto largo** | `name`/`idQr`/`userName`/`PIN` con índice + `^anclado` (usa índice, mantiene prefijo); vcard/petData/descripciones con `$text` | ✅ prefijos de los campos calientes funcionan; ❌ substring en medio de palabra ("re" en "recepción" — caso raro en la práctica) | ✅ índices para los campos calientes; `$text` para el resto | alto | ✅ **La mejor relación** |
| **D. Status quo + índices regulares parciales** | mantener `$regex`, añadir índices en `name` y usar `^` donde el usuario escribe prefijos | ✅ 100% compatible | ⚠️ texto libre sigue full scan | bajo | ⚠️ Mejora sin riesgo; suficiente si la medición del paso 0 muestra tiempos aceptables |
| **E. Atlas Search (Lucene)** | autocomplete, fuzzy, synonyms | ✅ puede replicar substring | ✅ | pago + infra | Fuera de alcance (evaluar si la búsqueda se vuelve feature) |

### 4.1 Recomendación (depende del paso 0)

- **Si la medición muestra tiempos aceptables** (< 100ms con datos reales): opción **D** (índices parciales + `^` en campos calientes) — cero riesgo de UX, mejora los casos más usados.
- **Si la medición muestra tiempos malos**: opción **C** (híbrido por campo) — preserva prefijos en los campos que la gente usa (nombre, ID, PIN) y usa `$text` solo para texto largo, con `default_language: 'es'` y `$sort` explícito para no romper el orden del dashboard.
- **Nunca**: opción A (A $text puro) sin fallback — rompe el buscador de placas por PIN y la búsqueda por prefijo del dashboard.

## 5. Criterios de aceptación

- [x] **CA-00 (paso 0)**: medición documentada — 648 `qrs` / 762 `users` / 171 `pettagschemas` / 43 `qractivates` / 2 `plans` / 3 `qrfreegenerations`; búsquedas reales **0-2 ms** (stage SUBPLAN/FETCH con full scan); decisión: **no accionable hoy**
- [ ] **CA-01**: *(no aplica — se cierra sin cambios; reactivar si se reabre la SPEC)*: con datos reales, la búsqueda que elige producto responde en **< 100 ms** (o igual a la línea base si la opción es D) con `explain()` sin `COLLSCAN` en los campos con índice
- [ ] **CA-02 (UX, crítico)**: `search=qr` y `search=123` (PIN parcial) **siguen devolviendo resultados** en el frontend (dashboard QR y admin pet-tag) — sin regresión de semántica *(se preserva por diseño: no se cambia nada)*
- [ ] **CA-03**: `search=pla` (prefijo) encuentra "Playa" (dashboard QR) — sin regresión de prefijo *(idem)*
- [ ] **CA-04**: el orden del dashboard no cambia: "Mis Códigos QR" mantiene `createdAt desc` y favorites mantiene `isFavorite+updatedAt` (SPEC-007 RF-6) *(idem)*
- [ ] **CA-05**: los operadores de `$text` no inyectan (`+"web" -plan`) — escape propio si se usa `$text` *(no aplica hoy)*
- [ ] **CA-06**: suite unit (146+) + suite E2E de búsqueda (favorites-union, admin search, pet-tag PIN) verde *(sin cambios de código, se mantiene)*
- [ ] **CA-07**: `tsc --noEmit` sin errores; eslint sin errores nuevos *(sin cambios de código)*
- [ ] **CA-08**: índices creados y verificados en dev y deploy *(no aplica — no se crean índices)*

## 6. No funcionales

- **Rendimiento**: objetivo < 100ms con datos reales (CA-01); medición del paso 0 como línea base.
- **Compatibilidad**: contrato de API sin cambios; **semántica y orden preservados por diseño** (CAs 02-04) — el frontend NO requiere cambios.
- **Mantenibilidad**: la decisión por campo (tabla §2.1) documentada en el schema; helper `sanitizeTextSearch` con unit tests si se usa `$text`.
- **Costos**: opción D ≈ 0 (solo índices); opción C requiere índice text + ajuste de repos.

## 7. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| Medir primero (paso 0) | Implementar `$text` directamente | El análisis FE muestra regresiones de UX serias; sin medición no hay justificación para cambiar semántica |
| Preservar substring/prefijo | Aceptar tokenización | El caso de uso real del producto (encontrar tu QR, buscar PIN parcial) depende de substring |
| `$regex ^` + índice regular para campos calientes | `$text` para todo | `^anclado` usa índice y mantiene prefijos — el patrón que los usuarios usan de verdad |
| Un text index por colección | Varios | Mongo permite UNO solo; la opción C limita `$text` a texto largo y deja IDs en `$regex` |
| Orden explícito (`$sort`) al usar `$text` | Sort por score | No romper "Mis Códigos QR" (CA-04) |
| Atlas Search | `$text` nativo | Solo si la búsqueda se vuelve feature (fuzzy/autocomplete) — fuera de alcance |

## 8. Plan de implementación (estimación)

1. **Paso 0 — medición** (datos reales): contar docs por colección, `explain()` de las 5 búsquedas, decisión documentada — 1h
2. (Si aplica) **Opción D**: índices regulares en `name`/`idQr`/`userName`/`activationPin` + anclar `$regex` a `^` en los campos con índice — 1-2h
3. (Si aplica) **Opción C**: `sanitizeTextSearch` + índices text + migrar texto largo a `$text` con `$sort` explícito + `$facet` de favorites — 3-4h
4. Validación: E2E de búsqueda + CAs 00-08 + actualizar SPEC — 1h

## 9. Trabajo futuro (backlog)

- [ ] Evaluar Atlas Search (synonyms, fuzzy, autocomplete) si la búsqueda se vuelve feature de producto
- [ ] Autocomplete/suggestions en el input "Buscar..." del dashboard (fuera de alcance)

## 10. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-11 | Equipo | Borrador inicial — documenta el backlog de SPEC-008 §10: línea base `$regex` post-hardening, CAs medibles y plan |
| 2026-08-11 | Equipo | **Revisión con impacto en frontend** (análisis de `qr-app`): inventario de los 5 buscadores reales (dashboard QR, QRs de cliente, placas por PIN, planes, activaciones); regresiones concretas de `$text` puro (términos < 3 chars, prefijos, PIN parcial, IDs UUID, orden de resultados); **paso 0 obligatorio de medición**; 5 opciones evaluadas con veredicto (A `$text` puro ❌, B fallback ⚠️, C híbrido por campo ✅, D índices parciales ⚠️ según medición, E Atlas fuera); CAs revisados con foco en NO romper UX (02-04) |
| 2026-08-11 | Equipo | **Paso 0 ejecutado — EVALUADA, NO ACCIONABLE HOY** (CA-00): medición con datos reales vía mongosh (648 `qrs`, 762 `users`, 171 `pettagschemas`, 43 `qractivates`, 2 `plans`, 3 `qrfreegenerations`): las 5 búsquedas del frontend con las queries exactas del backend responden en **0-2 ms** (stage SUBPLAN/FETCH, full scan sobre 648-760 docs). Objetivo era < 100 ms → el problema no existe a estos volúmenes. **No se cambia código**: ni `$text` (rompería UX del frontend) ni índices (opciones C/D no justifican su costo para ahorrar 1 ms). La UX del dashboard queda intacta (sin regresión de semántica ni orden — CAs 02-04 preservados por diseño). **Condición de reapertura**: colecciones > ~10-20k docs (costo lineal del `$or` de 15 regex; a 100k se estima 100-200 ms) → aplicar opción C híbrida. Tareas 8-9 completadas, 10-12 canceladas (no aplican) |
