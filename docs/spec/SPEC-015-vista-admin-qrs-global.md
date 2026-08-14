---
title: "SPEC-015: Vista global de QRs para admin (todos los QRs del sistema)"
date: 2026-08-14
tags:
  - spec
  - frontend
  - backend
  - admin
  - qr
status: implementado
aliases:
  - SPEC-015
  - vista admin qrs global
---

# SPEC-015: Vista global de QRs para admin (todos los QRs del sistema)

> [!abstract] Decisión clave
> El admin necesita una **vista global de todos los QRs** (de todos los usuarios) sin tener que navegar por `/dashboard/users/[userIdClient]` (SPEC-014, requiere conocer el ID del usuario). La vista es una **tabla densa** con: QR, usuario dueño, estado, tipo, contenido resumido y acciones (Editar / Ver perfil del usuario / Desactivar / Stats / Eliminar). **Búsqueda** por id del QR, **datos internos del QR** (URL, texto, vcard, wifi, pet, name, description) y **tipo de QR**. **Filtros** por usuario dueño, por estado (activo/inactivo/desactivado) y por tipo de QR. El backend **ya tiene** `GET /qr` admin paginado+búsqueda (`findAllWithSearch`) — el trabajo backend es **extenderlo**: (1) resolver el **usuario dueño** por QR con un lookup batch contra `users` (sin N+1), (2) **ampliar la búsqueda** a todos los datos internos del QR + nombre/email del usuario, (3) agregar **filtros** por estado (`active`), tipo (`type`) y usuario (`userId`). El frontend necesita: API route `GET /api/admin/qr` + página `dashboard/admin/qrs` con tabla reutilizando componentes existentes (PaginationNav, ItemsPerPageSelect, diálogo de desactivación de SPEC-014).

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-14
> - **Componente destino:** `desarrollo-qr/backend-portaqr/` (módulo qr), `desarrollo-qr/qr-app/` (dashboard/admin + servicios + API route)
> - **Rama:** `feat/spec-015-vista-admin-qrs`
> - **Origen:** Requerimiento del usuario (2026-08-14): "ver todos los qr, a qué usuario pertenecen, el estado del qr, qué contenido tiene, poder modificarlo — sin tener que saber cuál es el usuario". Relacionada con [[SPEC-014]] (perfil usuario admin), [[SPEC-013]] (paginación users), [[SPEC-007]] (optimización N+1, $facet), [[SPEC-008]] (validación query DTOs, sanitización búsqueda).

---

## 1. Objetivo

1. Que el admin vea **todos los QRs del sistema en una sola vista**, paginada, con búsqueda y filtros, sin depender del ID del usuario.
2. Que cada fila muestre: **el usuario dueño** (nombre completo + @userName + email), **estado** (activo / inactivo / desactivado por admin), **tipo de QR**, **contenido resumido** (URL/texto/lista/vcard según tipo) y fecha de actualización.
3. Que el admin pueda **modificar el contenido** del QR desde la tabla (editar), **ver el perfil del usuario dueño**, **desactivar** con motivo (SPEC-014), **ver stats** y **eliminar**.
4. Que la **búsqueda** cubra: **id del QR**, **datos internos del QR** (URL principal, texto, vcard, wifi, pet, name, description, items de lista…) **y tipo de QR** (texto libre), además del **usuario dueño** (buscar "juan" → QRs de Juan).
5. Que los **filtros** permitan acotar por: **usuario dueño** (Select de usuarios), **estado** (todos/activos/inactivos/desactivados) y **tipo de QR** (Select con enum).

### 1.1 Out of scope

- **NO** se cambia el flujo de activación admin (`/dashboard/admin/qr/activate` + carrito) — se reutiliza.
- **NO** se tocan los endpoints de edición/borrado existentes (`PATCH /qr/:id`, `DELETE /qr/:id`) — se reutilizan tal cual (el admin ya puede editar cualquier QR: el repo no valida ownership).
- **NO** se incluyen Pet Tags en esta vista (tienen su propia gestión en `/dashboard/admin/pet-tag`).
- **NO** se implementa impersonación ni acciones masivas (batch) — solo acciones por fila.
- **NO** se modifica `bff-service` (deprecado, SPEC-001).
- **NO** se toca la autorización de `PATCH/DELETE /qr/:id` — **ya está protegido** (SPEC-009): check `isAdmin || isOwner` en el controller del monolito (`qr.controller.ts` L536-548 y L663-675) con `ForbiddenException` 403, cubierto por tests (`qr.controller.spec.ts`: "403: rechaza a un usuario NO propietario (y no admin)").

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Backend (monolito `backend-portaqr`)**

