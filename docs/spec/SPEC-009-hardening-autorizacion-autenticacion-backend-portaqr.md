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
status: borrador
aliases:
  - SPEC-009
  - Hardening autorización backend
---

# SPEC-009: Hardening de autorización y autenticación (`backend-portaqr`)

> [!abstract] Decisión clave
> Corregir los **3 hallazgos críticos de la auditoría OWASP 2026-08-09** que permiten: (1) **escalar a `admin` y editar usuarios ajenos** (`PATCH /users/:id` sin ownership check + `role` en el mapper de update), (2) **reembolsar pagos Webpay sin autenticación** (`webpay.controller.ts` con rutas `@Public()`), y (3) **manipular estados de pago/activación** (`qr-activate` con `state`/`userId` editables por el cliente y sin ownership). Complementa a [[SPEC-008]] (entradas/sanitización): esta SPEC cubre **autorización (broken access control), autenticación y criptografía**. Se endurecen además: IDOR en users/scan/pet-tag, códigos de verificación con `Math.random()`, fallback silencioso de llaves JWT, rotación de refresh tokens y redacción de datos sensibles en logs.

> [!info] Metadatos
> - **Estado:** Borrador
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
- **`ValidationPipe` global sin opciones** — ver [[SPEC-008]] Capa 2 (whitelist pendiente de implementar; este SPEC asume que se implementa).
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
> [[SPEC-008]] Capa 2 (`whitelist: true`) mitiga la **inyección** de `role` por body (mass-assignment clásico), pero **no** resuelve el ownership check, ni los DTOs que siguen aceptando `state`/`isEmailVerified`, ni los endpoints `@Public()` mal colocados. **SPEC-009 asume SPEC-008 implementado** (o se implementa en paralelo en la misma rama).

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

### Bloque 1 — Escalada a admin y edición de usuarios (A1)

1. **Ownership check** en `PATCH /users/:id` (`users.controller.ts`): `if (user.id !== id && user.role !== 'admin') throw ForbiddenException` (mismo patrón ya usado en `change-password`).
2. **Quitar `isEmailVerified` de `UpdateUserDto`** (queda solo en el flujo `verify-email`). Dejar `isActive` solo modificable por `admin` (check en el usecase: si `isActive` viene en el body y el autenticado no es admin → 403).
3. **Defensa en profundidad en el mapper**: `UserMongoMapper.toSchemaData()` acepta `role` solo cuando el caller es `create`/`createAdmin` — en `update()` del repositorio **strippear `role` explícitamente** (nunca actualizar rol vía `$set` de update genérico).
4. **Validación de `ObjectId`** en `PATCH /users/:id` (400 en vez de 500 si el id es inválido).

### Bloque 2 — Webpay protegido (A2)

| Ruta | Hoy | Objetivo |
|---|---|---|
| `POST /webpay/create` | `@Public()` | `JwtAuthGuard` + `sessionId` **siempre = `user.id` del token** (ignorar el del body) |
| `POST /webpay/refund` | `@Public()` | `JwtAuthGuard` + `@Roles('admin')` |
| `GET /webpay/status` | `@Public()` | `JwtAuthGuard` + ownership (la transacción consultada debe tener `sessionId === user.id`) |
| `GET /webpay/transaction/:token` | `@Public()` | `JwtAuthGuard` + ownership (idem) |
| `GET /webpay/return` | `@Public()` | **Se mantiene público** (callback de Transbank) |

- `create-transaction.dto.ts`: `sessionId` se elimina del body (o se ignora) y se inyecta desde `req.user.id`.
- Nota: Transbank no firma el `buyOrder` en el commit — validar en `commit-transaction.usecase.ts` que la transacción existe en BD y que el `amount` devuelto por Transbank coincide con el persistido (evita discrepancias).

### Bloque 3 — qr-activate sin fraude (A3)

