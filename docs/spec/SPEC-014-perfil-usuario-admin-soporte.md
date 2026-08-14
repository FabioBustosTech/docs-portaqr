---
title: "SPEC-014: Perfil de usuario para admin + activación/desactivación de QRs (soporte)"
date: 2026-08-13
tags:
  - spec
  - seguridad
  - frontend
  - backend
  - admin
  - soporte
status: implementado
aliases:
  - SPEC-014
  - perfil usuario admin soporte
---

# SPEC-014: Perfil de usuario para admin + activación/desactivación de QRs (soporte)

> [!abstract] Decisión clave
> El admin necesita una **experiencia de soporte 100% admin** (NO impersonación): entrar al perfil de un usuario, ver sus datos y gestionar sus QRs (activar/desactivar). La impersonación fue descartada por el usuario (2026-08-13): se diseña una **vista admin de perfil** que combina (1) datos del usuario, (2) estadísticas, y (3) gestión de sus QRs con acciones admin. El backend ya tiene casi todo (`GET /users/:id` admin, `GET /qr/user/favorites` admin con userId, flujo de activación admin con plan/carrito) — **el único trabajo nuevo de backend es el endpoint de DESACTIVACIÓN de QRs** (`POST /admin/qr/:id/deactivate`), que hoy no existe (`activateMany` solo activa). Se endurece además un **IDOR latente**: `GET /statistics/user/:userId` está `@Roles('admin','user')` (cualquier autenticado ve stats de cualquiera) → pasa a admin-only.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-13
> - **Componente destino:** `desarrollo-qr/backend-portaqr/` (módulo qr, módulo statistics), `desarrollo-qr/qr-app/` (dashboard/users)
> - **Rama:** `feat/spec-014-perfil-usuario-admin`
> - **Origen:** Requerimiento del usuario (2026-08-13): soporte rápido — ver datos del usuario y activar/desactivar sus QRs. Verificado que la vista de QRs del usuario YA existe y funciona; lo que falta es la vista de perfil + desactivación. Relacionada con [[SPEC-013]] (página users), [[SPEC-009]] (ownership checks, `assertOwnerOrAdmin`), [[SPEC-007]] (activateMany batch).

---

## 1. Objetivo

1. Que el admin pueda **abrir el perfil de cualquier usuario** desde `/dashboard/users` y ver sus datos completos (nombre, userName, email, rol, verificación, estado, fechas) + estadísticas (total de QRs, activos/inactivos).
2. Que desde ese perfil el admin **gestione los QRs del usuario**: verlos, crear para el usuario, activarlos (flujo existente con plan) y **desactivarlos** (nuevo).
3. Que la **desactivación** sea una operación admin-only, auditable y sin efecto sobre el historial de pagos/activaciones (snapshot inmutable, SPEC-009 B12).
4. **Sin impersonación**: el admin opera con su propia sesión y rol — la vista es para él, no una emulación del dashboard del usuario.
5. **Cerrar el IDOR** de `GET /statistics/user/:userId` (hoy accesible por cualquier rol autenticado).

### 1.1 Out of scope

- **NO** se implementa impersonación / "ver como" (descartada por el usuario — esta SPEC la reemplaza).
- **NO** se cambia el flujo de activación admin existente (`/dashboard/admin/qr/activate` + carrito) — se reutiliza tal cual.
- **NO** se tocan pagos ni reembolsos: desactivar un QR no revierte ni cancela transacciones Webpay.
- **NO** se modifica `bff-service` (deprecado, SPEC-001).
- **NO** se agrega auditoría en Mongo (solo logs TraceService).
- `PATCH /qr/:id` existente **no** se extiende para `active` (la activación/desactivación va por endpoints dedicados — decisión SPEC-009: los estados transaccionales no viven en DTOs de edición).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Backend (monolito `backend-portaqr`)**

