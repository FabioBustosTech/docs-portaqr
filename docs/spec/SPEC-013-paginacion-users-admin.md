---
title: "SPEC-013: Paginación y búsqueda de usuarios en /dashboard/users + consumo admin-only"
date: 2026-08-13
tags:
  - spec
  - frontend
  - seguridad
  - admin
  - paginacion
status: implementado
aliases:
  - SPEC-013
  - paginacion users admin
---

# SPEC-013: Paginación y búsqueda de usuarios en `/dashboard/users` + consumo admin-only

> [!abstract] Decisión clave
> La página admin `/dashboard/users` carga hoy **todos los usuarios sin paginar** y el backend `GET /users` devuelve un **máximo de 100** (`execute(1, 100, undefined)`), dejando el resto del sistema invisible. La **infraestructura de paginación ya existe end-to-end** (backend `GET /users/paginated`, BFF, API route Next y `userService.getUsers()`) pero la página usa `getAllUsers()` (sin paginar). Esta SPEC: (1) conecta la página al servicio paginado con búsqueda por userName/email, siguiendo el patrón canónico de `dashboard/qr` (URL como fuente de verdad) y extrayendo un componente compartido `PaginationControls` desde `QrGrid`; y (2) **endurece a admin-only** los servicios de listado de usuarios, que hoy permiten a cualquier rol `user` enumerar la base completa de usuarios (IDOR de listado) porque el **BFF** (`@Roles('admin','user')`) y el **API route Next** (solo exige `auth?.id`) filtran mal aunque el monolito ya sea admin-only.

> [!info] Metadatos
> - **Estado:** Implementado
> - **Fecha:** 2026-08-13
> - **Componente destino:** `desarrollo-qr/qr-app/src/app/dashboard/users/`, `desarrollo-qr/qr-app/src/components/ui/PaginationControls.tsx`, `desarrollo-qr/qr-app/src/app/api/users/route.ts`, `desarrollo-qr/backend-portaqr/src/modules/users/`
> - **Rama:** `feat/spec-013-paginacion-users-admin`
> - **Origen:** Requerimiento del usuario (2026-08-13) — verificar servicios usados por `/dashboard/users` y restringir su consumo a admins. Relacionada con [[SPEC-009-hardening-autorizacion-autenticacion-backend-portaqr]] (patrón owner-or-admin, `assertOwnerOrAdmin`).

---

## 1. Objetivo

1. **Paginación**: que `/dashboard/users` muestre los usuarios por páginas (10/25/50 por página) en vez de cargar un listado plano limitado a 100.
2. **Búsqueda**: filtrar por `userName` o `email` (el backend ya lo soporta en `GET /users/paginated` con regex escapada anti-ReDoS).
3. **Estado en URL**: `?page=&itemsPerPage=&search=` como fuente única de verdad (compartible, back/forward funcional), replicando el patrón de `dashboard/qr`.
4. **Consumo admin-only**: que los servicios de listado de usuarios (`GET /users`, `GET /users/paginated`, `GET /users/search`) **solo los consuman usuarios con rol `admin`** en la cadena real: navegador → API route Next → **monolito `backend-portaqr`** (único backend activo desde SPEC-001; `bff-service` está deprecado y **no corre** — verificado en docker-compose.yml: comentado).
5. **Componente compartido**: extraer `PaginationControls` desde `QrGrid` para reutilizarlo en la página de usuarios (y futuras páginas admin con listas).
6. **Filtro de rol**: que la página permita filtrar por rol (usuarios / administradores / todos). Hoy el backend tiene el filtro **hardcodeado** `{ role: 'user' }` en `MongoUserRepository.getAll` — los admins no aparecen nunca en el listado. El filtro pasa a ser **parametrizable** (`?role=`) con **default "Todos"** (decisión del usuario 2026-08-13): sin `role` se devuelven todos los roles.

### 1.1 Out of scope