1. **`CreateQrActivateDto`**: eliminar `state`, `WebpayTransaction` y `TransferDate` de la entrada pública. `state` se fija por el usecase (`PENDING`, o `ADMINCREATED` si `methodActivation=ADMIN` y rol admin). `userId` **siempre del token** (si viene en el body y difiere → 403; los admins pueden indicar `adminId`).
2. **`UpdateQrActivateDto`**: dejar solo campos no transaccionales (`description`, `descriptionAdministrator`). Estados/pagos se transicionan **únicamente** desde `update-webpay-qr-activate.usecase` (commit) o flujo admin dedicado.
3. **Ownership checks** en `GET /qr-activate`, `GET /qr-activate/:id`, `PATCH /qr-activate/:id`: solo admin o el `userId` de la activación. Validar `ObjectId` → 400.
4. `qr-activate.entity.ts`: documentar que `state` solo se muta en infraestructura (commit) — invariante del agregado.

### Bloque 4 — IDOR users y enumeración (A4)

1. `GET /users/:id` → solo `admin` o el propio usuario (403 si ajeno).
2. `GET /users/search` → solo `admin` (o el propio usuario si `username` es el suyo). Alternativa: eliminar y usar `paginated`.
3. `check-email` / `check-username` → se mantienen `@Public()` (funcionalidad de registro) **pero** el throttler de [[SPEC-008]] los cubre; documentar que la enumeración residual es aceptada por diseño (UX registro) — mitigada por mensajes de login homogéneos.
4. **Mensajes homogéneos**: en `auth.service.ts` login → respuesta única `'Credenciales inválidas'` para usuario inexistente y contraseña incorrecta. En `forgot-password.usecase.ts` → responder 200 genérico "si el correo existe, recibirás un código" (no 404). Alternativa (trade-off): mantener 404 solo si el producto lo exige — se decide en implementación.

### Bloque 5 — Códigos criptográficos y límite de intentos (A5)

1. Reemplazar `Math.random().toString(36).substring(2, 8)` por **`crypto.randomBytes(5).toString('hex')`** (10 chars hex ≈ 40 bits) en los 3 generadores (`create-user`, `forgot-password`, `resend-verification`).
2. **Límite de intentos**: en `verify-email.usecase.ts` y `reset-password.usecase.ts` contar intentos fallidos por usuario (campo `verificationAttempts` en `UserSchema`) → tras 5 fallos, invalidar el código (borrarlo). 
3. Throttler por IP en `POST /users/:id/verify-email` y `POST /users/reset-password` ([[SPEC-008]] Capa 4).

### Bloque 6 — Llaves JWT estrictas (A6)