- **RF-1 (lookup de usuario dueño)**. `GET /qr` (admin, `findAllWithSearch`) → cada item devuelve un campo nuevo `user?: { firstName, paternalLastName, maternalLastName, userName, email } | null` resuelto contra la colección `users` por `userId`. **Sin N+1**: lookup batch en una sola consulta agregada. Si el usuario no existe o fue borrado → `user: null` (la fila muestra "Usuario eliminado").
- **RF-2 (búsqueda por id, datos internos, tipo y usuario dueño)**. El término `search` matchea contra:
  - **id del QR**: `idQr` (ya existe).
  - **tipo de QR**: `typeQr` (ya existe — buscar "whatsapp" o "list").
  - **datos internos** (ampliar `buildSearchConditions`): `data.url` (URL principal), `data.text`, `data.whatsappUrl`, `data.emailUrl`, `data.phoneUrl`, `data.wifiData.ssid`, `data.petData.petName`, `data.petData.ownerName`, `name` (nombre del QR), `description`, además de los existentes (`data.urlList.url`, `data.urlList.typeUrl`, vcard fn/org/n/nickname, `data.username`/`platform`, `data.email`, `data.phone`, `data.message`, `data.petName`/`petBreed`/`ownerPhone`, `data.latitude`/`longitude`/`address`).
  - **usuario dueño**: `user.firstName`, `user.paternalLastName`, `user.userName`, `user.email` (tras el `$lookup`/`$unwind`).
  - Mantiene el límite de 100 chars y el escape regex de SPEC-008 H3 (anti-ReDoS).
- **RF-3 (filtro por estado)**. Query param `active?: 'all' | 'active' | 'inactive' | 'deactivated'` (default `all`):
  - `active` → `{ active: true }`
  - `inactive` → `{ active: false, deactivatedAt: { $exists: false } }`
  - `deactivated` → `{ deactivatedAt: { $exists: true } }`
  - `all` → sin filtro
  - Validado con DTO (`@IsIn`), patrón SPEC-008 H5.
- **RF-3b (filtro por tipo de QR)**. Query param `type?: QrType` (enum: dynamic, static, whatsapp, email, call, wifi, texto, list, vcard, pet, phone, map) → `$match { typeQr: type }`. Validado con `@IsEnum(QrType)` → 400 si inválido.
- **RF-3c (filtro por usuario dueño)**. Query param `userId?: string` (ObjectId) → `$match { userId }` exacto. Validado con `@IsMongoId` → 400 si inválido. Combo: si hay `search` + `userId`, ambos se combinan con `$and` (filtro por usuario + búsqueda dentro de sus QRs).
- **RF-4 (paginación intacta)**. `page`/`limit`/`search` se comportan igual que hoy (SPEC-008 H5: PaginationDto con IsInt/Min/Max). El response sigue `{ data, pagination }` con `totalPages/hasNextPage/hasPrevPage`. Los filtros (`active`/`type`/`userId`) afectan `total` y la paginación (paginación en origen).

**Bloque B — Frontend (`qr-app`)**

- **RF-5 (API route Next admin)**. Nueva `GET /api/admin/qr` — proxy al monolito `GET /qr` pasando `page/limit/search/active/type/userId`, admin-only (401 sin sesión / 403 rol != admin, patrón `adminGuardError` SPEC-013). Mapea `{ items, pagination }` al formato del frontend.
- **RF-6 (método de servicio)**. `qrService.getAllQrsPaginated(page, limit, search, active, type, userId)` → `GET /api/admin/qr?page=&limit=&search=&active=&type=&userId=` → `PaginatedResponse<QrResponseAdmin>` donde `QrResponseAdmin = QrResponse & { user?: { firstName, paternalLastName, maternalLastName, userName, email } | null }`.
- **RF-7 (página de tabla)**. Nueva página `/dashboard/admin/qrs` (admin-only) con:
  - Header "Todos los QRs" + contador total.
  - Barra de filtros: **búsqueda** (debounce 500ms, patrón SPEC-013; busca id QR, datos internos, tipo, usuario dueño), **filtro por usuario** (Select de usuarios, poblado con `userService.getUsers(1, 100, '', 'all')` — admin-only; "Todos los usuarios" por defecto), **filtro por estado** (Select: Todos/Activos/Inactivos/Desactivados), **filtro por tipo de QR** (Select con enum: dynamic/static/whatsapp/email/call/wifi/texto/list/vcard/pet/phone/map; "Todos los tipos" por defecto) + `ItemsPerPageSelect`.
  - **Tabla** (desktop) con columnas: **QR** (nombre + tipo + idQr corto), **Usuario dueño** (nombre completo, @userName, email — clickable → perfil), **Estado** (badge Activo/Inactivo/Desactivado + tooltip con motivo si desactivado, admin-only SPEC-014), **Contenido** (resumen según tipo: URL, texto, N items de lista, nombre vCard, etc.), **Actualizado** (fecha), **Acciones** (Editar / Perfil / Stats / Desactivar / Eliminar).
  - `PaginationNav` (reutilizado, SPEC-013).
  - La URL es la fuente de verdad: `?page=1&itemsPerPage=10&search=&active=all&type=&userId=` (patrón dashboard/qr y SPEC-013/014).