- **Backend monolito — alcance acotado**: se modifica SOLO `GET /users/paginated` para aceptar el query param `role` (hoy filtro fijo `role: 'user'` en `MongoUserRepository.getAll`). `GET /users` plano, `GET /users/search` y el resto del módulo users **no se tocan**. Los tres endpoints permanecen admin-only (ya lo son).
- **`bff-service`**: **deprecado** (SPEC-001, comentado en docker-compose.yml, no corre). **No se toca** — modificar su código sería modificar código muerto.
- **`GET /users/:id`** (API route `[id]`): se usa para que cada usuario vea su **propio perfil** (settings). El monolito ya aplica `assertOwnerOrAdmin` (SPEC-009). **No se toca.**
- `GET /users/check-username` y `GET /users/check-email`: públicos por diseño (validación de registro).
- Cambios en la UI de QrGrid más allá del refactor estructural de la paginación.

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Frontend (paginación + búsqueda)**

- **RF-1**. `dashboard/users/page.tsx` usa `userService.getUsers(page, limit, search)` en vez de `getAllUsers()`.
- **RF-2**. La URL es la fuente de verdad: `?page=<n>&itemsPerPage=<n>&search=<term>`. Normalización inicial con `history.replaceState` si faltan params (`page=1`, `itemsPerPage=10`).
- **RF-3**. Controles de paginación: prev/next, indicador "Página X de Y", select de items por página (10/25/50).
- **RF-4**. Búsqueda por `userName`/`email` con debounce; al buscar se resetea `page=1`; se limpia el param si el término queda vacío.
- **RF-5**. `Suspense` boundary obligatorio alrededor del contenido que usa `useSearchParams` (Next 16: error de build sin él).
- **RF-6**. Se extrae `PaginationControls` como componente compartido (`src/components/ui/PaginationControls.tsx`) y `QrGrid` pasa a usarlo (refactor estructural, sin cambio de comportamiento).
- **RF-7**. Limpieza: `getAllUsers()` de `user.service.ts` queda sin consumidores → **eliminar** (verificado: única llamada es la página users).

**Bloque B — Seguridad (admin-only)**

- **RF-8**. API route Next `GET /api/users` → rechazar con 403 si `auth?.role !== 'admin'` (mismo patrón que ya usa el `POST` del mismo archivo). Es la **única capa intermedia real** entre el navegador y el monolito.
- **RF-9**. El monolito `backend-portaqr` ya es admin-only en `/users`, `/users/paginated` y `/users/search` (SPEC-009) → **verificar sin cambios**.
- **RF-10 (filtro de rol — backend)**. `GET /users/paginated` acepta `@Query('role')` opcional: `user` | `admin` | `all` (o vacío). El filtro `{ role: 'user' }` hardcodeado de `MongoUserRepository.getAll` pasa a ser dinámico: si `role=user`/`admin` → filtrar por ese rol; `all`/ausente → **sin filtro de rol (todos)** — default elegido por el usuario. ⚠️ Cambio de comportamiento: el `GET /users` plano (`execute(1, 100, undefined)`) también pasará a devolver todos los roles.
- **RF-11 (filtro de rol — frontend)**. Select de rol en la página users: **Todos (default) / Usuarios / Administradores** → setea `?role=` en la URL y resetea `page=1`. Se mantiene en la URL (compartible) como `page`/`itemsPerPage`/`search`.
- **RF-12**. `userService.getUsers(page, limit, search, role?)` agrega `role` al query string; el API route Next lo reenvía al monolito.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: `/dashboard/users` carga la página 1 con 10 usuarios y muestra "Página 1 de N".
- **CA-02**: next/prev navegan y actualizan la URL (`?page=2`); back/forward del navegador funciona.
- **CA-03**: cambiar itemsPerPage a 25/50 resetea a página 1 y muestra esa cantidad.
- **CA-04**: buscar "juan" filtra por userName/email (case-insensitive) y resetea a página 1; limpiar la búsqueda restaura el listado.
- **CA-05**: la URL con `?search=` compartida reproduce el filtro al abrirla.
- **CA-06**: un usuario con rol `user` recibe **403** en `GET /api/users` (API route Next). Con rol `admin` → 200. (El monolito ya devuelve 403 directo — verificado, sin cambios.)
- **CA-07**: `QrGrid` (dashboard/qr) sigue funcionando sin regresión tras el refactor (paginación, búsqueda, itemsPerPage).
- **CA-08**: `tsc --noEmit`, `lint`, `build` pasan en qr-app y backend-portaqr.
- **CA-09**: Suite E2E verde (nuevo spec de paginación + 403 + suite preexistente).
- **CA-10 (filtro de rol)**: el select de rol filtra — "Administradores" muestra solo admins, "Usuarios" solo users, "Todos" ambos; cambia la URL (`?role=`) y resetea a página 1.
- **CA-11 (filtro de rol — default Todos)**: al abrir `/dashboard/users` sin `?role=` se ven **todos los roles** (users + admins); `GET /users` plano también devuelve todos; un `role` inválido (ej. `root`) devuelve lista vacía sin error.

