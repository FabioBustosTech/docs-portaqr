---
title: "SPEC-009: Hardening de autorización y autenticación (backend-portaqr)"
date: 2026-08-09
tags:
  - spec
  - seguridad
  - backend
  - autorizacion
  - autenticacion
  - access-control
  - jwt
  - idor
  - mass-assignment
status: implementado
aliases:
  - SPEC-009
  - Hardening autorización backend
---

# SPEC-009: Hardening de autorización y autenticación (`backend-portaqr`)

> [!abstract] Decisión clave
> Corregir los **3 hallazgos críticos de la auditoría OWASP 2026-08-09** que permiten: (1) **escalar a `admin` y editar usuarios ajenos** (`PATCH /users/:id` sin ownership check + `role` en el mapper de update), (2) **reembolsar pagos Webpay sin autenticación** (`webpay.controller.ts` con rutas `@Public()`), y (3) **manipular estados de pago/activación** (`qr-activate` con `state`/`userId` editables por el cliente y sin ownership). Complementa a [[SPEC-008]] (entradas/sanitización): esta SPEC cubre **autorización (broken access control), autenticación y criptografía**. Se endurecen además: IDOR en users/scan/pet-tag, códigos de verificación con `Math.random()`, fallback silencioso de llaves JWT, rotación de refresh tokens y redacción de datos sensibles en logs.

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-12)
> - **Fecha:** 2026-08-09
> - **Autor:** Equipo Plataforma QR (auditoría OWASP)
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-008]] (ValidationPipe whitelist, throttler, helmet — prerrequisito parcial), [[SPEC-006]] (anti-spam contacto)

---

## 1. Objetivo

Que ningún usuario autenticado pueda: elevar su rol, operar sobre recursos de otros usuarios (IDOR), manipular estados de pago, ni reembolsar transacciones sin autorización. Que los secretos (códigos de verificación, llaves JWT, refresh tokens) se generen y gestionen con criptografía segura y que los logs no expongan datos sensibles.

## 2. Contexto

### 2.1 Estado actual (2026-08-09)

- **Guard global**: `JwtAuthGuard` (`APP_GUARD`) en `app.module.ts` — todo requiere token salvo `@Public()`.
- **`RolesGuard`**: aplicado por controller (`@UseGuards(RolesGuard)` + `@Roles(...)`), **no global**.
- **`ValidationPipe` global**: en la auditoría (2026-08-09) estaba sin opciones — **ya implementado por [[SPEC-008]] al 2026-08-12** (`validation-pipe.config.ts`: `whitelist: true` + `forbidNonWhitelisted: true` + `transform`).
- **Webpay**: controller completo `@Public()` (create/refund/status/transaction) — solo `return` (callback de Transbank) debería ser público.
- **qr-activate**: DTOs de escritura aceptan `state` (enum incluye `PAYED`/`ACTIVE`), `WebpayTransaction` y `userId` del body; lecturas/escrituras sin ownership check.
- **users**: `PATCH /users/:id` sin verificar que el autenticado sea el dueño (`@Roles('admin','user')`); `role` mapeado por `UserMongoMapper.toSchemaData()` en updates; `GET /users/:id`, `GET /users/search`, `GET /users/check-email/:email`, `GET /users/check-username/:userName` exponen/enumeran perfiles.
- **scan**: `GET /scan/:idQr/stats|recent|daily|locations|devices` sin verificar propiedad del QR; `POST /scan/stats` público acepta `userId`/`idQr` arbitrarios.
- **Códigos de verificación/reset**: `Math.random().toString(36).substring(2, 8)` (6 chars, **no CSPRNG**), sin límite de intentos.
- **Llaves JWT**: `loadJwtKeys()` genera par RSA **efímero en memoria** si faltan las llaves (arranca "bien" en prod → tokens inválidos entre instancias/reinicios).
- **Refresh token**: sin rotación ni revocación por uso; válido 7 días; un robo = sesión permanente.
- **Logs**: `TraceService` registra `token_ws` completos, emails y payloads sensibles.

### 2.2 Hallazgos de la auditoría OWASP (2026-08-09)

| # | Sev. | Riesgo | Ubicación |
|---|---|---|---|
| A1 | 🔴 Crítico | **Escalada a `admin` / edición de usuarios ajenos** — `PATCH /users/:id` sin ownership; con whitelist (SPEC-008) se bloquea `role` en body, pero sin ownership check un usuario edita `isEmailVerified`/`isActive`/datos de CUALQUIER usuario; `isEmailVerified` sigue en `UpdateUserDto` | `users.controller.ts` (`update`), `update-user.dto.ts`, `user-mongo.mapper.ts` (`toSchemaData` mapea `role`) |
| A2 | 🔴 Crítico | **Webpay sin autenticación** — `@Post('refund')` público: cualquiera con el token reembolsa el pago; `GET /status` y `GET /transaction/:token` públicos: IDOR de monto/tarjeta parcial; `POST /create` público: transacciones arbitrarias | `webpay.controller.ts` |
| A3 | 🔴 Crítico | **Fraude de activación QR** — `state` (incluye `PAYED`) y `userId` aceptados del body en create/update; GET/PATCH sin ownership → activaciones y facturas (RUT/dirección) de terceros legibles y editables | `qr-activate.controller.ts`, `create-qr-activate.dto.ts`, `update-qr-activate.dto.ts` |
| A4 | 🟠 Alto | **IDOR + enumeración de cuentas** — `GET /users/:id`, `GET /users/search` (cualquier autenticado ve perfiles ajenos); `check-email`/`check-username` públicos; mensajes de login diferenciados ("no existe" vs "contraseña incorrecta") y 404 en forgot-password | `users.controller.ts`, `auth.service.ts`, `forgot-password.usecase.ts` |
| A5 | 🟠 Alto | **Códigos de verificación/reset predecibles** — `Math.random()` (no CSPRNG), 6 chars alfanuméricos, sin límite de intentos → brute-force/predecibilidad | `create-user.usecase.ts`, `forgot-password.usecase.ts`, `resend-verification-code.usecase.ts`, `verify-email.usecase.ts`, `reset-password.usecase.ts` |
| A6 | 🟠 Alto | **Fallback silencioso de llaves JWT** — par RSA efímero si faltan `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` → en prod: instancias con llaves distintas, tokens inválidos tras reinicio, falsa seguridad | `jwt-keys.ts` |
| A7 | 🟠 Alto | **IDOR en estadísticas de escaneo** — cualquier usuario ve analytics (incl. geolocalización) de cualquier QR ajeno | `scan.controller.ts` |
| A8 | 🟡 Medio | **Refresh token sin rotación** — reuso ilimitado; robo = sesión válida hasta 7d; `change-password` no invalida sesiones | `auth.service.ts`, `jwt.service.ts` |
| A9 | 🟡 Medio | **`POST /scan/stats` flood** — público, crea documentos para `idQr`/`userId` inexistentes (DB flooding, inflado de analytics) | `scan.controller.ts`, `create-scan.dto.ts` |
| A10 | 🟡 Medio | **Fuga de `userId` del dueño** en endpoint público — `GET /qr/public/:id` devuelve `id: qr.userId`; `GET /qr/seo-idqr` lista 500 idQr activos | `get-public-qr.usecase.ts`, `qr.controller.ts` |
| A11 | 🟡 Medio | **PII del dueño expuesta** — `GET /pet-tag/public/status/:idQr` devuelve `petData` completo (dirección, teléfono, enfermedades) sin autenticación | `mongo-pet-tag.repository.ts` (`getStatus`) |
| A12 | 🟡 Medio | **PIN de activación pet-tag sin límite de intentos** — 6 chars alfanuméricos (36^6 ≈ 2.1B), brute-force online viable por IP | `mongo-pet-tag.repository.ts` (`activate`) |
| A13 | 🟡 Medio | **Logs con datos sensibles** — `token_ws` completos, emails, payloads en trace/response logs | `trace.service.ts` uso en webpay, `response-logger.interceptor.ts` |