- **RF-8 (acciones por fila)**:
  - **Editar** → `/dashboard/qr/edit/[id]` (formulario existente `EditQrForm`).
  - **Perfil** → `/dashboard/users/[userId]` (perfil del dueño, SPEC-014).
  - **Stats** → `/dashboard/qr/stats/[id]` (página existente).
  - **Desactivar** → reutiliza el diálogo de SPEC-014 (`POST /api/admin/qr/[id]/deactivate` con motivo obligatorio) — extraerlo a componente compartido `DeactivateQrDialog` si está inline en QrCard.
  - **Eliminar** → `DELETE /api/qr?id=` (flujo existente) con confirmación.
- **RF-9 (sidebar)**. Nuevo item admin "Todos los QRs" → `/dashboard/admin/qrs` (icono QrCodeIcon, `showFor: ['admin']`) en `components/dashboard/Sidebar.tsx`.

### 2.2 Reglas de negocio

- **RN-1**. La vista y sus datos son **admin-only** (doble capa: `@Roles('admin')` en el monolito + `adminGuardError` en la API route Next).
- **RN-2**. Editar/eliminar/desactivar usan los endpoints existentes con su autorización actual (admin y user pueden editar — el admin ya puede editar QRs ajenos hoy; sin cambios de autorización en esta SPEC).
- **RN-3**. El estado "Desactivado" es un sub-estado de inactivo: `active: false` + `deactivatedAt` presente (SPEC-014). El motivo se muestra solo al admin.
- **RN-4**. Los datos del usuario dueño mostrados son los mismos que expone `GET /users/:id` a admin (nombre, userName, email) — sin datos sensibles adicionales.
- **RN-5**. Un QR cuyo dueño fue eliminado se muestra igual (con `user: null`) y las acciones de perfil se deshabilitan. El filtro por usuario (`userId`) no lo puede seleccionar un admin vía Select si el usuario no existe en `users` (coherencia: se filtran los QRs de usuarios existentes).
- **RN-6**. Los filtros se **combinan** con `$and` (estado + tipo + usuario + búsqueda) — no son excluyentes. La búsqueda libre es un `$or` interno sobre los campos del QR + usuario.

### 2.3 Criterios de aceptación (CA)