---

## 3. Baseline del problema (verificado en navegador 2026-08-13)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| `/dashboard/users` (admin logueado) | Grid plano con ~100 cards (backend corta en `execute(1, 100, undefined)`) | Grid paginado 10/25/50 con controles |
| Navegación | No existe (scroll infinito del DOM) | prev/next + "Página X de Y" |
| Búsqueda | No existe | Input con debounce (userName/email) |
| Rol `user` → `GET /api/users` | ✅ 200 (API route solo exige `auth?.id`) | ❌ 403 |
| Rol `user` → `GET /users/paginated` y `GET /users/search` (monolito directo) | ❌ 403 (admin-only desde SPEC-009) | Igual — ya correcto |
| `bff-service` (3001) | Deprecado, no corre (docker-compose comentado) | Fuera de alcance |
| Filtro de rol | No existe — el backend filtra fijo `{ role: 'user' }` (los admins nunca aparecen) | Select Todos/Usuarios/Administradores + `?role=` en URL |

---

## 4. Diseño Técnico

### 4.1 Contrato de API ya existente (con extensión de filtro de rol)

```
GET /users/paginated?page=1&limit=10&search=juan&role=user   (monolito, admin-only)
  → PaginatedResult<User> = { data, total, page, limit, totalPages, hasNextPage, hasPrevPage }
  → filtro por rol: NUEVO param `role` (user|admin|all|ausente). Hoy hardcodeado { role: 'user' }.
    - role=user → { role: 'user' }; role=admin → { role: 'admin' }; all/ausente → sin filtro (TODOS)
    - ⚠️ default "Todos" (decisión usuario): GET /users plano también devuelve todos los roles
  → search → $or [userName, email] regex 'i' con escapeStringRegexp (independiente del filtro de rol)
  → sort createdAt desc

GET /api/users?page=&limit=&search=&role=   (API route Next)
  → si page+limit presentes: proxy al monolito /users/paginated → { items, pagination: { total, currentPage, limit, totalPages } }
  → si no: proxy a /users (listado plano)

userService.getUsers(page, limit, search, role?): Promise<PaginatedResponse<User>>   (YA existe, sin uso)
  → mapea { items, total, page, limit, totalPages } + agrega `role` al query
```

### 4.2 Flujo de datos objetivo (Bloque A)

```
dashboard/users/page.tsx (client)
  ├─ useSearchParams → currentPage / itemsPerPage / searchTerm / role (derivados de la URL)
  ├─ useEffect único de datos: userService.getUsers(currentPage, itemsPerPage, searchTerm, role)
  ├─ handlers: handlePageChange / handleSearch / handleItemsPerPageChange / handleRoleChange → router.push(`?${params}`)
  ├─ UserGrid (cards) + PaginationControls (compartido) + Select de rol
  └─ Suspense boundary (useSearchParams)
        └─ /api/users?page=&limit=&search=&role=  (API route Next, ahora admin-only)
             └─ monolito backend-portaqr GET /users/paginated  (ya @Roles('admin'); NUEVO query param role)
```

### 4.3 Bloque A1 — Extraer `PaginationControls` (Opción A elegida)

- **Nuevo**: `src/components/ui/PaginationControls.tsx` con props: `{ currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange, loading? }`.
- **JSX movido desde `QrGrid.tsx`** (líneas ~172-255): select itemsPerPage + botones prev/next + "Página X de Y" + lógica de disabled.
- `QrGrid` importa y usa `PaginationControls` (refactor estructural; sin cambios de props públicas de `QrGrid`).
- La página users usa el mismo componente.