- **RF-1 (desactivar QR)**. `POST /admin/qr/:id/deactivate` — `@Roles('admin')`. Body: `{ reason: string }` (**obligatorio**, 5–500 chars — el motivo de la desactivación, simétrico al `descriptionAdministrator` de la activación). Valida `ObjectId` (400 si inválido) y que el QR exista (404). Ejecuta `$set: { active: false, expiration: null, deactivatedAt: <now>, deactivatedBy: <adminId>, deactivationReason: <reason> }` sobre el QR. Respuesta `{ success: true, idQr }`. Log de auditoría con adminId + idQr + reason (`sanitizeForLog`, SPEC-009 A13). **No** toca `qractivates` ni `transactions` (historial intacto). Al reactivar (flujo existente), los campos de desactivación se limpian.
- **RF-1b (schema QR)**. `qr.schema.ts`: 3 campos nuevos opcionales — `deactivatedAt?: Date`, `deactivatedBy?: string`, `deactivationReason?: string`. El mapper (`qr-mongo.mapper.ts`) los expone en la entidad para la UI (tooltip con el motivo).
- **RF-2 (endurecer stats — owner-or-admin)**. `GET /statistics/user/:userId` — pasa de `@Roles('admin','user')` **sin ownership check** (IDOR: cualquier autenticado ve stats de cualquiera) a **owner-or-admin** (patrón SPEC-009): el usuario `user` solo ve SUS propias stats (`userId === actor.id`, el dashboard propio lo necesita → 200), un userId ajeno → 403; admin → cualquier usuario. ⚠️ Se descartó admin-only: el dashboard del usuario común usa este endpoint para sus stats (verificado en `dashboard/page.tsx:44` — rompía la home del user).
- **RF-3**. **Verificación sin cambios**: `GET /users/:id` ya es owner-or-admin (SPEC-009) → admin obtiene el perfil de cualquier usuario. `GET /qr/user/favorites?userId=` ya usa `targetUserId` solo si `role==='admin'` (SPEC-008/009) → admin obtiene los QRs del usuario. Flujo de activación admin (`POST /qr-activate` con `methodActivation=ADMIN`) ya es admin-safe (userId del body solo para admin, snapshot de precio del plan).

**Bloque B — Frontend (`qr-app`)**

- **RF-4 (perfil del usuario)**. Nueva página `/dashboard/users/[userIdClient]` (landing al clickear un usuario en `/dashboard/users`): header con datos del usuario (firstName, apellidos, @userName, email, rol, email verificado ✓/✗, activo/inactivo, creado, último acceso) + tarjetas de estadísticas (total QRs, activos, inactivos) + botón "Volver a usuarios".
- **RF-5 (gestión de QRs integrada)**. La página de perfil incluye el grid de QRs del usuario (reutilizando `QrGrid` admin existente, como en `/dashboard/users/[userIdClient]/qr`) con acciones admin: Crear QR (para el usuario), Activar (flujo existente con plan), **Desactivar (nuevo)**, Editar, Eliminar, Favoritos. La ruta actual `/dashboard/users/[userIdClient]/qr` se mantiene (redirige a la nueva página o se integra en ella — decisión de implementación: unificar en `/dashboard/users/[userIdClient]` y que `/qr` redirija).
- **RF-6 (botón Desactivar + motivo)**. En `QrCard` (modo admin), cuando el QR está **activo** se muestra botón "Desactivar" (rojo) que abre un **diálogo con campo de texto obligatorio** ("¿Desactivar este QR? Indica el motivo:") — botón confirmar deshabilitado hasta escribir motivo (≥5 chars). Al confirmar → `POST /api/admin/qr/[id]/deactivate` con `{ reason }` → refresca el grid + toast. Cuando el QR está **inactivo y tiene `deactivationReason`**, la card muestra el motivo **solo al admin** (tooltip/inline: "Desactivado: <motivo> — <fecha>") para trazabilidad (RN-3c).
- **RF-7 (API route Next)**. Nueva `POST /api/admin/qr/[id]/deactivate` — proxy al monolito con el token del admin (admin-only; 401 sin sesión / 403 si rol != admin, patrón `adminGuardError` de SPEC-013).
- **RF-8 (stats en frontend)**. `userService.getUserStats(userId)` (o nuevo método en el servicio) → `GET /api/statistics/user/[id]` → monolito. Solo visible para admin (el API route Next valida rol).

### 2.2 Reglas de negocio