- **CA-01**: admin → `GET /qr?page=1&limit=10&active=all` → 200 `{ data: [{ idQr, ..., user: { firstName, userName, email } }], pagination }`; cada item trae el usuario dueño resuelto.
- **CA-02**: búsqueda por **id del QR** (`search=<idQr>`), por **tipo** (`search=whatsapp`), por **datos internos** (`search=juanperez.com` → `data.url`; `search=texto libre` → `data.text`; `search=nombre vcard` → `data.vcard.fn`; `search=Mi QR` → `name`) y por **usuario dueño** (`search=juan` → firstName/userName/email) → 200 con resultados correctos. `search` con regex especial (`.`, `$`) → escapado sin error (SPEC-008 H3).
- **CA-03**: `GET /qr?active=deactivated` → solo QRs con `deactivatedAt`; `active=inactive` → QRs con `active: false` sin `deactivatedAt`; `active=active` → `active: true`. Valor inválido (`active=foo`) → 400.
- **CA-03b**: `GET /qr?type=whatsapp` → solo QRs tipo whatsapp; `type=foo` → 400. `GET /qr?userId=<ObjectId válido>` → solo QRs de ese usuario; `userId=abc` (no ObjectId) → 400.
- **CA-03c**: filtros combinados: `GET /qr?userId=X&active=active&type=list` → QRs del usuario X, activos y tipo list. `search` + filtros → búsqueda dentro del subconjunto filtrado.
- **CA-04**: `GET /api/admin/qr` sin token → 401; rol `user` → 403; rol `admin` → 200 proxy al monolito con el formato `{ items, pagination }` (pasa active/type/userId).
- **CA-05**: `/dashboard/admin/qrs` muestra tabla con columnas QR/Usuario/Estado/Contenido/Actualizado/Acciones; paginación, búsqueda (debounce) y filtros (usuario/estado/tipo) funcionan y sincronizan la URL (`?page=&itemsPerPage=&search=&active=&type=&userId=`).
- **CA-05b**: el Select de usuarios se puebla con los usuarios del sistema (admin); seleccionar uno filtra los QRs de ese usuario.
- **CA-06**: desde la tabla, admin → Editar abre el editor del QR y persiste cambios; Perfil abre `/dashboard/users/[userId]`; Stats abre stats del QR; Desactivar pide motivo y desactiva (200, badge cambia a Desactivado); Eliminar confirma y remueve la fila.
- **CA-07**: rol `user` no ve el item del sidebar ni la ruta (redirect/403).
- **CA-08**: QR con usuario borrado → fila visible con "Usuario eliminado" y perfil deshabilitado.
- **CA-09**: `tsc --noEmit`, `lint`, `build` y suites de tests verdes (unit + E2E) en qr-app y backend-portaqr. Sin regresión en SPEC-013/014 (users, perfil, desactivación).

---

## 3. Baseline del problema (verificado 2026-08-14)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| `GET /qr` (monolito :3004) | ✅ Existe, `@Roles('admin')`, paginado + búsqueda (`findAllWithSearch`, repo L71-109) | Igual + `user` en cada item + búsqueda ampliada + filtros active/type/userId |
| Datos del usuario dueño en QR | ❌ Solo `userId` (string) — no hay nombre/email | ✅ `user: { firstName, ..., email }` |
| Búsqueda por datos internos | ⚠️ Parcial: idQr, typeQr, urlList, vcard, username/platform, email/phone/message, petName/petBreed/ownerPhone, lat/long/address | ✅ Ampliar: `data.url`, `data.text`, `data.whatsappUrl`, `data.emailUrl`, `data.phoneUrl`, `data.wifiData.ssid`, `data.petData.petName`/`ownerName`, `name`, `description` |
| Búsqueda por nombre/email de usuario | ❌ No existe | ✅ Incluye nombre/userName/email del dueño |
| Filtro por estado | ❌ No existe | ✅ `active=all/active/inactive/deactivated` |
| Filtro por tipo de QR | ❌ No existe | ✅ `type=<QrType>` (enum validado) |
| Filtro por usuario dueño | ❌ No existe | ✅ `userId=<ObjectId>` (validado) |
| API route Next admin GET de QRs | ❌ Solo existe `POST /api/admin/qr/[id]/deactivate` (SPEC-014) | ✅ `GET /api/admin/qr` proxy |
| Vista global de QRs | ❌ No existe (solo per-user: `/dashboard/users/[id]`) | ✅ `/dashboard/admin/qrs` tabla |
| Edición de QR | ✅ `PATCH /qr/:id` con **ownership check** (isAdmin \|\| isOwner, SPEC-009) + `EditQrForm` en `/dashboard/qr/edit/[id]` | Reutilizar tal cual |
| Desactivación con motivo | ✅ SPEC-014 (diálogo en QrCard) | Reutilizar (extraer diálogo si hace falta) |
| Sidebar admin | ✅ Usuarios / Pet Tags / Plan / emails | + "Todos los QRs" |

### 3.1 Hallazgos de la investigación (2026-08-14)