### 4.4 Bloque A2 — Conectar la página users

- Replicar el patrón de `dashboard/qr/page.tsx` (líneas 24-149): derivar valores de `searchParams`, normalización inicial con `history.replaceState`, handlers que construyen `URLSearchParams` y hacen `router.push`, limpieza de params vacíos.
- Componente `UserGrid` (o grid inline): cards actuales (nombre, @userName, email, rol, activo, creado, último acceso) + input de búsqueda + `PaginationControls`.
- Eliminar `getAllUsers()` de `user.service.ts` (queda sin consumidores).

### 4.5 Bloque B — Endurecimiento admin-only

> [!note] Cadena real verificada (2026-08-13)
> `bff-service` está **deprecado** desde SPEC-001 (comentado en `docker-compose.yml`, no corre; `qr-app` apunta a `backend-portaqr:3004` vía `NEXT_PUBLIC_BFF_URL`). El monolito `backend-portaqr` **ya es admin-only** en `/users` (L198), `/users/paginated` (L184) y `/users/search` (L166). **El único eslabón débil es el API route Next.**

| Archivo | Cambio |
| --- | --- |
| `qr-app/src/app/api/users/route.ts:24` | Tras `if (!auth?.id) return 401` → agregar `if (auth?.role !== 'admin') return 403` en el `GET` |

> [!warning] Nota de defensa en profundidad
> El check del API route Next NO reemplaza al backend: es la primera barrera (evita incluso el viaje al monolito) pero la seguridad real ya la garantiza el monolito (`@Roles('admin')`). Un atacante que llame a `backend-portaqr:3004` directamente sigue bloqueado.

### 4.6 Bloque C — Filtro de rol (backend acotado + frontend)

**Backend (monolito, solo el filtro de rol en `getAll`):**

| Archivo | Cambio |
| --- | --- |
| `backend-portaqr/src/modules/users/infrastructure/repository/mongo/mongo-user.repository.ts:41` | `const filter = { role: 'user' }` → dinámico: `role` válido (`user`/`admin`) → `{ role }`; `all`/ausente/inválido → **sin filtro de rol (todos)** |
| `backend-portaqr/src/modules/users/application/use-cases/get-all-user.usecase.ts` | Firma `execute(page, limit, search, role, tracking)` — `role` opcional, **default `'all'`** (el `GET /users` plano pasa a devolver todos los roles — cambio de comportamiento aceptado, decisión del usuario) |
| `backend-portaqr/src/modules/users/presentation/controllers/users.controller.ts:187` | `@Query('role') role?: string` en `findPaginatedByUser`, reenviado al usecase |
| `backend-portaqr/src/modules/users/infrastructure/adapters/UserRepositoryAdapter.ts` | Propagar `role` (firma de `ICanGetAllUser.getAll`) |
| Tests existentes (`mongo-user.repository.spec.ts`, `get-all-user.usecase.spec.ts`, `users.controller.spec.ts`, `UserRepositoryAdapter.spec.ts`) | Ajustar a la nueva firma + nuevos casos: `role=admin`, `role=all`, `role` ausente → todos, role inválido → lista vacía sin error |

**Frontend:**

| Archivo | Cambio |
| --- | --- |
| `qr-app/src/services/user.service.ts:92` | `getUsers(page, limit, search, role?)` → agrega `role` a `URLSearchParams` (solo si viene) |
| `qr-app/src/app/api/users/route.ts` | Leer `searchParams.get('role')` y reenviarlo a `/users/paginated` |
| `qr-app/src/app/dashboard/users/page.tsx` | Select de rol (**Todos** default / Usuarios / Administradores) → `handleRoleChange` setea `?role=` y resetea `page=1` (patrón de `handleSearch`) |

---

## 5. Trade-offs