- **RN-1**. Desactivar QR: solo admin. Un usuario `user` jamás desactiva QRs (ni los suyos — eso es el flujo de "no renovar", fuera de alcance).
- **RN-1b**. **Motivo obligatorio**: no se puede desactivar sin indicar el porqué (validación backend + frontend). El motivo queda persistido en el QR (`deactivationReason` + `deactivatedAt` + `deactivatedBy`) para trazabilidad, igual que la activación guarda `descriptionAdministrator`.
- **RN-2**. Desactivar **no** borra el QR ni sus escaneos históricos — solo `active: false` + `expiration: null`. El QR sigue visible en el grid (marcado Inactivo) y puede reactivarse con el flujo de activación.
- **RN-3**. El historial de activaciones/pagos (qractivates, transactions) queda **intacto** al desactivar (snapshot inmutable).
- **RN-3b (estado público — decisión usuario 2026-08-13)**. Un QR desactivado por admin **se comporta públicamente IGUAL que uno nunca activado**: `active: false` → la página pública `/qr/[id]` muestra el mismo mensaje genérico actual ("El propietario de este QR no lo ha activado o la suscripción ha expirado."). **NO se distingue públicamente el estado de desactivación** (sin 410, sin mensaje especial, sin exponer el motivo). `get-public-qr.usecase.ts` no cambia.
- **RN-3c (motivo solo admin — decisión usuario 2026-08-13)**. `deactivationReason`/`deactivatedBy`/`deactivatedAt` son **internos**: solo visibles en el panel admin (perfil del usuario / card del QR). Nunca se exponen en respuestas públicas (`GET /qr/public/:id`, página `/qr/[id]`).
- **RN-4**. La vista de perfil y sus datos son **admin-only** — el endpoint `GET /users/:id` ya lo garantiza en el monolito; el API route Next de stats valida rol admin (RF-8).

### 2.3 Criterios de aceptación (CA)

- **CA-01**: admin → `POST /admin/qr/:id/deactivate` (QR activo, body `{ reason: "cliente no renovó" }`) → 200, `active: false`, `expiration: null`, `deactivatedAt`/`deactivatedBy`/`deactivationReason` persistidos en BD (verificación con query directa o E2E).
- **CA-01b**: body sin `reason` o con `reason` < 5 chars → 400. Reactivar el QR → campos de desactivación limpiados.
- **CA-02**: `ObjectId` inválido → 400; QR inexistente → 404.
- **CA-03**: rol `user` → `POST /admin/qr/:id/deactivate` → 403. Sin token → 401.
- **CA-04**: el QR desactivado sigue en el listado del usuario (marcado Inactivo) y su historial de escaneos/activaciones no se borra. **Públicamente se comporta igual que uno no activado**: `GET /qr/public/:id` → 404 "QR inactivo" (sin exponer motivo — RN-3b/RN-3c).
- **CA-05**: `GET /statistics/user/:userId` — rol `user` con **userId ajeno** → **403** (IDOR cerrado); rol `user` con **su propio userId** → 200 (dashboard propio no roto); rol `admin` con cualquier userId → 200. API route Next idem.
- **CA-06**: admin abre `/dashboard/users` → click en usuario → **página de perfil** con sus datos (nombre, email, rol, verificado, fechas) + stats (total/activos/inactivos) + grid de QRs.
- **CA-07**: desde el perfil, el admin puede **Activar** un QR inactivo (flujo con plan → carrito → activación 201, verificado en baseline) y **Desactivar** un QR activo (confirmación → 200 → grid muestra Inactivo).
- **CA-08**: rol `user` → `GET /api/admin/qr/[id]/deactivate` → 403; `GET /api/statistics/user/[id]` → 403.
- **CA-09**: botón "Volver a usuarios" regresa a la lista paginada (SPEC-013 sin regresión).
- **CA-10**: `tsc --noEmit`, `lint`, `build` y suites de tests verdes (unit + E2E) en qr-app y backend-portaqr.

---

## 3. Baseline del problema (verificado 2026-08-13)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| `/dashboard/users` (admin) | ✅ Lista paginada + búsqueda + filtro rol (SPEC-013) | Igual |
| Click en usuario | ✅ Redirige a `/dashboard/users/[userIdClient]/qr` (grid QRs admin) | Redirige a **perfil del usuario** (nuevo) con datos + stats + QRs |
| Datos del usuario en la vista | ❌ No se muestran (solo "Gestión de QRs") | ✅ Header con datos + stats |
| Activación de QRs como admin | ✅ Existe (QrCard → `/dashboard/admin/qr/activate?id=&userIdClient=` → plan → carrito → 201) — verificado end-to-end en navegador | Igual |
| **Desactivación de QRs** | ❌ **No existe en el backend** (`activateMany` solo activa; `PATCH /qr/:id` no expone `active`) | ✅ `POST /admin/qr/:id/deactivate` |
| `GET /statistics/user/:userId` | ⚠️ `@Roles('admin','user')` — **IDOR**: cualquier autenticado ve stats de cualquiera | ✅ admin-only |
| Impersonación / "ver como" | ❌ Eliminada en SPEC-009 (IDOR) | **Descartada por diseño** — se reemplaza por vista admin de perfil |