1. **El endpoint global ya existe**: `GET /qr` en el monolito llama a `GetAllQrUseCase.execute(page, limit, search)` → `mongo-qr.repository.findAllWithSearch` (L71-109): `find(query).skip().limit()` + `countDocuments`, mapper `QrMongoMapper.toEntity`. Solo falta: resolver dueño, ampliar search, filtros.
2. **`qr.userId` es string** (qr.schema.ts L89), mientras `users._id` es ObjectId — el lookup requiere conversión (`$toObjectId`/`$convert`) o query batch separada. El repo ya usa el patrón `$facet` para paginar en origen (findUserByFavorites L353+, SPEC-007 H3): conviene reescribir `findAllWithSearch` como **aggregate con `$lookup` + `$facet`** para mantener el N+1=0 en una sola query.
3. **`buildSearchConditions`** (L442-509) construye el `$or` con `safeSearch` (escape regex) sobre: idQr, userId, typeQr, urlList.url/typeUrl, vcard (fn/org/n/nickname) y typeConditions por tipo (social/email/whatsapp/pet/phone/map con data.username/platform/email/phone/message/petName/petBreed/ownerPhone/lat/long/address). **Faltan** los campos planos del schema moderno: `data.url`, `data.text`, `data.whatsappUrl`, `data.emailUrl`, `data.phoneUrl`, `data.wifiData.ssid`, `data.petData.*`, `name`, `description`. Con aggregate conviene aplicar el `$match` **después** del `$unwind` de users (los campos `userInfo.*` ya están disponibles) o un `$or` con subquery de userIds.
4. **El frontend tiene todo lo reusable**: `PaginationNav`, `ItemsPerPageSelect` (SPEC-013), patrón de URL como fuente de verdad (SPEC-013/014), diálogo de desactivación (SPEC-014 en QrCard), `EditQrForm`, páginas de stats, `adminGuardError`. Para el Select de usuarios: `userService.getUsers(page, limit, search, role)` ya existe (admin-only en backend `GET /users` L198-199 y `GET /users/paginated` L183-184).
5. **`GET /api/qr` (route handler existente) es engañoso**: apunta a `qr/user/favorites` (QRs de un usuario), NO a todos. Por eso se crea `GET /api/admin/qr` nuevo en vez de reusarlo.
6. **Sin N+1**: resolver el dueño en el backend (1 query) en vez de `getUserById` por QR desde el frontend (N llamadas por página — descartado).
7. **Autorización de edición/borrado ya cerrada (SPEC-009)**: `PATCH /qr/:id` y `DELETE /qr/:id` validan `isAdmin || isOwner` en el controller del monolito con `ForbiddenException` (verificado en `qr.controller.ts` L536-548 / L663-675 + tests). El admin puede editar cualquier QR (por diseño); un rol `user` solo los suyos.
8. **Enum `QrType`** (create-qr.dto.ts): dynamic, static, whatsapp, email, call, wifi, texto, list, vcard, pet, phone, map — se reutiliza para el filtro `type` y el Select del frontend.

---

## 4. Diseño Técnico

### 4.1 Contratos de API

```
GET /qr?page=1&limit=10&search=&active=all&type=&userId=   (monolito :3004, @Roles('admin'))  [EXTENDIDO]
  → 200 {
      data: [{
        idQr, name?, typeQr, active, createdAt, updatedAt, data: {...},
        deactivatedAt?, deactivatedBy?, deactivationReason?,
        user: { firstName, paternalLastName, maternalLastName, userName, email } | null   // NUEVO
      }],
      pagination: { total, totalPages, currentPage, limit, hasNextPage, hasPrevPage }
    }
  → 400 active/type/userId inválidos | 401 sin token | 403 rol != admin
  NUEVOS query params:
    active: 'all'|'active'|'inactive'|'deactivated'   (default 'all', @IsIn)
    type:   QrType (dynamic|static|whatsapp|email|call|wifi|texto|list|vcard|pet|phone|map) (@IsEnum)
    userId: ObjectId del dueño (@IsMongoId)
  search: búsqueda libre sobre idQr, typeQr, datos internos (data.url, data.text,
          data.whatsappUrl, data.emailUrl, data.phoneUrl, data.wifiData.ssid,
          data.petData.*, data.urlList.*, data.vcard.*, name, description...) y
          usuario dueño (firstName, paternalLastName, userName, email)
  Los filtros se combinan con $and; la búsqueda libre es $or interno.

GET /api/admin/qr?page=&limit=&search=&active=&type=&userId=  (API route Next)  [NUEVO]
  → proxy al monolito + adminGuardError (401/403)
  → 200 { items: [...], pagination: { total, currentPage, limit, totalPages } }
```

### 4.2 Flujo de datos