| Decisión | Alternativas | Por qué esta opción |
| --- | --- | --- |
| **A. Extraer `PaginationControls` compartido** | B. Replicar patrón inline en users; C. Crear `UserGrid` con paginación embebida | La página users es la 3ra con paginación (qr, users y próximamente pet-tag admin). Un solo lugar para los controles paga su deuda rápido. El refactor de QrGrid es puramente estructural y queda cubierto por los E2E existentes (CA-07). |
| `userService.getUsers()` ya existe (código muerto) | Reescribir otro método / cambiar el contrato | Reutilizar el método paginado existente y eliminar `getAllUsers()` evita código muerto y contratos duplicados. |
| `GET /users` plano sigue existiendo en el backend | Eliminarlo | No se elimina para no romper contratos no verificados; la página deja de usarlo. Eliminación queda como backlog. |
| `bff-service` deprecado no se toca | Modificarlo "por si acaso" | Es código muerto (SPEC-001): el tráfico real va directo al monolito. Tocar el BFF sería trabajo sin efecto. |
| **Filtro de rol con default `all` (Todos)** | Default `user` (conservador, comportamiento actual) | Decisión del usuario (2026-08-13): un panel admin debe ver todos los usuarios al abrir, sin asumir rol. Implica cambio de comportamiento en `GET /users` plano (ahora devuelve todos los roles) — aceptado y documentado en CA-11; exige revisar E2E que asuman solo `role: 'user'` en el listado. |
| `role` validado con whitelist (`user`/`admin`/`all`) | Aceptar cualquier string | Un valor inválido no es inyección (Mongo compara literal), pero la whitelist evita filtros silenciosamente vacíos y documenta el contrato. |
| Búsqueda incluida en esta SPEC | Solo paginar | El backend ya soporta `search` (userName/email) y es el caso de uso principal del admin con muchos usuarios; incluirla cuesta ~0 extra. |

---

## 6. Plan de implementación

1. **Tarea 1** — Rama `feat/spec-013-paginacion-users-admin` en `qr-app` (y `backend-portaqr` para el filtro de rol; `bff-service` deprecado NO se toca).
2. **Tarea 2 (Bloque B)** — API route Next `GET /api/users`: check `auth?.role !== 'admin'` → 403. Verificar (sin cambios) que el monolito ya devuelve 403 para rol `user` en `/users`, `/users/paginated` y `/users/search`.
3. **Tarea 3 (Bloque C backend)** — Filtro de rol en `GET /users/paginated`: `role` opcional en controller → usecase → adapter → `MongoUserRepository` (default `'all'` — Todos, whitelist `user`/`admin`/`all`) + ajuste de los 4 spec de tests + casos nuevos.
4. **Tarea 4 (Bloque A1)** — Extraer `PaginationControls` de `QrGrid` y refactorizar `QrGrid` para usarlo.
5. **Tarea 5 (Bloque A2 + C frontend)** — Conectar `dashboard/users/page.tsx` a `userService.getUsers()` con URL como fuente de verdad (page/itemsPerPage/search/role), búsqueda, select de rol, paginación y Suspense. `userService.getUsers` + API route reenvían `role`. Eliminar `getAllUsers()`.
6. **Tarea 6** — Validación: `tsc --noEmit`, `lint`, `build` en qr-app y backend-portaqr; verificación en navegador (CA-01..05, CA-07, CA-08, CA-10, CA-11).
7. **Tarea 7 (E2E)** — Nuevo spec en `e2e-tests-portaqr` (admin ve paginado + búsqueda + filtro de rol; rol `user` → 403 en `/api/users`). Suite completa verde (CA-06, CA-09).
8. **Tarea 8 (Cierre)** — SPEC a `implementado`, tareas done, commit qr-app + backend-portaqr, merge a main (ff), commit docs.

---

## 7. Riesgos y notas