> [!note] Relación con SPEC-008
> [[SPEC-008]] Capa 2 (`whitelist: true` + `forbidNonWhitelisted`) mitiga la **inyección** de `role` por body (mass-assignment clásico), pero **no** resuelve el ownership check, ni los DTOs que siguen aceptando `state`/`isEmailVerified`, ni los endpoints `@Public()` mal colocados. **SPEC-008 ya está implementada (verificado 2026-08-12)** — prerrequisito cumplido.

## 3. Amenazas

| Amenaza | Impacto | Fix |
|---|---|---|
| Escalada a admin / edición masiva de usuarios | Control total de la plataforma, robo de cuentas | A1 |
| Refund no autenticado | Pérdida económica directa | A2 |
| Marcado de pagos sin pagar | Fraude al negocio (QRs activados sin ingreso) | A3 |
| Enumeración de usuarios | Prepárate para ataques dirigidos (phishing, fuerza bruta) | A4 |
| Códigos predecibles / brute-force | Toma de control de cuentas (verify/reset) | A5 |
| Llaves JWT inconsistentes | Tokens inválidos, fallas intermitentes de auth | A6 |
| Espionaje de analytics | Fuga de información de negocio y ubicaciones | A7 |
| Reuso de refresh token | Robo de sesión persistente | A8 |
| Flood de scans | DoS de storage, estadísticas falsas | A9 |
| Enumeración de QRs/dueños | Ataques dirigidos | A10 |
| PII pública | Exposición de datos personales (Ley 19.628) | A11 |
| Brute-force de PIN | Robo de placas (reservadas) | A12 |
| Logs con secretos | Compromiso si los logs se filtran | A13 |

## 4. Solución propuesta

> [!note] Patrón estándar de autorización — owner OR admin (decisión 2026-08-11)
> **Todos los bloques IDOR de esta SPEC (1, 2, 3, 4, 7) usan el mismo patrón**: el autenticado puede operar sobre un recurso solo si es su dueño (`actor.id === resourceOwnerId`) **o** es `admin`. En vez de duplicar el snippet en cada handler, se crea **un único helper compartido** `assertOwnerOrAdmin(ownerId, actor, message?)` en `src/common/utils/ownership.utils.ts` que lanza `ForbiddenException` (403) si no se cumple:
>
> ```ts
> // src/common/utils/ownership.utils.ts
> export function assertOwnerOrAdmin(
>   ownerId: string,
>   actor: { id: string; role: string },
>   message = 'No tiene permiso sobre este recurso.',
> ): void {
>   const isOwner = actor.id === ownerId;
>   const isAdmin = actor.role === 'admin';
>   if (!isOwner && !isAdmin) {
>     throw new ForbiddenException(message);
>   }
> }
> ```
>
> - **Escrituras** (PATCH users, PATCH qr-activate, commit webpay): la regla vive en el **usecase** (recibe `actor` — regla de negocio) y el controller la aplica primero como fail-fast (dos capas, ver Bloque 1).
> - **Lecturas** (GET users/:id, webpay status/transaction, scan stats): check en el **controller** con el helper — suficiente para no exponer datos; **no** se cambian firmas de usecases de lectura con muchos callers (`GetUserUseCase` lo usan `auth.service` y `change-password`).

### Bloque 1 — Escalada a admin y edición de usuarios (A1)

**Estrategia de dos capas (decisión 2026-08-11):** la regla de negocio "un usuario solo edita su propio perfil, salvo admin" vive en el **usecase** (capa de aplicación), y el **controller** la aplica primero como fail-fast de la capa HTTP. Cualquier caller futuro del usecase (scripts, seeders, otros módulos) queda protegido aunque no pase por el controller.

1. **Check mínimo en el controller** (`users.controller.ts` `update()`): inyectar `@GetUser()` y aplicar el patrón de `change-password` pero con **`ForbiddenException` (403)** — el 401 ya lo cubre el `JwtAuthGuard` — y con **bypass de admin** (el admin edita a cualquiera sin ser owner):
   ```ts
   const isOwner = user.id === id;
   const isAdmin = user.role === 'admin';
   if (!isOwner && !isAdmin) {
     throw new ForbiddenException('No tiene permiso para modificar este usuario.');
   }
   ```
2. **Regla duplicada en el usecase** (`update-user.usecase.ts`): firmar `execute(id, data, actor, tracking)` con `actor: { id: string; role: string }` y repetir el mismo check (`!isOwner && !isAdmin → ForbiddenException`). Impacto verificado 2026-08-11: el único caller productivo de `execute()` es el controller (`auth.service.ts` solo usa `updateLastLogin()`, que no recibe actor por ser operación interna de auth); se ajustan `users.controller.spec.ts` y `update-user.usecase.spec.ts` (CA-11).
3. **Quitar `isEmailVerified` de `UpdateUserDto`** (queda solo en el flujo `verify-email`). Dejar `isActive` solo modificable por `admin` (check en el usecase con `actor`: si `isActive` viene en el body y `actor.role !== 'admin'` → 403).
4. **Defensa en profundidad en el repositorio**: en `update()` de `mongo-user.repository.ts` **destruir `role` del `$set`** (`const { role: _role, ...safeData } = UserMongoMapper.toSchemaData(data)`). El mapper **no se toca** (`toSchemaData` sigue mapeando `role` porque `create()`/`createAdmin()` lo necesitan) — nunca actualizar rol vía update genérico.
5. **Validación de `ObjectId`** en `PATCH /users/:id` (`mongoose.isValidObjectId` → 400 en vez de 500 si el id es inválido).

### Bloque 2 — Webpay protegido (A2)

**Por qué proteger no rompe la integración (verificado 2026-08-12):** Transbank **nunca llama a los endpoints del controller** — la comunicación con la API de Transbank es servidor-a-servidor vía `transbank-webpay.gateway.ts` (SDK). Los endpoints HTTP solo los consume el frontend (`qr-app/src/services/webpay.service.ts`) y el navegador del usuario. El único punto donde el browser (sin token) llega a la API es `GET /webpay/return` (redirección post-pago de Transbank) → ese es el único que se mantiene público.

| Ruta | Quién la llama hoy | Objetivo |
|---|---|---|
| `POST /webpay/create` | qr-app | `JwtAuthGuard` + `sessionId` **= `user.id` del token JWT** (el del body se elimina del DTO — F2) |
| `POST /webpay/refund` | qr-app | `JwtAuthGuard` + `@Roles('admin')` (decisión 2026-08-12: el reembolso es operación de soporte/negocio; cualquier otro rol → 403) |
| `GET /webpay/status` | qr-app | `JwtAuthGuard` + ownership (`tx.sessionId === user.id` vía patrón estándar) |
| `GET /webpay/transaction/:token` | qr-app | `JwtAuthGuard` + ownership (idem) |
| `GET /webpay/return` | Navegador (redirigido por Transbank) + qr-app | **Se mantiene público** (único callback de Transbank) |