### 3.1 Hallazgos de la investigación (2026-08-13)

1. **La vista de gestión de QRs del usuario YA existe y funciona** (`/dashboard/users/[userIdClient]/qr`: `QrGrid` admin + `CreateQrForm` con userId + botón "Activar" → flujo de carrito admin verificado en navegador con activación exitosa 201). No se reescribe — se **unifica** dentro de la nueva página de perfil.
2. **El backend no tiene desactivación**: `mongo-qr.repository.activateMany` (L147-177) hace `$set: { active: true, expiration }`; no existe `deactivate` ni endpoint. Es el único gap de backend real.
3. **`GET /statistics/user/:userId` es un IDOR latente**: `@Roles('admin','user')` en `statistics.controller.ts:23-24` — cualquier usuario autenticado consulta stats de cualquier otro. SPEC-009 lo omitió. Se endurece en esta SPEC (CA-05).
4. **Todo lo demás ya está listo**: `GET /users/:id` owner-or-admin (SPEC-009), `GET /qr/user/favorites?userId=` admin-only efectivo (mongo-qr.repository.ts:251), `POST /qr-activate` admin-safe (SPEC-009 B12: snapshot de precio, userId solo para admin).

---

## 4. Diseño Técnico

### 4.1 Contratos de API

```
POST /admin/qr/:id/deactivate          (monolito, @Roles('admin'))  [NUEVO]
  body: { reason: string }   // OBLIGATORIO, 5-500 chars (motivo de la desactivación)
  → 200 { success: true, idQr }
  → 400 ObjectId inválido | reason faltante/inválido | 404 QR no existe | 401 sin token | 403 rol != admin
  Efecto: $set { active: false, expiration: null, deactivatedAt: <now>,
                 deactivatedBy: <adminId>, deactivationReason: <reason> }
         — sin tocar qractivates/transactions
  Log: { adminId, idQr, reason } vía sanitizeForLog

GET /statistics/user/:userId            (monolito)  [ENDURECIDO]
  @Roles('admin','user') → @Roles('admin')
  → 200 UserStatistics { qrs: { total, active }, users: {...} } | 403 rol user

POST /api/admin/qr/[id]/deactivate      (API route Next)  [NUEVO]
  → proxy al monolito + validación 401/403 (adminGuardError, patrón SPEC-013)

GET /api/statistics/user/[id]           (API route Next)  [NUEVO]
  → proxy al monolito + validación 401/403 (admin-only)
```

### 4.2 Flujo de datos

```
/dashboard/users (admin) → click usuario
  → /dashboard/users/[userIdClient]  (NUEVA página de perfil)
      ├─ userService.getUser(id)            → GET /api/users/[id] (owner-or-admin ya) → datos
      ├─ userService.getUserStats(id)       → GET /api/statistics/user/[id] (NUEVO, admin-only) → stats
      └─ qrService.getMyQrsPaginated(page, limit, search, userIdClient) → GET /api/qr?userIdClient= → grid admin (existente)
            ├─ QrCard inactivo → [Activar]  → /dashboard/admin/qr/activate?id=&userIdClient= (existente)
            └─ QrCard activo   → [Desactivar] → POST /api/admin/qr/[id]/deactivate (NUEVO)
                                                   → monolito POST /admin/qr/:id/deactivate
                                                   → refresh grid → toast éxito
```

### 4.3 Archivos por capa

**Backend (`backend-portaqr`):**

| Archivo | Cambio |
| --- | --- |
| `src/modules/qr/presentation/controllers/qr.controller.ts` | `POST /admin/qr/:id/deactivate` (`@Roles('admin')`, ObjectId, body `{ reason }` validado con DTO, 404, log) |
| `src/modules/qr/application/use-cases/deactivate-qr.usecase.ts` | **Nuevo**: `execute(id, reason, actor, tracking)` → valida existencia + delega al repo |
| `src/modules/qr/domain/ports/queries/qr.port.ts` | `ICanUpdateQr.deactivate(id, reason, actor, tracking)` |
| `src/modules/qr/infrastructure/repository/mongo/mongo-qr.repository.ts` | `deactivate(id, reason, actor)`: `findOneAndUpdate({ idQr }, { $set: { active: false, expiration: null, deactivatedAt: new Date(), deactivatedBy: actor.id, deactivationReason: reason } })` |
| `src/modules/qr/infrastructure/repository/mongo/schemas/qr.schema.ts` | Campos nuevos: `deactivatedAt?`, `deactivatedBy?`, `deactivationReason?` (RF-1b) |
| `src/modules/qr/infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts` | Exponer los 3 campos nuevos en la entidad |
| `src/modules/qr/infrastructure/adapters/QrRepositoryAdapter.ts` | Propagar `deactivate` |
| `src/modules/statistics/presentation/controllers/statistics.controller.ts:24` | `@Roles('admin','user')` → `@Roles('admin')` |
| Tests | spec del nuevo usecase + repository + controller; ajustar spec de statistics (rol user → 403) |