- **Regresión QrGrid**: mitigada por CA-07 (validación navegador) + E2E existentes de dashboard/qr.
- **Cambio de firma en backend**: `getAll` del repositorio cambia de firma (nuevo param `role`) → ajustar los 4 spec de tests del módulo users; default `'all'` = cambio de comportamiento del `GET /users` plano (antes solo `role:'user'`).
- **Impacto en E2E existentes**: revisar specs que asuman que el listado de usuarios contiene solo `role:'user'` (el default "Todos" ahora incluye admins); ajustar expectativas.
- **Test de 403 por rol**: crear usuario `user` de prueba en el spec E2E (patrón usado en SPEC-009: tokens de rol distinto).
- **Monolito ya protegido**: el backend devuelve 403 para rol `user` (SPEC-009); el cambio del API route solo cierra la capa intermedia.
- **Encoding de `search` y `role`**: el API route Next interpola los params crudos en la URL; usar `URLSearchParams`/`encodeURIComponent` para términos con espacios/caracteres especiales.

---

## 8. Historial de implementación (2026-08-13)

| Fecha | Cambio |
| --- | --- |
| 2026-08-13 | **SPEC creada** (borrador): análisis de `/dashboard/users`, hallazgo de paginación existente end-to-end salvo la página; validación de que `backend-portaqr` (3004) es el único backend (bff-service deprecado SPEC-001); filtro de rol con default **Todos** (decisión del usuario). |
| 2026-08-13 | **T1** — Ramas `feat/spec-013-paginacion-users-admin` en qr-app y backend-portaqr. |
| 2026-08-13 | **T2 — Bloque B (qr-app, `db93b40`)**: helper puro `adminGuardError` (401 sin sesión / 403 rol no-admin) + `GET /api/users` admin-only + 8 unit tests (spec helper + handler completo con mocks). tsc/lint/jest verdes. |
| 2026-08-13 | **T3 — Bloque C backend (backend-portaqr, `dd4741f`)**: `GET /users/paginated` acepta `?role=` (`user`/`admin`/`all`/ausente; whitelist; ausente/inválido → todos). Firma `execute(page, limit, search, role, tracking)` con default `'all'` en usecase; filtro dinámico en `MongoUserRepository.getAll`. 4 specs ajustados + casos nuevos (role=admin/all/inválido/ausente). Suite backend **1196/1196**. |
| 2026-08-13 | **T4 — Bloque A1 (qr-app, `c6d6915`)**: `PaginationControls.tsx` extraído de QrGrid (ItemsPerPageSelect + PaginationNav + combinado). Infra de tests React: @testing-library/react + jest-dom + user-event, jest.setup (jsdom polyfills), runtime automático JSX, types de jest-dom. 12 unit tests. QrGrid refactor estructural (sin cambio de UI). |
| 2026-08-13 | **T5 — Bloque A2+C frontend (qr-app, `1ffe633`)**: `dashboard/users/page.tsx` conectado a `userService.getUsers(page, limit, search, role)` con URL como fuente de verdad (`?page=&itemsPerPage=&search=&role=`), normalización con `history.replaceState`, búsqueda con debounce 500ms, select de rol (Todos/Usuarios/Administradores), Suspense. `userService.getUsers` + API route reenvían `role`. `getAllUsers()` eliminado (sin consumidores). 14 unit tests (service + página). |
| 2026-08-13 | **T6 — Validación**: builds qr-app y backend-portaqr OK; navegador (admin baselinec01): CA-01/02/03/04/05/10/11 ✅ (paginación, navegación, itemsPerPage, búsqueda, filtro rol, default Todos), CA-07 ✅ (dashboard/qr sin regresión). **Bug encontrado y corregido** (`fbc1fb4`): el API route `/api/users` mapeaba `data.pagination` (shape del BFF deprecado) — el path paginado era código muerto; ahora mapea el `PaginatedResult` plano del monolito (`data.total/page/limit/totalPages`). |
| 2026-08-13 | **T7 — E2E (e2e-tests-portaqr, `d92bc12`)**: `tests/admin/users-pagination.spec.ts` (CA-01/02, CA-04, CA-10, CA-06: rol `user` → 403 en `/api/users`, monolito `/users/paginated` y `/users/search`) + helper `verifyUserEmailInDb`. Suite completa **74 passed + 1 flaky** (webpay-commit, Transbank externo — pasa al retry). |
| 2026-08-13 | **T8 — Cierre**: SPEC a `implementado`, tareas done, merges a main (qr-app, backend-portaqr, e2e-tests-portaqr), commit docs. |