- `create-transaction.dto.ts`: **`sessionId` se elimina del DTO** (decisión 2026-08-12 — Opción A, default-deny). Hoy viene requerido del body (`create-transaction.dto.ts:18`) y qr-app lo envía en `webpay.service.ts:4` + `page.tsx:118`; con el cambio, el `sessionId` se saca **del token JWT** (`req.user.id`), nunca del body. Con `forbidNonWhitelisted`, si el frontend sigue enviándolo recibe 400 → F2 es obligatorio y debe desplegarse junto a este bloque.
- Ownership en `GET /webpay/status` y `GET /webpay/transaction/:token` con el **patrón estándar**: cargar la transacción → `assertOwnerOrAdmin(tx.sessionId, actor)` (el `sessionId` de la tx es el `ownerId`). Si la tx no existe o no tiene `sessionId` → 404.
- **Coordinación qr-app** (`webpay.service.ts`): agregar `Authorization: Bearer <token>` en `createTransaction`/`getTransactionStatus`/`getTransaction` (~5 líneas; el usuario ya está logueado al pagar); dejar de enviar `sessionId` en create (se ignora).
- Nota: Transbank no firma el `buyOrder` en el commit — validar en `commit-transaction.usecase.ts` que la transacción existe en BD y que el `amount` devuelto por Transbank coincide con el persistido (evita discrepancias).

### Bloque 3 — qr-activate sin fraude (A3)

1. **`CreateQrActivateDto`**: eliminar `state`, `WebpayTransaction` y `TransferDate` de la entrada pública. `state` se fija por el usecase: `PENDING` por defecto, o `ADMINCREATED` (enum de la entidad, `qr-activate.entity.ts:18`) si `methodActivation=ADMIN` y el autenticado es admin. **`userId` según rol (decisión 2026-08-12 — el admin activa POR un cliente, caso distinto al usuario)**:
   - **usuario `user`**: `userId` **siempre del token** (`actor.id`) — si viene en el body y difiere → 403 (solo activa para sí mismo).
   - **admin**: se acepta el `userId` del body — puede ser un **cliente** (verificado en `activation.helpers.ts:55`: `userId: cartItems[0].userIdClient`); si no viene, se usa `actor.id`. `adminId` del body queda opcional para auditoría.
2. **`UpdateQrActivateDto`**: dejar solo campos no transaccionales (`description`, `descriptionAdministrator`). Estados/pagos se transicionan **únicamente** desde `update-webpay-qr-activate.usecase` (commit) o flujo admin dedicado.
3. **Ownership checks** (patrón estándar) en `GET /qr-activate`, `GET /qr-activate/:id`, `PATCH /qr-activate/:id`: cargar la activación → `assertOwnerOrAdmin(activation.userId, actor)`. En `PATCH` la regla vive **además** en el usecase (recibe `actor` — dos capas, como Bloque 1). Validar `ObjectId` → 400.
4. `qr-activate.entity.ts`: documentar que `state` solo se muta en infraestructura (commit) — invariante del agregado.
5. `PATCH /qr-activate/webpay/:token_ws` es `@Public()` (commit del flujo webpay — llega desde el frontend con el `token_ws` que Transbank devolvió en el `return`): **se mantiene público por diseño**, igual que `GET /webpay/return`. Su seguridad depende de que `update-webpay-qr-activate.usecase` valide el `token_ws` contra la transacción persistida/Transbank y solo transicione a `PAYED` si el pago está autorizado.

### Bloque 4 — IDOR users y enumeración (A4)

1. `GET /users/:id` → patrón estándar en el controller: `assertOwnerOrAdmin(id, actor)` (403 si ajeno). **No se cambia la firma de `GetUserUseCase`** (lo usan `auth.service.getProfile/validateUser` y `change-password`): para lecturas el check en el controller basta.
2. `GET /users/search` → **solo `admin`** (decisión 2026-08-12: el endpoint fue pensado para `dashboard/users`, página de administración; verificado que `qr-app` NO lo usa hoy — `getAllUsers()` usa `GET /users`, ya admin-only —, así que restringir a `@Roles('admin')` no rompe nada y cierra el IDOR).
3. `check-email` / `check-username` → se mantienen `@Public()` (funcionalidad de registro) **pero** el throttler de [[SPEC-008]] los cubre; documentar que la enumeración residual es aceptada por diseño (UX registro) — mitigada por mensajes de login homogéneos.
4. **Mensajes homogéneos**: en `auth.service.ts` login → respuesta única `'Credenciales inválidas'` para usuario inexistente y contraseña incorrecta. En `forgot-password.usecase.ts` → **200 genérico** "si el correo existe, recibirás un código" (decisión 2026-08-12: estándar OWASP y requerido por CA-04; se descarta la alternativa de mantener 404).

### Bloque 5 — Códigos criptográficos y límite de intentos (A5)

1. Reemplazar `Math.random().toString(36).substring(2, 8)` por **`crypto.randomBytes(5).toString('hex')`** (10 chars hex ≈ 40 bits) en los 3 generadores (`create-user`, `forgot-password`, `resend-verification`).
2. **Límite de intentos**: en `verify-email.usecase.ts` y `reset-password.usecase.ts` contar intentos fallidos por usuario (campo `verificationAttempts` en `UserSchema`) → tras 5 fallos, invalidar el código (borrarlo). 
3. Throttler por IP en `POST /users/:id/verify-email` y `POST /users/reset-password` ([[SPEC-008]] Capa 4).

### Bloque 6 — Llaves JWT estrictas (A6)