**Frontend (`qr-app`):**

| Archivo | Cambio |
| --- | --- |
| `src/app/dashboard/users/[userIdClient]/page.tsx` | **Nueva**: página de perfil (header datos + stats + grid QRs + volver) |
| `src/app/dashboard/users/page.tsx:20-22` | `redirectToUser` → `/dashboard/users/${userIdClient}` (antes `/qr`) |
| `src/app/dashboard/users/[userIdClient]/qr/page.tsx` | Redirige a `../` (unificación) o se integra — decisión de implementación |
| `src/app/api/admin/qr/[id]/deactivate/route.ts` | **Nuevo** (RF-7, adminGuardError) |
| `src/app/api/statistics/user/[id]/route.ts` | **Nuevo** (RF-8, admin-only) |
| `src/services/qr.service.ts` | `deactivateQr(id)` |
| `src/services/user.service.ts` | `getUserStats(userId)` |
| `src/components/qr/QrCard.tsx` | Botón **Desactivar** si `isQrActive(qr) && isAdmin` + diálogo de confirmación |
| `src/components/dashboard/UserProfileHeader.tsx` | **Nuevo** (o inline): header de datos del usuario |
| `src/components/dashboard/UserStatsCards.tsx` | **Nuevo** (o inline): tarjetas total/activos/inactivos |

### 4.4 Seguridad

| Aspecto | Mitigación |
| --- | --- |
| Desactivar es admin-only | `@Roles('admin')` en el monolito + 401/403 en el API route Next (doble capa, patrón SPEC-013) |
| IDOR stats | `GET /statistics/user/:userId` → admin-only (CA-05) |
| Datos del perfil | `GET /users/:id` ya aplica `assertOwnerOrAdmin` (SPEC-009) — el admin es el único rol ajeno con acceso |
| QRs del usuario | `GET /qr/user/favorites?userId=` solo usa el userId param si `role==='admin'` (verificado en mongo-qr.repository.ts:251) |
| Desactivar no afecta pagos | Sin tocar `qractivates`/`transactions`; snapshot inmutable (SPEC-009 B12) |
| Auditoría | Logs con `sanitizeForLog` (adminId + idQr) en el usecase/controller |

---

## 5. Trade-offs

| Decisión | Alternativa | Motivo |
| --- | --- | --- |
| **Página de perfil unificada** (datos + stats + QRs) | Páginas separadas (perfil / QRs) | El caso de uso es soporte: el admin necesita contexto del usuario y sus QRs en una sola vista; menos navegación. |
| **Endpoint dedicado `POST /admin/qr/:id/deactivate`** | Extender `PATCH /qr/:id` para aceptar `active` | SPEC-009: los estados transaccionales no deben vivir en DTOs de edición genéricos (frágil, mezcla conceptos). Endpoint dedicado = intención explícita + rol admin + auditoría. |
| **Desactivar no toca qractivates** | Marcar la activación vigente como cancelada | Menor alcance; el historial de pagos es snapshot inmutable (SPEC-009 B12). Si se necesita "cancelar activación", es SPEC aparte (afecta facturación). |
| **Stats admin-only** | Owner-or-admin | El dashboard del usuario usa sus propios endpoints (scan/qr); no hay caso de uso legítimo para que un user consulte stats ajenas. Cierra el IDOR sin romper nada (CA-05 verificado). |
| **Sin impersonación** | Token de impersonación (diseño previo descartado) | **Decisión del usuario (2026-08-13)**: no quiere la experiencia del usuario; quiere una experiencia admin. Menos superficie de ataque, sin tokens especiales, sin banner, sin excepciones de autorización. |

---

## 6. Plan de implementación