```
Sidebar → "Todos los QRs" → /dashboard/admin/qrs?page=1&itemsPerPage=10&search=&active=all&type=&userId=
  ├─ qrService.getAllQrsPaginated(page, limit, search, active, type, userId)   [NUEVO]
  │     └─ GET /api/admin/qr?page=&limit=&search=&active=&type=&userId=        [NUEVO, adminGuardError]
  │           └─ GET http://localhost:3004/qr?...                              [EXTENDIDO]
  │                 └─ aggregate: $match(filtros) → $match(search) → $convert userId → $lookup users → $unwind → $facet(paginar)
  │                      └─ { data: [{ ..., user: {...} }], pagination }
  │
  ├─ Select de usuarios (filtro) → userService.getUsers(1, 100, '', 'all') → GET /api/users (existente admin)
  │
  └─ Tabla (QrsAdminTable)
        ├─ Editar     → /dashboard/qr/edit/[id]            (existente)
        ├─ Perfil     → /dashboard/users/[userId]          (existente SPEC-014)
        ├─ Stats      → /dashboard/qr/stats/[id]           (existente)
        ├─ Desactivar → DeactivateQrDialog → POST /api/admin/qr/[id]/deactivate  (existente SPEC-014)
        └─ Eliminar   → confirm → DELETE /api/qr?id=       (existente)
```

### 4.3 Archivos por capa

**Backend (`backend-portaqr`):**

| Archivo | Cambio |
| --- | --- |
| `src/modules/qr/application/dto/admin-qrs-query.dto.ts` | **Nuevo** `AdminQrsQueryDto extends PaginationDto` con `active?: 'all'\|'active'\|'inactive'\|'deactivated'` (`@IsIn`), `type?: QrType` (`@IsEnum`), `userId?: string` (`@IsMongoId`) |
| `src/modules/qr/application/use-cases/get-all-qr.usecase.ts` | `execute(page, limit, search, active, type, userId, tracking)` |
| `src/modules/qr/domain/ports/queries/qr.port.ts` | `ICanGetAllQr.findAllWithSearch(page, limit, search, active, type, userId, tracking)` |
| `src/modules/qr/infrastructure/repository/mongo/mongo-qr.repository.ts` | Reescribir `findAllWithSearch` como **aggregate**: `$match` (estado `active` + `typeQr` + `userId` combinados con `$and`) → `$match` (search ampliado QR + `userInfo.*` tras `$unwind`) → `$addFields: { userIdObj: { $convert: { input: '$userId', to: 'objectId', onError: null } } }` → `$lookup { from: 'users', localField: 'userIdObj', foreignField: '_id', as: 'userInfo' }` → `$unwind { preserveNullAndEmptyArrays: true }` → `$facet` (data sort/skip/limit + count). **Ampliar `buildSearchConditions`**: añadir `data.url`, `data.text`, `data.whatsappUrl`, `data.emailUrl`, `data.phoneUrl`, `data.wifiData.ssid`, `data.petData.petName`, `data.petData.ownerName`, `name`, `description` al `$or`. Mapper expone `user` (o null). |
| `src/modules/qr/presentation/controllers/qr.controller.ts` | `findAll` usa `AdminQrsQueryDto` y pasa `active/type/userId` al usecase |
| `src/modules/qr/infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts` | Campo `user?` en la entidad (o mapeo en repo, si el mapper no conoce userInfo) |
| Tests | spec del repo (lookup, filtros, search ampliado), usecase, controller (CA-01..03c) |

**Frontend (`qr-app`):**

| Archivo | Cambio |
| --- | --- |
| `src/app/api/admin/qr/route.ts` | **Nuevo** GET proxy (RF-5, adminGuardError, pasa active/type/userId, mapeo `{ items, pagination }`) |
| `src/services/qr.service.ts` | `getAllQrsPaginated(page, limit, search, active, type, userId)` (RF-6) |
| `src/interfaces/qr.ts` | `QrResponseAdmin = QrResponse & { user?: AdminQrOwner \| null }` + `AdminQrOwner` (RF-6) |
| `src/app/dashboard/admin/qrs/page.tsx` | **Nueva** página tabla (RF-7) con Suspense + estado URL (patrón SPEC-013/014): search, active, type, userId |
| `src/components/admin/QrsAdminTable.tsx` | **Nuevo** (o inline): tabla con columnas + badges de estado + resumen de contenido por tipo + acciones (RF-8) |
| `src/components/admin/QrFilters.tsx` | **Nuevo** (o inline): barra de filtros — búsqueda + Select usuario (poblado con `userService.getUsers`) + Select estado + Select tipo + ItemsPerPageSelect (RF-7) |
| `src/components/qr/DeactivateQrDialog.tsx` | **Nuevo** (extraer de QrCard si está inline — reutilizar en tabla; QrCard pasa a usarlo también) |
| `src/components/dashboard/Sidebar.tsx` | Item "Todos los QRs" (RF-9) |
| `src/lib/format.ts` o helper | `getQrContentSummary(qr)` — resumen de contenido por typeQr (RF-7) |
| Tests | unit de API route (401/403/200), servicio, página/componentes (CA-04..08) |