`jwt-keys.ts`: si `NODE_ENV === 'production'` y no hay llaves válidas → **`throw` en bootstrap** (crash temprano). Par efímero solo permitido en `development`/`test`. Verificar que el arranque de Railway/docker-compose en prod ya inyecta `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (formato PEM inline).

### Bloque 7 — IDOR scan + flood (A7, A9)

1. `scan.controller.ts`: en `getStats/getRecentScans/getDailyStats/getLocationStats/getDeviceStats` aplicar el **patrón estándar**: cargar el QR (`getQrUseCase.execute`) → si no existe, 404; luego `assertOwnerOrAdmin(qr.userId, actor)` → 403 si es ajeno.
2. `create-scan.usecase.ts`: **validar que el QR existe** (`getById`) → si no existe, 404 (no crear doc). `userIdScan`/`userId` del body: si no coinciden con el dueño del QR, se ignoran (el dueño real se toma del QR). Esto evita inflar analytics ajenos y el flood.

### Bloque 8 — Refresh token con rotación (A8)

1. Nueva colección `refresh_tokens`: `{ userId, tokenHash (SHA-256 del token), expiresAt, revokedAt, createdAt }` (nunca guardar el token plano; usar índice TTL en `expiresAt`).
2. `refreshToken()`: buscar por hash → si no existe o está revocado → 401; **rotar**: revocar el actual y emitir uno nuevo. Detección de reuso: si llega un token ya rotado (hash existe + `revokedAt`), **revocar toda la familia** (incrementar `tokenVersion` del usuario) — respuesta 401.
3. `logout()`: además de `tokenVersion++`, revocar los refresh activos del usuario.
4. `change-password` y `reset-password`: incrementar `tokenVersion` (invalida sesiones previas).
5. Acceso token sigue en body (contrato actual) — evaluar cookies httpOnly+SameSite en SPEC futura (depende frontend).
6. **TTL del refresh (decisión 2026-08-12)**: un TTL corto (ej. 1h) **sin rotación solo reduce la ventana de explotación, no detecta el robo** — y empeora UX (re-login cada hora). Con rotación, el TTL de 7 días es seguro: el primer reuso de un token ya rotado delata el robo y revoca toda la familia. Se mantiene `REFRESH_TOKEN_TTL_DAYS=7` (configurable); acortarlo queda como mitigación adicional opcional, no como fix.

### Bloque 9 — Reducción de superficie pública (A10, A11, A12)

1. `get-public-qr.usecase.ts`: `id` del response = `qr.idQr` (UUID público) en vez de `qr.userId`. ⚠️ qr-app verificado 2026-08-12: `QrRedirectClient.tsx:141` usa `initialQrResponse.id` como userId del escaneo → ajuste F6 del Bloque 11; el resto del frontend no usa el campo para reconstruir URLs.
2. `GET /pet-tag/public/status/:idQr`: **decisión de negocio 2026-08-12 — se mantiene el `petData` completo expuesto** (`status`, `petName`, `ownerName`, `phone`, `address`, `diseases`, `vaccines`, `observations`). La placa existe para que quien encuentre una mascota perdida contacte al dueño; el producto lo requiere. **Riesgo aceptado explícitamente**: exposición de PII (dirección, datos médicos) sin autenticación — revisar con legal (Ley 19.628). Si en el futuro se restringe, la respuesta mínima sería `{ status, petName, ownerName, phone }`.
3. `PATCH /pet-tag/activate` (A12): **límite de 5 intentos fallidos por `idQr`** — campos `activationAttempts` (default 0) y `activationLockedUntil` en `pet-tag.schema.ts`; al fallar el PIN → `$inc`; al llegar a 5 → `activationLockedUntil = now + 30 min` y respuesta 429/403 "demasiados intentos"; reset al activar correctamente. Se mantiene además el **throttler por IP** (10/min) para impedir atacar varias placas en paralelo. El bloqueo es **temporal** (30 min) y no invalida el PIN: si fuera permanente, el comprador legítimo no podría activar su placa y necesitaría soporte.
4. `GET /qr/seo-idqr`: mantener (sitemap), pero considerar quitar `updatedAt` si no es necesario — no filtra PII (idQr es UUID v4).

### Bloque 10 — Redacción de logs (A13)

**Enfoque whitelist (default-deny, decisión 2026-08-12)** — en vez de un blacklist ("redactar campos sensibles conocidos", frágil ante campos nuevos), **solo se loguean los campos permitidos**: todo lo demás se omite. Un campo sensible nuevo mañana NO se filtra sin tocar nada.

1. Helper `sanitizeForLog(data, allowedFields)` en `src/common/utils/redact.utils.ts` (+ unit tests): conserva solo las keys de la whitelist; los campos `password|token|token_ws|code|pin` siempre se redactan (nunca salen aunque estén en la whitelist); el resto se omite (default-deny).
2. `ResponseLoggerInterceptor`: el body logueado pasa por `sanitizeForLog` con una whitelist global; las rutas `/auth/login`, `/auth/refresh`, `/webpay/*` usan whitelists restringidas (webpay: solo `{ status, message }`).
3. Controllers webpay: los `traceService.log({ token })` (líneas 80, 107-108, 121, 133) pasan a `{ tokenPreview: token.slice(0, 8) + '…' }` o se eliminan.

### Bloque 11 — Ajustes de frontend (`qr-app`) (transversal)

Ajustes **obligatorios** en `qr-app` para que los bloques 1-10 no rompan contratos. Verificados en el código del frontend 2026-08-12 (archivo:línea exactos).

| # | Archivo (qr-app) | Cambio | Bloque | ¿Rompe sin esto? |
|---|---|---|---|---|
| **F1** | `src/services/webpay.service.ts` | Agregar `Authorization: Bearer <token>` en `createTransaction`, `getTransactionStatus`, `getTransaction`, `refundTransaction` (hoy **ninguna** llamada envía auth) | B2 | 🔴 Sí — 401 en create/status/transaction |
| **F2** | `src/services/webpay.service.ts:4` + `src/app/dashboard/qr/pay/page.tsx:118` | Dejar de enviar `sessionId` en create (se elimina del DTO; el backend lo saca del token JWT) | B2 | 🔴 Sí — **400** (forbidNonWhitelisted) |
| **F3** | UI de refund (si existe en el dashboard admin) | Mostrar la opción de reembolso **solo a admins** (rol del usuario) | B2 | 🔴 Sí — 403 para usuarios `user` |
| **F4** | `src/app/dashboard/qr/pay/pay.helpers.ts:69-74` (`buildWebpayActivation`) | Dejar de enviar `state` y `WebpayTransaction` en el payload de creación | B3 | 🔴 Sí — **400** (forbidNonWhitelisted) |
| **F5** | `src/app/dashboard/admin/qr/activate/send/activation.helpers.ts:48` | Dejar de enviar `state` en el payload de activación admin (el backend lo fija a `ADMINCREATED` — enum de la entidad — al ver `methodActivation=ADMIN` + rol admin) | B3 | 🔴 Sí — **400** |
| **F6** | `src/app/qr/[id]/QrRedirectClient.tsx:141` | `userId: initialQrResponse.id` — tras el fix de A10 ese `id` pasa a ser el `idQr` (UUID), no el userId; dejar de depender de ese campo para el userId del scan (el backend B7 lo ignora) | B9/B7 | ⚪ No rompe (se ignora) — corregir lógica |
| **F7** | `src/services/scan.service.ts:295` y `src/services/qr.service.ts:400` | Manejar el nuevo **404** de `POST /scan/stats` (QR inexistente) sin romper el registro de escaneos | B7 | 🟡 Parcial — 404 nuevo |
| **F8** | Flujos `verify-email` / `reset-password` | Mostrar el mensaje del backend cuando el código se invalida tras 5 intentos ("código inválido/expirado") | B5 | ⚪ No rompe — UX |
| **F9** | Flujo `pet-tag/activate` | Mostrar mensaje de bloqueo temporal (429/403) tras 5 PINs fallidos | B9 | ⚪ No rompe — UX |
| **F10** | `src/app/qr/[id]/page.tsx` + `src/services/qr.service.ts:468` (`getPublicRedirectUrl`) | Verificar que el `id` del response no se use para reconstruir URLs internas (contrato cambia: ObjectId → UUID `idQr`) | B9 | 🟡 Parcial — depende del uso |
| **F11** | `src/app/dashboard/qr/activate/page.tsx:99,143` y `src/app/dashboard/admin/qr/activate/` (carritos) | Enviar `planId` en `qrList[]` en vez de `price`; quitar `price`/`TotalPrice` del payload de creación (el backend calcula y congela el precio) | B12 | 🔴 Sí — **400** |
| **F12** | Página de pago `qr/pay` | Mostrar el total que devuelve el backend en el response de creación (el usuario ve el monto real calculado antes de Webpay) | B12 | ⚪ No rompe — corrección de UX |

> [!note] Orden de despliegue
> - **F1-F3** deben desplegarse **junto** al Bloque 2 (backend y frontend en el mismo deploy; F2: si el frontend sigue enviando `sessionId` tras eliminarlo del DTO, el create devuelve 400).
> - **F4-F5** deben desplegarse **junto** al Bloque 3 — si el backend se despliega sin el frontend, el flujo de pago/activación de QRs se rompe con 400.
> - **F6-F10** pueden seguir al backend (no rompen, solo UX/lógica).
> - **F11-F12** deben desplegarse **junto** al Bloque 12 (400 si el frontend sigue enviando `price`).

### Bloque 12 — Precio desde el plan con snapshot histórico (integridad de cobro)

**Problema (hallazgo no cubierto por la auditoría, detectado 2026-08-12)**: el precio de la activación (`price.TotalPrice/TotalTax` y `qrList[].price`) y el `amount` de Webpay vienen del **body del frontend** y se persisten tal cual (`create-qr-activate.usecase.ts:33` → `price: dto.price`). La validación del DTO (`create-qr-activate.dto.ts:254-263`) compara el total con la suma de `qrList[].price` — pero ambos los manda el mismo cliente → consistencia interna, **no autoridad**. **Ataque**: mandar `price: 1` + `amount: 1` → Transbank cobra $1 → el commit autoriza → QR activado (fraude del ~100% del precio).

**Diseño — el plan es la fuente de verdad UNA sola vez; el snapshot es inmutable** (no se recalcula nunca contra el catálogo, preservando el historial de lo pagado):

1. **Entrada**: `QRElementDto` reemplaza `price` por **`planId`** (el plan seleccionado; el schema `qr-activate.schema.ts:70` ya soporta `qrList[].plan` ref). `PriceDataDto` (TotalPrice/TotalTax/TotalDiscount) **se elimina del DTO de entrada** — el cliente indica QUÉ plan quiere, no CUÁNTO cuesta.
2. **Cálculo en `create-qr-activate.usecase`**: por cada `qrList[].planId` → `getPlan` → `price = plan.price` (fuente de verdad); verificar que el QR existe y pertenece al `userId` de la activación; calcular `TotalPrice`/`TotalTax` en el servidor; **persistir el snapshot**: `price { TotalPrice, TotalTax, TotalDiscount }` (schema L46-55), `qrList[].price` (L67), `qrList[].plan` (L70).
3. **Snapshot inmutable**: se escribe UNA vez al crear la activación (fecha de compra). Consultas/historial/facturas leen el snapshot — **nunca** se recalcula contra el catálogo. Si el plan cambia de precio, las compras pasadas conservan el valor pagado (trazabilidad: `plan` + `price` + `createdAt`).
4. **Webpay**: `POST /webpay/create` deja de aceptar `amount` del body — el monto se toma del **snapshot persistido** de la activación (por `buyOrder`/id de la activación). `transactions.amount` (`transaction.schema.ts:12`) queda como evidencia del cobro.
5. **Commit** (`commit-transaction.usecase.ts`): validar que el `amount` devuelto por Transbank == `price.TotalPrice` del snapshot → si no coincide, **NO activar** (ya requerido en Bloque 2; ahora el snapshot es la referencia).
6. **Flujo admin**: misma regla (el admin también manda `price: plan.price` hoy, `activation.helpers.ts:51-54`) — el precio se calcula desde el plan y se congela igual.

**Verificación de trazabilidad (decisión de negocio 2026-08-12)**: compra en enero con plan A a $9.990 → `qractivates` guarda `price.TotalPrice: 9990`, `qrList[].price: 9990`, `qrList[].plan: plan-A`, `createdAt: enero`; `transactions.amount: 9990`. Si el plan sube a $12.990 en febrero, el historial sigue mostrando **$9.990** (el snapshot es la boleta).

## 5. Configuración

Sin variables nuevas obligatorias. Opcional:

```env
# backend-portaqr/.env (opcional)
REFRESH_TOKEN_TTL_DAYS=7
VERIFICATION_MAX_ATTEMPTS=5
PET_TAG_MAX_ATTEMPTS=5
PET_TAG_LOCK_MINUTES=30
```

| Variable | Dónde | Obligatoria |
|---|---|---|
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | `jwt-keys.ts` | **Sí en prod** (ahora falla el arranque si faltan) |

## 6. Criterios de aceptación

- [x] **CA-01 (A1)**: `PATCH /users/{B}` autenticado como A (no admin) → 403; `PATCH /users/{A}` como A con `{isEmailVerified: true}` → el campo no cambia (fuera de DTO); `PATCH` con `{role:"admin"}` → 400/ignorado y rol intacto; admin edita a cualquier usuario (sin ser owner) → 200; `UpdateUserUseCase.execute` con `actor` ajeno (unit test) → 403
- [x] **CA-02 (A2)**: `POST /webpay/refund` sin token → 401; con token de usuario `user` → 403; con token `admin` → funciona; `POST /webpay/create` sin token → 401; `GET /webpay/status?token=X` donde la tx es de otro (usuario `user`) → 403; con token `admin` → 200 aunque la tx no sea suya; `GET /webpay/return?token_ws=X` **sin token de la app** → funciona (público, redirect)
- [x] **CA-03 (A3)**: `POST /qr-activate` con `state:"PAYED"` en body → 400 (campo fuera de DTO) o 403; con `userId` ajeno (usuario `user`) → 403; con `userId` de un cliente (usuario `admin`) → 201 y la activación queda a nombre del cliente; `PATCH /qr-activate/:id` de otro usuario → 403; `PATCH /qr-activate/:id` de otro usuario con token `admin` → 200 (bypass); `GET /qr-activate` solo muestra las propias (salvo admin)
- [x] **CA-04 (A4)**: `GET /users/{id-ajeno}` → 403 (no admin); `GET /users/{id-ajeno}` con token `admin` → 200 (bypass); login de usuario inexistente vs contraseña errónea → **mismo mensaje y mismo status**; forgot-password de email inexistente → 200 genérico
- [x] **CA-05 (A5)**: verificar en código que ya no existe `Math.random().toString(36)` en el proyecto; `verify-email` con 6 códigos errados → 7mo intento devuelve "código expirado/inválido" y el código fue borrado; verificación con código correcto → 200
- [x] **CA-06 (A6)**: `NODE_ENV=production` sin llaves JWT → el proceso **no arranca** (error claro); con llaves → arranca y firma RS256
- [x] **CA-07 (A7/A9)**: `GET /scan/{idQr-ajeno}/stats` → 403; `GET /scan/{idQr-ajeno}/stats` con token `admin` → 200 (bypass); `GET /scan/{idQr-inexistente}/stats` → 404; `POST /scan/stats` con `idQr` inexistente → 404 y **no se crea documento**; con `userIdScan` ajeno al dueño → se ignora
- [x] **CA-08 (A8)**: refrescar dos veces con el mismo refresh token → el 2º uso recibe 401 **y** el access token emitido previamente queda invalidado (tokenVersion bump); tras `change-password`, el refresh viejo → 401
- [x] **CA-09 (A10/A11/A12)**: `GET /qr/public/:id` no contiene el `userId` del dueño (sí contiene `idQr`); `GET /pet-tag/public/status/:idQr` **sigue devolviendo el `petData` completo** (decisión de negocio — solo se verifica que el endpoint no cambió de contrato); `PATCH /pet-tag/activate` con 6 PINs errados → el 6º intento recibe 429/403 y la placa queda bloqueada 30 min (verificar `activationLockedUntil`); con el PIN correcto antes del límite → 200 y contador reseteado
- [x] **CA-10 (A13)**: en logs de `/webpay/return`, el `token_ws` aparece truncado (≤ 8 chars); `POST /auth/login` no loguea la contraseña; un response con un campo **no whitelisted** (ej. `creditCard`) no aparece en el log del `ResponseLoggerInterceptor`
- [x] **CA-11**: suite de tests existente pasa (ajustar specs que asumían comportamiento viejo); `tsc --noEmit` sin errores
- [x] **CA-12**: flujo E2E feliz intacto: registro → verify → login → crear QR → crear activación WEBPAY → commit → QR activo (**automatizable** con tarjetas de prueba del ambiente de integración — `tests/qr/webpay-commit.spec.ts`)
- [x] **CA-13 (Frontend F1-F10)**: `webpay.service.ts` envía Bearer en las 4 llamadas y **ya no envía `sessionId` en create**; los payloads de qr-activate (`pay.helpers.ts` y `activation.helpers.ts`) ya no incluyen `state`/`WebpayTransaction` y el POST responde 201; `QrRedirectClient.tsx:141` ya no usa el `id` del response como userId; el flujo E2E de pago (create → Transbank → return → PAYED) y de activación admin funcionan end-to-end tras los cambios
- [x] **CA-14 (Precio snapshot, B12)**: `POST /qr-activate` con `price`/`qrList[].price` en el body → 400 (fuera del DTO); con `planId` → 201 y el `price` persistido es `plan.price` calculado por el backend (el monto del body no influye); `POST /webpay/create` sin `amount` → usa el snapshot de la activación; commit con `amount` de Transbank ≠ snapshot → la activación **NO** pasa a PAYED; compra con plan a $9.990 → el plan sube a $12.990 → el historial sigue mostrando $9.990

## 7. No funcionales

- **Rendimiento**: 1 lookup extra por refresh (colección indexada) — despreciable; límite de intentos solo escribe en fallos.
- **Compatibilidad**: contratos de API casi sin cambios (solo se añaden 403/401 y se quitan campos de entrada que el frontend **sí envía hoy**: `state`/`WebpayTransaction` en qr-activate, `sessionId` en webpay — ver **Bloque 11** con los ajustes F1-F10 y su orden de despliegue). `GET /webpay/status` y `transaction/:token` pasan a requerir auth y `POST /webpay/refund` pasa a admin-only: **el frontend debe enviar Bearer** en create/status/transaction/refund.
- **Seguridad**: SHA-256 para hash de refresh (HMAC no necesario: el hash no se usa como firma); códigos hex de 40 bits + 5 intentos = ~2^34 trabajo esperado por cuenta (inviable online).
- **Mantenibilidad**: helpers (`sanitizeForLog`, `assertOwnerOrAdmin`, generador de códigos) en `src/common/utils/` con unit tests; invariantes de `state` documentados en el agregado.

## 8. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| Ownership en dos capas (controller + usecase) | Check solo en controller | La capa HTTP falla rápido (una comprobación barata antes de tocar infraestructura) y la regla de negocio sobrevive a callers futuros del usecase (scripts, seeders, otros módulos); costo: ~3 líneas + ajustar 2 specs |
| Helper único `assertOwnerOrAdmin` en `common/utils` | Snippet inline duplicado por handler | Un solo lugar con la regla (owner OR admin) → un solo punto a corregir/testear; los 8+ handlers IDOR lo importan; costo: ~30 min de creación + unit tests |
| `refund` admin-only | Eliminar el endpoint | El reembolso es operación de soporte/negocio (posible reclamación); se mantiene funcional pero fuera del alcance de usuarios comunes; la UI de refund solo se muestra a admins |
| Mantener `check-email`/`check-username` públicos | Moverlos tras auth | Funcionalidad de registro UX; la enumeración residual se mitiga con throttler + mensajes homogéneos |
| `forgot-password` responde 200 genérico | Mantener 404 | Evita enumeración; costo: el usuario no sabe si el email existe (aceptable, es estándar OWASP) |
| pet-tag status público con `petData` completo | Respuesta mínima `{status, petName, ownerName, phone}` | **Decisión de negocio 2026-08-12**: la placa existe para contactar al dueño de una mascota perdida; el producto lo requiere. Se asume el riesgo de exposición de PII (dirección, datos médicos) — revisar con legal (Ley 19.628) |
| Whitelist de campos en logs (default-deny) | Blacklist (redactar campos conocidos) | Con blacklist, un campo sensible nuevo se filtra sin darse cuenta; con whitelist requiere acción explícita para loguearlo; costo: definir whitelists por ruta |
| Límite de 5 intentos + bloqueo temporal 30 min (por idQr) | Retraso exponencial tras 3 fallos | Contador simple, predecible y persistente (multi-instancia); el bloqueo temporal no invalida el PIN del comprador legítimo; se combina con throttler por IP |
| Rotación + TTL 7d configurable | TTL corto (1h) sin rotación | La rotación detecta el robo en el primer reuso (revoca la familia); el TTL corto solo reduce la ventana de explotación sin detectar, y empeora UX (re-login cada hora) |
| Rotación con colección `refresh_tokens` | Rotación in-memory / jti en JWT | Persistente y escalable multi-instancia; TTL index limpia automáticamente |
| Precio del plan con snapshot en la activación | Precio del body (hoy) / derivar siempre del catálogo | El cliente no decide montos (cierra el fraude del precio); el snapshot congela lo pagado (historial inmutable aunque el catálogo cambie); costo: calcular en usecase + coordinar frontend (F11-F12) |
| `state` fuera de DTOs (solo usecases lo mutan) | Confiar en validación server-side del valor | Menor superficie: el cliente nunca decide estados transaccionales |
| Fallar arranque en prod sin llaves | Fallback efímero (hoy) | Fail-fast: un arranque sin llaves es un error de configuración, no un modo degradado |

## 9. Plan de implementación

> [!important] No es trabajo futuro — es el checklist de esta SPEC
> Las siguientes tareas son **obligatorias** para dar esta SPEC por implementada (validación final: `tsc`, tests y **CA-01..CA-14**). El orden sugerido es el listado (primero el baseline de regresión, luego el helper y los bloques por severidad: críticos → altos → medios). Los bloques que tocan `qr-app` (2, 3, 9, 12) requieren coordinar el despliegue con el frontend según el Bloque 11.

### Tarea 0 — Baseline de regresión E2E (hacer ANTES de implementar nada)

> [!important] Por qué
> Los bloques 1-12 cambian contratos (403/400 nuevos, campos eliminados del body, Bearer obligatorio). Para garantizar que la funcionalidad actual no se rompe, se **congela el comportamiento feliz actual** con tests E2E que pasan HOY y deben seguir pasando DESPUÉS de cada bloque. Los tests del comportamiento **nuevo** (403/400/401, mensajes homogéneos) se escriben dentro de cada bloque, no aquí.

1. **Ejecutar la suite E2E completa hoy** (`npm test` en `desarrollo-qr/e2e-tests-portaqr/` — requiere `qr-app` + `backend-portaqr` + Mongo corriendo) y documentar el estado (specs verdes/rojas) como **punto de partida**. Cualquier spec que falle hoy se anota como pre-existente y se excluye del baseline.
2. **Cobertura validada 2026-08-12** (lectura de los 19 specs; matriz bloque ↔ flujo feliz):

| Flujo feliz (debe seguir funcionando) | Bloque | Spec E2E hoy | Cobertura real |
|---|---|---|---|
| Registro → login (email y username) | B4, B5 | `auth/register.spec.ts`, `auth/login.spec.ts` | ✅ Verificado (login con usuario inexistente: el test espera el mensaje del frontend — **ajustar en B4** si proviene del backend) |
| Sesión/perfil propio (GET /users/:id vía dashboard) | B1, B4 | Todos los specs logueados | ✅ Verificado (el dashboard lo carga en cada test) |
| Pago Webpay: activación → plan → carrito → pay → redirección Transbank + activación PENDING en BD | B2, B3, B12 | `qr/activate-webpay.spec.ts` | ✅ Verificado (payload se ajusta en B3/B12) |
| Facturación Webpay (boleta/factura) | B3, B12 | `qr/facturacion-webpay.spec.ts` | ✅ Verificado |
| Activación admin → QR ACTIVO + estado ADMINCREATED | B3, B12 | `admin/qr-activate-admin.spec.ts` | ✅ Verificado (payload se ajusta en B3/B12) |
| Scan público (POST /scan/stats) + stats propias | B7, B9 | `qr/scan-stats.spec.ts`, `qr/dashboard-stats.spec.ts` | ✅ Verificado (flujo completo con verificación en BD) |
| Página pública del QR (`/qr/[id]`) | B9 (A10) | `qr/public-qr-page.spec.ts` | ✅ Verificado |
| Pet-tag: PIN correcto → ACTIVO, PIN incorrecto, ya activa (409) | A12 | `pet-tag/activate-pet-tag.spec.ts` | ✅ Verificado (test de 5 intentos se añade en B9) |
| Pet-tag: generar lote (admin) | — | `admin/pet-tag-generate.spec.ts` | ✅ Verificado |
| Crear/editar QRs, favoritos, list-image, PDF, páginas públicas | regresión general | specs restantes de `tests/qr/`, `tests/smoke/` | ✅ Verificado |

3. **Gaps encontrados — specs E2E a CREAR en esta tarea** (flujos tocados por la SPEC que hoy no tienen cobertura):

| Spec nuevo | Cubre | Tipo |
|---|---|---|
| `tests/auth/session-refresh.spec.ts` | B8 — sesión persistente (recargar página sin re-login; el refresh sigue funcionando con rotación) | UI |
| `tests/auth/verify-email.spec.ts` | B5 — verificar email por UI con código correcto (leer `verificationCode` de BD → UI → login) — hoy el fixture verifica en BD, la UI no está cubierta | UI |
| `tests/auth/forgot-password.spec.ts` | B4 — forgot-password: POST responde 200 genérico y genera `passwordResetCode` en BD | API (page.request) |
| `tests/pet-tag/public-status.spec.ts` | A11 — `GET /pet-tag/public/status/:idQr` devuelve `petData` completo (baseline; la decisión de negocio lo mantiene igual tras la SPEC) | API |
| `tests/webpay/refund-admin.spec.ts` | B2 — refund: sin token 401, rol user 403, rol admin 200 | API (opcional si no hay UI de refund) |
| `tests/qr/webpay-commit.spec.ts` | B3, B12 — **DOS casos**: (1) **éxito**: pagar con VISA `4051 8856 0044 6623` (CVV `123`, aprobada) → commit AUTHORIZED → activación **PAYED** y **QR ACTIVO** (`isQrActive=true`); (2) **rechazo**: pagar con Mastercard `5186 0595 5959 0568` (CVV `123`, **rechazada**; en la página de Transbank elegir "volver al comercio") → commit REJECTED → activación **FAILED** y **QR sigue INACTIVO** (`isQrActive=false`). Autenticación RUT `11.111.111-1` / clave `123`. Verificación en BD con `qrActivationExists` + `isQrActive` (la rama FAILED ya existe en `update-webpay-qr-activate.usecase.ts:68-70` — nunca llama a `activateMany`) | UI + API — **opcional en CI** (depende del ambiente externo de Transbank; habilitar con env `WEBPAY_E2E=1`) |

4. **Flujos sin cobertura E2E** (se cubren con unit tests del backend en su bloque): `PATCH /users/:id` (sin UI de edición de perfil); límites de intentos pet-tag y verify-email (tests en B9/B5). El **commit webpay ya NO es "por diseño" sin cobertura** — es automatizable con las tarjetas de prueba (spec 6), aunque se marca opcional en CI por depender del ambiente externo de Transbank (mantenciones, latencia).

5. **Resultado de la Tarea 0**: suite verde documentada (baseline) + 6 specs nuevos. A partir de aquí, cada bloque se implementa manteniendo la suite en verde (comando: `npx playwright test`).

> [!note] Credenciales del ambiente de integración Transbank (uso local/tests, 2026-08-12, fuente: transbankdevelopers.cl/documentacion/como_empezar)
> - Código de comercio Webpay Plus: `597055555532` · Api Key Secret: `579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C` · HOST: `https://webpay3gint.transbank.cl`
> - Tarjetas: VISA `4051 8856 0044 6623` (CVV `123`, aprobada) · AMEX `3700 0000 0002 032` (CVV `1234`, aprobada) · Mastercard `5186 0595 5959 0568` (CVV `123`, **rechazada** — útil para el flujo FAILED) · Prepago VISA `4051 8860 0005 6590`
> - Autenticación de tarjetahabiente cuando el formulario lo pide: **RUT `11.111.111-1` / clave `123`**
> - Estas credenciales ya son las que el SDK usa por defecto en `Environment.Integration` (verificar `WEBPAY_COMMERCE_CODE`/`WEBPAY_API_KEY` en el `.env` local)

- [x] Tarea 0 (baseline E2E: ejecutar suite, documentar estado, crear 6 specs: session-refresh, verify-email, forgot-password, pet-tag/public-status, webpay/refund-admin, webpay-commit) — ~3.5h
- [x] Crear helper común `assertOwnerOrAdmin` en `src/common/utils/ownership.utils.ts` + unit tests (usado por Bloques 1-4 y 7) — ~30 min
- [x] Implementar Bloque 1 (ownership users en controller + usecase con `actor`, DTO sin isEmailVerified, isActive admin-only, strip role en update, validación ObjectId) — ~1.5h
- [x] Implementar Bloque 2 (webpay: auth en create/status/transaction, sessionId del token, refund admin-only, validación amount en commit, coordinación qr-app Bearer) — ~2h + ~30 min qr-app
- [x] Implementar Bloque 3 (qr-activate DTOs + ownership) — ~2h
- [x] Implementar Bloque 4 (IDOR users + mensajes homogéneos) — ~1.5h
- [x] Implementar Bloque 5 (códigos crypto + límite intentos) — ~2h
- [x] Implementar Bloque 6 (fail-fast llaves JWT) — ~30 min
- [x] Implementar Bloque 7 (scan ownership + validar QR existe) — ~1h
- [x] Implementar Bloque 8 (refresh tokens colección + rotación + detección de reuso; TTL se mantiene 7d configurable) — ~3h
- [x] Implementar Bloque 9 (idQr en QR público + verificar qr-app; límite 5 intentos activate con bloqueo 30 min + throttler IP; pet-tag status se mantiene completo por decisión de negocio) — ~1.5h
- [x] Implementar Bloque 10 (whitelist `sanitizeForLog` en logger + redact token_ws en webpay) — ~1.5h
- [x] Implementar Bloque 11 (ajustes frontend F1-F12 — ver tabla en sección 4; F1-F5 junto a Bloques 2-3, F11-F12 junto a Bloque 12, F6-F10 después) — ~2-3h
- [x] Implementar Bloque 12 (precio desde el plan + snapshot en `qractivates`; amount webpay desde la activación; validación amount en commit; frontend F11-F12) — ~3h
- [x] Validación final: tsc, tests, CA-01..CA-14, actualizar SPEC a `implementado`

### Fuera de alcance (trabajo futuro real)

- [ ] (Futuro, SPEC separada) Evaluar cookies httpOnly + SameSite para refresh token (depende del frontend)

## 10. Changelog

Registro de decisiones aplicadas a esta SPEC después de la auditoría original (2026-08-09).

| Fecha | Sección | Cambio |
|---|---|---|
| 2026-08-11 | Bloque 1, CA-01, Trade-offs, Plan de implementación | Ownership en **dos capas**: check mínimo en controller (fail-fast, 403, bypass admin) + regla duplicada en `UpdateUserUseCase.execute(id, data, actor, tracking)` — la regla de negocio vive en el usecase |
| 2026-08-11 | Sección 4 (callout), Bloques 2-4 y 7, CA-02/03/04/07, Trade-offs, Plan de implementación | **Patrón estándar owner OR admin**: helper único `assertOwnerOrAdmin(ownerId, actor)` en `src/common/utils/ownership.utils.ts` aplicado a todos los IDOR; CA con caso "admin sin ser owner → 200 (bypass)"; lecturas → check en controller; escrituras → dos capas |
| 2026-08-12 | Bloque 2, CA-02, Trade-offs, No funcionales, Plan de implementación | **Webpay**: nota verificada "proteger no rompe la integración" (Transbank nunca llama los endpoints; solo `return` recibe redirección del browser); tabla con columna "quién la llama"; `refund` pasa a **admin-only** (decisión final, antes se consideró eliminar); coordinación qr-app Bearer |
| 2026-08-12 | Bloque 2, Bloque 11 (F2), CA-13 | **sessionId = token JWT (Opción A)**: se elimina del `CreateTransactionDto` (default-deny); el backend lo inyecta desde `req.user.id`; F2 pasa de limpieza a **obligatoria** (400 con forbidNonWhitelisted si el frontend lo sigue enviando) |
| 2026-08-12 | Bloque 8, Trade-offs | **TTL refresh 7d configurable** (decisión): un TTL corto (1h) solo reduce la ventana de explotación, no detecta el robo; la rotación es el fix (reuso delata y revoca la familia) |
| 2026-08-12 | Bloque 9, Configuración, CA-09, Trade-offs | **A10**: `id` del QR público → `qr.idQr` (evidencia `QrRedirectClient.tsx:141`). **A11**: `petData` completo expuesto — **decisión de negocio** (la placa es para contactar al dueño), riesgo legal Ley 19.628 aceptado explícitamente. **A12**: límite de **5 intentos** + bloqueo temporal 30 min por idQr (`PET_TAG_MAX_ATTEMPTS`/`PET_TAG_LOCK_MINUTES`) + throttler IP |
| 2026-08-12 | Bloque 10, CA-10, Trade-offs | **Logs con whitelist (default-deny)**: helper `sanitizeForLog(data, allowedFields)` en `src/common/utils/redact.utils.ts`; campos `password\|token\|token_ws\|code\|pin` siempre redactados; rutas sensibles con whitelists restringidas |
| 2026-08-12 | Bloque 11, CA-13, Sección 7, Plan de implementación | **Nuevo Bloque 11 — ajustes frontend `qr-app`** (F1-F10, archivo:línea verificados, severidad de ruptura y orden de despliegue). Hallazgo: el frontend envía `state`/`WebpayTransaction` (400 con el fix B3) y ninguna llamada webpay lleva Bearer |
| 2026-08-12 | Bloque 3, CA-03, Bloque 11 (F5) | **qr-activate `userId` por rol**: user → siempre del token (403 si difiere); **admin → se acepta el `userId` del cliente** (el admin activa POR un usuario — `activation.helpers.ts:55`); `state` lo fija el usecase (`ADMINCREATED`, enum `qr-activate.entity.ts:18`); punto 5: `PATCH /qr-activate/webpay/:token_ws` público por diseño (commit del flujo webpay, como `GET /webpay/return`) |
| 2026-08-12 | Bloque 4, Sección 2.1, Nota SPEC-008 | **Decisiones cerradas**: `GET /users/search` → solo admin (endpoint pensado para `dashboard/users`, página de admin; frontend no lo usa); `forgot-password` → 200 genérico definitivo (sin alternativa 404); notas corregidas — **SPEC-008 ya implementada** (whitelist + forbidNonWhitelisted + transform) |
| 2026-08-12 | Sección 9 (Plan de implementación) | **Tarea 0 — Baseline de regresión E2E**: ejecutar la suite Playwright existente (`e2e-tests-portaqr`, 19 specs) antes de tocar nada y documentar el punto de partida; **matriz de cobertura validada** (lectura de los 19 specs); **6 gaps a crear**: `session-refresh` (B8), `verify-email` (B5, la UI no está cubierta — el fixture verifica en BD), `forgot-password` (B4, API), `pet-tag/public-status` (A11, API), `webpay/refund-admin` (B2, API), `webpay-commit` (B3/B12, **pago completo en Transbank con tarjetas de prueba** — opcional en CI vía `WEBPAY_E2E=1`); credenciales de integración documentadas (código comercio `597055555532`, VISA `4051 8856 0044 6623` CVV `123`, RUT `11.111.111-1`/`123`) |
| 2026-08-12 | Bloque 12, CA-14, Bloque 11 (F11-F12), Trade-offs, Plan de implementación | **Nuevo Bloque 12 — precio desde el plan con snapshot histórico**: `QRElementDto` recibe `planId` (no `price`); el backend calcula y **congela** `price`/`qrList[].price`/`qrList[].plan` al crear (snapshot inmutable — el historial conserva lo pagado aunque el catálogo cambie); `amount` de Webpay sale de la activación persistida; el commit valida contra el snapshot |
| 2026-08-12 | Toda la SPEC | **SPEC-009 IMPLEMENTADA (2026-08-12)** — validación final: suite backend 1179 tests verdes + tsc limpio en backend/qr-app/e2e; suite E2E completa verde (71 specs, incl. webpay real VISA aprobada/MC rechazada); **CA-01..CA-14 verificados** (A1 dos capas, A2 webpay protegido + refund admin-only, A3 qr-activate sin fraude, A4 mensajes homogéneos, A5 CSPRNG + 5 intentos, A6 fail-fast llaves, A7/A9 scan ownership + QR existe, A8 refresh rotación + detección reuso, A9 pet-tag 5 PINs + bloqueo 30 min, A10 idQr público, A13 logs whitelist, B12 precio snapshot, frontend F1-F12). Bugs encontrados en la validación: payload admin con price raíz (400 → quitado de ambos builders), CreateScanDto.userId requerido aunque el usecase lo ignora (→ opcional) |