1. **Tarea 1** — Rama `feat/spec-014-perfil-usuario-admin` en backend-portaqr y qr-app.
2. **Tarea 2 (backend)** — `deactivate` en repo + adapter + port; `DeactivateQrUseCase`; `POST /admin/qr/:id/deactivate` en controller; endurecer `GET /statistics/user/:userId` a admin-only. Unit tests (CA-01..05).
3. **Tarea 3 (frontend API)** — API routes `deactivate` y `statistics/user/[id]` (adminGuardError); `qrService.deactivateQr`; `userService.getUserStats`. Unit tests.
4. **Tarea 4 (frontend UI)** — Página de perfil `/dashboard/users/[userIdClient]` (header + stats + grid QRs); actualizar `redirectToUser`; botón Desactivar en `QrCard` con confirmación; redirección de `/qr` vieja. Unit tests.
5. **Tarea 5 (validación)** — `tsc --noEmit`, `lint`, `build` en ambos; suites unit; E2E nuevo spec (perfil admin: datos + stats + desactivar 200/403 + stats 403 rol user). Suite completa verde.
6. **Tarea 6 (cierre)** — SPEC a `implementado`, tareas done, commits y merges, ADR de la decisión (endpoint de desactivación vs. PATCH).

---

## 7. Riesgos y notas

- **Regresión en `/dashboard/users`**: `redirectToUser` cambia el destino del click (de `/qr` a perfil) — los E2E de SPEC-013 (users-pagination) que clickean usuario y esperan el grid deben ajustarse a la nueva URL.
- **La vista `/dashboard/users/[userIdClient]/qr`**: se unifica en el perfil; la ruta antigua redirige (evita links muertos en favoritos/back-forward).
- **Desactivar un QR activo no reembolsa**: documentar en la UI del diálogo de confirmación ("El historial de pagos no se modifica").
- **E2E**: fixture admin existente (`baseline-c01@test.cl`) + user de prueba; verificar stats 403 con token de rol `user` (patrón SPEC-009).
- **Documentar ADR**: "desactivación de QR como endpoint dedicado admin-only" (patrón de estados transaccionales fuera de DTOs genéricos).

---

## 8. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-08-13 | **SPEC creada v1** (borrador): impersonación segura con token dedicado — descartada por el usuario en discusión. |
| 2026-08-13 | **SPEC reescrita v2**: enfoque final del usuario — experiencia admin (NO impersonación): perfil de usuario + gestión de QRs con activación existente y desactivación nueva. Hallazgos: desactivación no existe en backend (único gap), stats de usuario es IDOR latente (endurecer), vista de QRs ya existe (unificar). |
| 2026-08-13 | **Motivo de desactivación** (RF-1/RF-1b/RF-6/RN-1b/CA-01b): `{ reason }` obligatorio (5-500 chars) + campos `deactivatedAt`/`deactivatedBy`/`deactivationReason` en el QR — simétrico al `descriptionAdministrator` de la activación. |
| 2026-08-13 | **Estado público** (RN-3b/RN-3c, decisión usuario verificando en navegador el QR desactivado): un QR desactivado por admin **se comporta públicamente igual que uno no activado** (mismo mensaje genérico, `get-public-qr.usecase` sin cambios). El motivo es **solo admin** — nunca en respuestas públicas. Se eliminó la propuesta de tercer estado público (410/mensaje especial). |
| 2026-08-13 | **RF-2 → owner-or-admin** (corrección post-E2E): se descartó admin-only porque rompía el dashboard del usuario común (`dashboard/page.tsx:44` usa `getUserStatistics(user.id)` para sus stats). Queda: user → solo sus stats (200), ajenas → 403; admin → cualquiera. |
| 2026-08-13 | **Layout botones QrCard**: `flex justify-end space-x-2` (igual producción) cuando ≤3 botones; `grid grid-cols-2` cuando 4 (admin + QR activo con Desactivar). Verificado vs producción (3 botones con texto en 1 línea). |
| 2026-08-13 | **Bug de UUID**: se quitó la validación `isValidObjectId` del endpoint deactivate (el QR se busca por `idQr` UUID v4, no por `_id` — igual que findOne/update/delete). |
| 2026-08-13 | **Bug de refresh**: `handleQrUpdated` de la página de perfil pasa a solo-recargar (patrón `dashboard/qr/page.tsx`) — antes llamaba `updateQr('a', ...)` con id ficticio → error al desactivar. |
| 2026-08-13 | **Implementada**: backend (desactivación + owner-or-admin stats, 1213 tests), frontend (perfil + botón Desactivar + API routes, 72 tests), E2E (3 specs nuevos, suite completa 78/78). Verificación navegador: perfil con datos/stats/grid, desactivación end-to-end con motivo persistido en BD, edición sin regresión. |