### 4.4 Seguridad

| Aspecto | Mitigación |
| --- | --- |
| Vista admin-only | `@Roles('admin')` monolito + `adminGuardError` API route Next (doble capa, patrón SPEC-013) |
| Búsqueda segura | Reutilizar `safeSearch` (escape regex, SPEC-008 H3) + `MaxLength(100)` |
| Filtro validado | `AdminQrsQueryDto` con `@IsIn` → 400 en valores inválidos (patrón SPEC-008 H5) |
| Sin fuga de datos sensibles | Solo nombre/userName/email del dueño (mismos campos que `GET /users/:id` admin) |
| Lookup sin N+1 | Aggregate única con `$lookup` + `$facet` (no N llamadas) |
| `userId` string → ObjectId | `$convert` con `onError: null` (QRs con userId no-ObjectId → `user: null`, no revienta el pipeline) |

---

## 5. Trade-offs

| Decisión | Alternativa | Motivo |
| --- | --- | --- |
| **Extender `GET /qr` existente** | Endpoint nuevo `GET /qr/admin/all` | No duplicar lógica; el endpoint ya es admin-only y paginado; el lookup y filtros son aditivos. Riesgo de regresión mitigado con tests del repo. |
| **Resolución de dueño en backend (aggregate)** | Frontend resuelve con `getUserById` por QR | **N+1 catastrófico** (10-50 llamadas/página). El aggregate con `$lookup` mantiene N+1=0 en una query (patrón SPEC-007). |
| **`$convert` en aggregate** | Guardar userId como ObjectId en QR | Migración de datos + tocar schema/creación = alto riesgo para un beneficio marginal; `$convert` con `onError: null` es aditivo y tolerante a datos viejos. |
| **Tabla densa** | Grid de cards (QrGrid) | La vista de gestión global necesita densidad (muchos QRs, escaneo rápido de dueño/estado). El grid se queda para las vistas por-usuario. |
| **Filtro de estado en el mismo endpoint** | Filtro client-side | Consistencia con paginación en origen: el filtro debe afectar `total` y la paginación — imposible bien client-side. |
| **Acciones por fila (5 botones)** | Dropdown "..." | 5 acciones explícitas = descubribilidad; la tabla tiene espacio horizontal. Si se aprieta, dropdown es refactor menor. |

---

## 6. Plan de implementación

1. **Tarea 1** — Rama `feat/spec-015-vista-admin-qrs` en backend-portaqr y qr-app.
2. **Tarea 2 (backend)** — `AdminQrsQueryDto` (active + type + userId); reescribir `findAllWithSearch` como aggregate con `$lookup` users + `$unwind` + filtros `$and` (estado/tipo/usuario) + search ampliado (datos internos + dueño) + `$facet`; controller pasa los 3 filtros. Unit tests (CA-01..03c).
3. **Tarea 3 (frontend API)** — `GET /api/admin/qr` (adminGuardError, pasa active/type/userId); `qrService.getAllQrsPaginated`; tipos `QrResponseAdmin`/`AdminQrOwner`. Unit tests (CA-04).
4. **Tarea 4 (frontend UI)** — Página `/dashboard/admin/qrs` con tabla (columnas, badges, resumen contenido, acciones), barra de filtros (búsqueda debounce + Select usuario + Select estado + Select tipo + ItemsPerPageSelect), `PaginationNav`; extraer `DeactivateQrDialog`; item en Sidebar. Unit tests (CA-05..08).
5. **Tarea 5 (validación)** — `tsc --noEmit`, `lint`, `build` en ambos; suites unit; E2E nuevo spec (admin tabla: paginación, búsqueda por id/datos internos/tipo/usuario, filtros combinados, editar, desactivar, perfil). Suite completa verde + regresión SPEC-013/014.
6. **Tarea 6 (cierre)** — SPEC a `implementado`, tareas done, commits y merges.

---

## 7. Riesgos y notas