`jwt-keys.ts`: si `NODE_ENV === 'production'` y no hay llaves válidas → **`throw` en bootstrap** (crash temprano). Par efímero solo permitido en `development`/`test`. Verificar que el arranque de Railway/docker-compose en prod ya inyecta `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (formato PEM inline).

### Bloque 7 — IDOR scan + flood (A7, A9)

1. `scan.controller.ts`: en `getStats/getRecentScans/getDailyStats/getLocationStats/getDeviceStats` verificar propiedad: cargar QR (`getQrUseCase`) → `qr.userId === user.id || admin`, sino 403.
2. `create-scan.usecase.ts`: **validar que el QR existe** (`getById`) → si no existe, 404 (no crear doc). `userIdScan`/`userId` del body: si no coinciden con el dueño del QR, se ignoran (el dueño real se toma del QR). Esto evita inflar analytics ajenos y el flood.

### Bloque 8 — Refresh token con rotación (A8)

1. Nueva colección `refresh_tokens`: `{ userId, tokenHash (SHA-256 del token), expiresAt, revokedAt, createdAt }` (nunca guardar el token plano; usar índice TTL en `expiresAt`).
2. `refreshToken()`: buscar por hash → si no existe o está revocado → 401; **rotar**: revocar el actual y emitir uno nuevo. Detección de reuso: si llega un token ya rotado (hash existe + `revokedAt`), **revocar toda la familia** (incrementar `tokenVersion` del usuario) — respuesta 401.
3. `logout()`: además de `tokenVersion++`, revocar los refresh activos del usuario.
4. `change-password` y `reset-password`: incrementar `tokenVersion` (invalida sesiones previas).
5. Acceso token sigue en body (contrato actual) — evaluar cookies httpOnly+SameSite en SPEC futura (depende frontend).

### Bloque 9 — Reducción de superficie pública (A10, A11, A12)

1. `get-public-qr.usecase.ts`: `id` del response = `qr.idQr` (UUID público) en vez de `qr.userId`.
2. `GET /pet-tag/public/status/:idQr`: respuesta mínima por defecto → `{ status, petName, ownerName, phone }` (contacto). **Omitir** `address`, `diseases`, `vaccines`, `observations` por defecto. Debatible con producto: si los veterinarios necesitan acceso, mover a ruta protegida o consentimiento explícito del dueño (decisión de negocio, ver Trade-offs).
3. Throttler en `PATCH /pet-tag/activate` (ej. 10/min por IP) + retraso exponencial por `idQr` con 3 intentos fallidos (bloqueo temporal de la placa).
4. `GET /qr/seo-idqr`: mantener (sitemap), pero considerar quitar `updatedAt` si no es necesario — no filtra PII (idQr es UUID v4).

### Bloque 10 — Redacción de logs (A13)

1. `TraceService`/controllers webpay: loguear `token_ws` **truncado** (`token.slice(0, 8) + '…'`). Helper `redact()` en `src/common/utils/`.
2. `ResponseLoggerInterceptor`: excluir/redactar bodies de `/auth/login`, `/auth/refresh`, `/webpay/*`, y cualquier campo `password|token|code|pin` en objetos anidados.

## 5. Configuración

Sin variables nuevas obligatorias. Opcional:

```env
# backend-portaqr/.env (opcional)
REFRESH_TOKEN_TTL_DAYS=7
VERIFICATION_MAX_ATTEMPTS=5
```

| Variable | Dónde | Obligatoria |
|---|---|---|
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | `jwt-keys.ts` | **Sí en prod** (ahora falla el arranque si faltan) |

## 6. Criterios de aceptación

- [ ] **CA-01 (A1)**: `PATCH /users/{B}` autenticado como A (no admin) → 403; `PATCH /users/{A}` como A con `{isEmailVerified: true}` → el campo no cambia (fuera de DTO); `PATCH` con `{role:"admin"}` → 400/ignorado y rol intacto
- [ ] **CA-02 (A2)**: `POST /webpay/refund` sin token → 401; con token de usuario `user` → 403; con token `admin` → funciona; `GET /webpay/status?token=X` donde la tx es de otro → 403
- [ ] **CA-03 (A3)**: `POST /qr-activate` con `state:"PAYED"` en body → 400 (campo fuera de DTO) o 403; con `userId` ajeno → 403; `PATCH /qr-activate/:id` de otro usuario → 403; `GET /qr-activate` solo muestra las propias (salvo admin)
- [ ] **CA-04 (A4)**: `GET /users/{id-ajeno}` → 403 (no admin); login de usuario inexistente vs contraseña errónea → **mismo mensaje y mismo status**; forgot-password de email inexistente → 200 genérico
- [ ] **CA-05 (A5)**: verificar en código que ya no existe `Math.random().toString(36)` en el proyecto; `verify-email` con 6 códigos errados → 7mo intento devuelve "código expirado/inválido" y el código fue borrado; verificación con código correcto → 200
- [ ] **CA-06 (A6)**: `NODE_ENV=production` sin llaves JWT → el proceso **no arranca** (error claro); con llaves → arranca y firma RS256
- [ ] **CA-07 (A7/A9)**: `GET /scan/{idQr-ajeno}/stats` → 403; `POST /scan/stats` con `idQr` inexistente → 404 y **no se crea documento**; con `userIdScan` ajeno al dueño → se ignora
- [ ] **CA-08 (A8)**: refrescar dos veces con el mismo refresh token → el 2º uso recibe 401 **y** el access token emitido previamente queda invalidado (tokenVersion bump); tras `change-password`, el refresh viejo → 401
- [ ] **CA-09 (A10/A11/A12)**: `GET /qr/public/:id` no contiene el `userId` del dueño; `GET /pet-tag/public/status/:idQr` no incluye `address`/`diseases`; >10 `PATCH /pet-tag/activate` fallidos por min → 429
- [ ] **CA-10 (A13)**: en logs de `/webpay/return`, el `token_ws` aparece truncado (≤ 8 chars); `POST /auth/login` no loguea la contraseña
- [ ] **CA-11**: suite de tests existente pasa (ajustar specs que asumían comportamiento viejo); `tsc --noEmit` sin errores
- [ ] **CA-12**: flujo E2E feliz intacto: registro → verify → login → crear QR → crear activación WEBPAY → commit → QR activo

## 7. No funcionales

- **Rendimiento**: 1 lookup extra por refresh (colección indexada) — despreciable; límite de intentos solo escribe en fallos.
- **Compatibilidad**: contratos de API casi sin cambios (solo se añaden 403/401 y se quitan campos de entrada que el frontend no envía — verificar con qr-app). `GET /webpay/status` y `transaction/:token` pasan a requerir auth: **el frontend debe enviar Bearer** — coordinar con qr-app.
- **Seguridad**: SHA-256 para hash de refresh (HMAC no necesario: el hash no se usa como firma); códigos hex de 40 bits + 5 intentos = ~2^34 trabajo esperado por cuenta (inviable online).
- **Mantenibilidad**: helpers (`redact`, generador de códigos) en `src/common/utils/` con unit tests; invariantes de `state` documentados en el agregado.

## 8. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| `refund` solo admin | Refund autenticado para el dueño | El refund es operación de soporte/negocio; el dueño ya tiene el flujo de reclamación |
| Mantener `check-email`/`check-username` públicos | Moverlos tras auth | Funcionalidad de registro UX; la enumeración residual se mitiga con throttler + mensajes homogéneos |
| `forgot-password` responde 200 genérico | Mantener 404 | Evita enumeración; costo: el usuario no sabe si el email existe (aceptable, es estándar OWASP) |
| pet-tag status público sin `address` | Exponer PII completa | Balance: el propósito de la placa es contactar al dueño (nombre+teléfono bastan); dirección/datos médicos requieren decisión de producto (futuro: flujo de consentimiento) |
| Rotación con colección `refresh_tokens` | Rotación in-memory / jti en JWT | Persistente y escalable multi-instancia; TTL index limpia automáticamente |
| `state` fuera de DTOs (solo usecases lo mutan) | Confiar en validación server-side del valor | Menor superficie: el cliente nunca decide estados transaccionales |
| Fallar arranque en prod sin llaves | Fallback efímero (hoy) | Fail-fast: un arranque sin llaves es un error de configuración, no un modo degradado |

## 9. Trabajo futuro (backlog)

- [ ] Implementar Bloque 1 (ownership users + DTO sin isEmailVerified + strip role en update) — ~1h
- [ ] Implementar Bloque 2 (webpay auth + sessionId del token + validación amount) — ~2h
- [ ] Implementar Bloque 3 (qr-activate DTOs + ownership) — ~2h
- [ ] Implementar Bloque 4 (IDOR users + mensajes homogéneos) — ~1.5h
- [ ] Implementar Bloque 5 (códigos crypto + límite intentos) — ~2h
- [ ] Implementar Bloque 6 (fail-fast llaves JWT) — ~30 min
- [ ] Implementar Bloque 7 (scan ownership + validar QR existe) — ~1h
- [ ] Implementar Bloque 8 (refresh tokens colección + rotación) — ~3h
- [ ] Implementar Bloque 9 (respuesta pública reducida + throttler activate) — ~1.5h
- [ ] Implementar Bloque 10 (redacción logs) — ~1h
- [ ] Coordinar con qr-app: Bearer en /webpay/status y /transaction (si el frontend los usa)
- [ ] Validación final: tsc, tests, CA-01..CA-12, actualizar SPEC a `implementado`
- [ ] (Futuro) Evaluar cookies httpOnly + SameSite para refresh token (SPEC separada)