- **Regresión en `GET /qr`**: hoy `findAll` no tiene consumidores frontend activos (el route handler `/api/qr` usa `user/favorites`) — riesgo bajo, pero el aggregate debe preservar el contrato `{ data, pagination }` exacto (mismos campos + `user`).
- **`$convert` y datos sucios**: QRs con `userId` no-ObjectId o users borrados → `user: null` (fila "Usuario eliminado"), nunca 500.
- **Rendimiento**: `$lookup` sobre `users._id` (indexado por defecto) + `$facet` paginando en origen — mismo patrón ya usado en `findUserByFavorites` (SPEC-007 H3). Verificar con volúmenes reales si el search por `userInfo.*` degrada (evaluar índice textual si hace falta — fuera de alcance).
- **Autorización de edición/borrado (verificado, NO es riesgo)**: `PATCH/DELETE /qr/:id` ya aplican `isAdmin || isOwner` en el controller del monolito (SPEC-009, `qr.controller.ts` L536-548 / L663-675) con tests de 403. El admin edita/elimina cualquier QR; un rol `user` solo los suyos.
- **Diálogo de desactivación**: si el diálogo de SPEC-014 está inline en QrCard, extraerlo sin cambiar comportamiento (QrCard lo sigue usando).
- **URL como fuente de verdad**: mantener el patrón `?page=&itemsPerPage=&search=&active=` (SPEC-013/014) para que back/forward y compartir URLs funcionen.
- **E2E**: fixture admin `baseline-c01@test.cl` (patrón SPEC-014); crear QRs de prueba con usuarios distintos para verificar dueño en la tabla.

---

## 8. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-08-14 | **SPEC creada v1 (borrador)**: vista global de QRs para admin. Investigación del baseline: `GET /qr` admin ya existe paginado (findAllWithSearch); faltan dueño resuelto, búsqueda por usuario y filtro de estado en backend; falta API route `GET /api/admin/qr` y página tabla en frontend. Decisiones del usuario: tabla densa, búsqueda QR+usuario, filtro por estado, acciones Editar/Perfil/Desactivar/Stats/Eliminar. |
| 2026-08-14 | **Corrección v1.1 — falso positivo de IDOR retirado**: la v1 documentó un "IDOR latente" en `PATCH /qr/:id` (repo `update` sin ownership). Verificación a fondo (revisión del usuario): el check `isAdmin \|\| isOwner` **SÍ existe** en el controller del monolito (`qr.controller.ts` L536-548) con `ForbiddenException` + tests 403 (`qr.controller.spec.ts` L131-136) — implementado en SPEC-009. Se eliminan las menciones al IDOR en Out of scope, Hallazgos, Baseline y Riesgos. Lección: no inferir IDOR desde el repo/usecase sin leer el cuerpo completo del handler del controller. |
| 2026-08-14 | **Ampliación v1.2 (refinamiento del usuario)**: búsqueda ampliada a **datos internos del QR** (`data.url`, `data.text`, `data.whatsappUrl`, `data.emailUrl`, `data.phoneUrl`, `data.wifiData.ssid`, `data.petData.*`, `name`, `description` — además de idQr/typeQr/vcard/urlList existentes), **filtro por tipo** (`type=<QrType>` con `@IsEnum`), **filtro por usuario dueño** (`userId=<ObjectId>` con `@IsMongoId`), Select de usuarios en la UI (poblado con `userService.getUsers`), filtros combinables con `$and`. Se verificó `buildSearchConditions` actual (L442-509) para listar qué cubre y qué falta. Nuevos CA-02 (id/datos internos/tipo/dueño), CA-03b (type/userId validación), CA-03c (combinación), CA-05b (Select usuarios). |
| 2026-08-14 | **Implementada**: backend (aggregate $lookup users + $facet, búsqueda ampliada, filtros active/type/userId, 1235 tests), frontend (API route GET /api/admin/qr + qrService.getAllQrsPaginated + página /dashboard/admin/qrs con tabla/filtros/acciones + DeactivateQrDialog extraído + Sidebar, 101 tests). Verificación navegador: 1923 QRs, búsqueda "whatsapp" → 267, filtro desactivados → 22, combinación → 0, paginación 193/27/3 páginas, badges de estado, "Usuario eliminado" con user:null, acciones por fila. Nota: reiniciar contenedores qr-app y backend-portaqr tras crear rutas/archivos nuevos (watcher Docker+OneDrive no detecta carpetas nuevas). |
