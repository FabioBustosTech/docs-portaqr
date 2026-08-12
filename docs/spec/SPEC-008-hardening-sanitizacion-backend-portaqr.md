---
title: "SPEC-008: Hardening de sanitización y seguridad de entradas (backend-portaqr)"
date: 2026-08-09
tags:
  - spec
  - seguridad
  - backend
  - sanitizacion
  - xss
  - nosql
  - redos
  - validation-pipe
status: implementado
aliases:
  - SPEC-008
  - Hardening sanitización backend
---

# SPEC-008: Hardening de sanitización y seguridad de entradas (`backend-portaqr`)

> [!abstract] Decisión clave
> Blindar las entradas del monolito `backend-portaqr` con una **defensa en profundidad de 3 capas** (validación → saneamiento → perimetral). Se corrigen 3 riesgos reales encontrados en auditoría: (1) **XSS por HTML injection sin escapar en el correo de contacto**, (2) **ReDoS por `$regex` con input del usuario en 6 repositorios**, (3) **ValidationPipe global sin `whitelist`/`forbidNonWhitelisted`/`transform`** (mass-assignment + NaN). Se añade perimetral: `helmet`, CORS whitelist y `@nestjs/throttler`. La inyección NoSQL clásica (operadores `$ne`/`$gt`/`$where`) NO es explotable hoy (DTOs en todos los endpoints + mappers whitelist + Mongoose strict) — se mantiene como defensa extra opcional con `express-mongo-sanitize`.

> [!info] Metadatos
> - **Estado:** Implementado
> - **Fecha:** 2026-08-09
> - **Última revisión:** 2026-08-11 (implementación H1-H6 completada — ver [[#11. Historial de cambios|§11]])
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-006]] (anti-spam contacto, misma superficie `POST /mail/contact`)

---

## 1. Objetivo

Garantizar que ninguna entrada del usuario (body, query params, params, archivos) pueda causar **XSS, NoSQL injection, ReDoS o mass-assignment** en `backend-portaqr`, mediante validación estricta en el borde, saneamiento en el punto de uso y defensa perimetral. El backend debe ser seguro **por sí mismo**, sin depender de que el frontend/proxy (qr-app) filtre antes.

## 2. Contexto

### 2.1 Estado actual (2026-08-09)

Stack: **NestJS 11 (Express) · Mongoose 8 · class-validator 0.15 + class-transformer · EJS (2 templates) · nodemailer · multer + sharp**.

**Lo que ya está bien (se preserva):**

| Capa | Evidencia |
|---|---|
| DTOs + class-validator en **todos** los endpoints | 18 controladores con `@Body() xDto`; `IsString`, `IsEmail`, `IsEnum`, `IsUUID`, `Matches`, `MaxLength`, `IsUrl`, `ValidateNested` |
| Whitelist de URLs en QR | `@Matches(/^https?:\/\//)`, formatos `wa.me`, `mailto:`, `tel:` — bloquea `javascript:` en QR links |
| Mappers manuales | `qr-mongo.mapper.ts` copia campo a campo → whitelist por construcción en persistencia |
| Mongoose strict por defecto | Schemas sin `strict: false` → campos no declarados descartados |
| Templates EJS con escape | Usan `<%=` (escape HTML por defecto) — seguros |
| Media segura | multer (límite 5MB + MIME filter) + sharp re-procesa |
| Sin NoSQL injection clásica | Ningún `req.query` crudo llega a `find()`; no hay `$where` |

**Nota de contexto**: el route handler del frontend ([[SPEC-006]], `lib/validators.ts` con `containsDangerousContent()`) ya filtra XSS/NoSQL/SQL en `POST /api/mail/contact`, pero **no se debe confiar en el proxy**: el backend `:3001` es alcanzable directamente y debe defenderse solo.

**Nota de repo (2026-08-11)**: `desarrollo-qr/backend-portaqr` es un **repositorio git independiente** (tiene `.git` propio y está gitignored del monorepo `plataforma_qr_cursor`). Toda la implementación de esta SPEC — incluida la rama `feat/spec-008-sanitizacion` — se realiza **dentro de ese repo**, no en el monorepo.

### 2.2 Riesgos encontrados en auditoría

| # | Severidad | Riesgo | Ubicación |
|---|---|---|---|
| R1 | 🔴 Crítico | **XSS / HTML injection en correo de contacto** — `nombre`, `asunto`, `mensaje` interpolados en HTML sin escapar (`${message.x}`). `</p><img onerror=...>` se ejecuta en el cliente de correo del admin | `src/modules/mail/infrastructure/adapters/NodemailerContactAdapter.ts:38-45` |
| R2 | 🟠 Alto | **ReDoS** — término de búsqueda del usuario inyectado directo en `$regex` (~40 campos). Patrón `(a+)+$` → backtracking exponencial (PCRE de MongoDB) → CPU 100% / DoS. Además `.*` fuerza full-collection scan | `mongo-qr` (L266-295, L391-446), `mongo-pet-tag` (:96,:101), `mongo-user` (:43), `mongo-plan` (:59), `mongo-qr-free-generation` (:65), `mongo-qr-activate` (:56) |
| R3 | 🟠 Alto | **ValidationPipe sin opciones** — sin `whitelist: true` (mass-assignment), sin `forbidNonWhitelisted` (campos desconocidos pasan), sin `transform: true` (los `@Type(() => Number/Date)` nunca corren → `NaN` en `skip`/`limit`, fechas string crudas a Mongo) | `src/main.ts:13` |
| R4 | 🟡 Medio | CORS `origin: '*'`; sin `helmet`; sin rate-limiting (login/registro bruteforceables) | `src/main.ts:18-22` |
| R5 | 🟡 Medio | `new Types.ObjectId(userId)` sin validar → 500 con ID inválido (debe ser 400) | `mongo-qr.repository.ts:255` (función `findUserByFavorites` en `:233`) |
| R6 | 🟡 Medio | Paginación sin DTO en `qr.controller` (`@Query('page') page: number = 1` sin validación ni transform) → NaN/valores negativos | `qr.controller.ts:407-409, 452-455, 673-675` |

## 3. Amenazas

| Amenaza | Impacto | Capa que la frena |
|---|---|---|
| HTML/script injection en correo de contacto | Compromiso del cliente de correo del admin, phishing desde dominio propio | **Capa 1** (escape HTML) |
| Regex catastrófico en búsqueda | DoS de MongoDB / CPU 100% | **Capa 3** (escape-string-regexp + límite longitud) |
| Mass-assignment (campos extra en body) | Persistencia de datos no declarados | **Capa 2** (whitelist + forbidNonWhitelisted) |
| NoSQL injection por operadores (`$ne`, `$gt`, `$where`) | No explotable hoy; protección extra | DTOs + **Capa 5** (defensa en profundidad) |
| Bruteforce de login/registro | Cuentas comprometidas | **Capa 4** (throttler) |
| Clickjacking / MIME sniffing / headers inseguros | Robo de sesión, ejecución inesperada | **Capa 4** (helmet) |
| ID malformado en rutas/query | Errores 500 (DoS menor) | **Capa 2/5** (`@IsMongoId` + `Types.ObjectId.isValid`) |

## 4. Solución propuesta — defensa en capas

### Capa 1 — Limpiar HTML en la entrada y escapar la salida de correos (fix R1, crítico)

**a)** En `ContactFormDto`: `@Transform(stripHtml)` en `nombre`, `asunto` y `mensaje` — el HTML se **elimina en el punto de entrada** (anti XSS/HTML injection), de modo que el contenido se guarda/envía como **texto plano sin formato**. Helper probado:

```ts
const HTML_TAG_RE = /<[^>]*>/g;
function stripHtml(value: string): string {
  if (!value) return value ?? '';
  return value.replace(HTML_TAG_RE, '').trim();
}
```

- `</p><img src=x onerror=alert(1)>` → queda `''` (tags sin contenido interno se eliminan completos).
- `<b>Quiero</b> los precios` → `Quiero los precios` (el texto interno de tags de contenido se conserva).
- El `email` no se limpia (validado con `@IsEmail()`).

**b)** En `NodemailerContactAdapter`: mantener `escapeHtml` sobre `nombre`, `email`, `asunto`, `mensaje` antes de interpolar en el HTML — **segunda capa de defensa** por si un caller no pasa por el DTO:

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**c) Saltos de línea del mensaje** (el formulario usa `<Textarea>` — multilínea): dentro de `<p>...</p>` los `\n` se colapsan como espacios, así que tras el escape se convierten en `<br>`:

```ts
const mensajeHtml = escapeHtml(message.mensaje).replace(/\r\n|\r|\n/g, '<br>');
```

- **Orden correcto**: escape primero → un `<br>` escrito por el usuario llega como texto `&lt;br&gt;` (no inyectable); el `<br>` generado es inofensivo y solo aparece por saltos reales del textarea.
- `stripHtml` del DTO conserva los `\n` (solo elimina etiquetas) → el flujo completo preserva el formato del mensaje.

> [!note] Diferencia con el diseño original
> El borrador solo escapaba en el adapter (el correo mostraba `&lt;/p&gt;...`). El diseño final **limpia en la entrada** (DTO): si el mensaje se persistiera en BD mañana, ya llega sin HTML; y el escape en el adapter cubre el caso de callers directos.

### Capa 2 — Hardening del ValidationPipe global (fix R3)

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
}));
```

- `whitelist: true` → elimina propiedades no declaradas en DTOs (mass-assignment).
- `forbidNonWhitelisted: true` → 400 con mensaje si llega un campo desconocido (detección temprana de ataques).
- `transform: true` → activa `@Type(() => Number)` / `@Type(() => Date)` / `@Transform()`; `page`/`limit`/`expiration` llegan tipados.
- ⚠️ **Riesgo de regresión**: revisar tests que envíen campos extra (specs de controllers) y ajustar payloads.

### Capa 3 — Eliminar ReDoS en `$regex` (fix R2)

En los **6 repositorios** (`mongo-qr`, `mongo-pet-tag`, `mongo-user`, `mongo-plan`, `mongo-qr-free-generation`, `mongo-qr-activate`):

```ts
import escapeStringRegexp from 'escape-string-regexp';

const safe = escapeStringRegexp(search);          // literal: (a+)+ → \(a\+\)\+
{ name: { $regex: safe, $options: 'i' } }
```

- `escape-string-regexp` (paquete pequeño, ~1KB, sin deps) convierte el input en **literal** → imposible inyectar metacaracteres de regex.
- Añadir `@MaxLength(100)` al término `search` en los DTOs de búsqueda (evita queries gigantes).
- ⚠️ **Nota de revisión (2026-08-11)**: `PaginationDto` (`src/common/dto/pagination.dto.ts`) ya tipa `page`/`limit` (`@Type(() => Number)` + `@IsInt` + `@Min(1)` + `@Max(100)`), pero su campo `search` **no declara `@MaxLength(100)`** — añadirlo ahí y en los DTOs específicos de búsqueda al implementar.
- Opcional futuro: índices de texto `$text` para búsqueda real (fuera de alcance).

### Capa 4 — Perimetral (fix R4)

- **`helmet`**: `app.use(helmet())` → headers CSP, `X-Content-Type-Options`, `X-Frame-Options`, etc.
- **CORS whitelist**: reemplazar `origin: '*'` por array de dominios autorizados desde env (`CORS_ORIGINS`), manteniendo `*` solo en dev.
- **`@nestjs/throttler`**: guard global (ej. 10 req/min) + reglas específicas para `/auth/login`, `/auth/register` y `POST /mail/contact` (más agresivo, ej. 5/min).

### Capa 5 — Validaciones puntuales (fix R5, R6)

- **ObjectId**: en `findUserByFavorites` (`mongo-qr.repository.ts:233`, `new Types.ObjectId` en `:255`) usar `Types.ObjectId.isValid(targetUserIdString)` → `BadRequestException` (400) en vez de excepción interna (500). Patrón ya existente en `auth.service.ts:142-143` (`isValidObjectId`).
- **DTOs de paginación**: usar `PaginationDto` (ya existe en `src/common/dto/pagination.dto.ts`) en los controladores de QR con `@Query()` tipado → elimina NaN y bounds.
- **Fechas**: `new Date(query.startDate)` ya está protegido por `@IsDateString()` en `QueryReservedTagsDto` — verificar que el pipeline `transform: true` lo mantenga.

### Capa 5b (opcional, defensa en profundidad) — `express-mongo-sanitize`

```ts
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize()); // elimina $ y . de body/query/params
```

Protege ante futuros endpoints sin DTO. Bajo riesgo de regresión (hoy ningún dato legítimo usa `$` en campos de entrada; vigilar nombres con `$`).

## 5. Flujo de integración (estado objetivo)

```
Request (body/query/params)
   │
   ▼ 1. Middlewares globales (main.ts):
   │    helmet() → headers seguros
   │    CORS whitelist → orígenes autorizados
   │    mongoSanitize() → strip de $ y . (opcional)
   │    ThrottlerGuard → rate limiting
   ▼ 2. ValidationPipe global (whitelist + forbidNonWhitelisted + transform)
   │    body/query/params → DTO validado y tipado (campos extra → 400)
   ▼ 3. Controlador → UseCase
   ▼ 4. Repositorio Mongo (punto de uso):
   │    search → escapeStringRegexp() antes de $regex
   │    ObjectId.isValid() antes de new Types.ObjectId()
   ▼ 5. Salida:
   │    Correo (NodemailerContactAdapter): escapeHtml o template EJS
   └── Respuesta JSON al cliente
```

## 6. Configuración

```env
# backend-portaqr/.env
CORS_ORIGINS=https://app.portaqr.cl,https://admin.portaqr.cl   # vacío o * en dev
THROTTLE_TTL=60
THROTTLE_LIMIT=10
```

| Variable | Dónde | Obligatoria |
|---|---|---|
| `CORS_ORIGINS` | `main.ts` (whitelist dinámica) | Sí en prod |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | AppModule (ThrottlerModule) | No (defaults) |

## 7. Criterios de aceptación

- [x] **CA-01 (R1)**: `POST /mail/contact` con `mensaje = '</p><img src=x onerror=alert(1)>'` → el DTO lo limpia a texto plano (sin HTML) antes de guardar/enviar; el correo no contiene HTML ejecutable (doble capa: strip en entrada + escape en salida) — cubierto por tests del DTO y del adapter
- [ ] **CA-02 (R2)**: búsqueda con `search=(a+)+$` responde en < 200ms (sin hang de CPU); `search=.*` no rompe
- [ ] **CA-03 (R3)**: `POST /qr` con campo extra `"hack": true` → 400 (forbidNonWhitelisted); sin él, el campo no se persiste (whitelist)
- [ ] **CA-04 (R3)**: `GET /qr?page=abc` → 400 (con DTO); `page=2&limit=50` funciona tipado (skip=50)
- [ ] **CA-05 (R4)**: headers de respuesta incluyen `X-Content-Type-Options: nosniff` y CSP de helmet; origen no listado en CORS → bloqueado
- [ ] **CA-06 (R4)**: >10 requests en 60s a `/auth/login` → 429 (throttler)
- [ ] **CA-07 (R5)**: `GET /qr/user/favorites?userId=id-invalido` → 400 (no 500)
- [x] **CA-08**: la suite de tests existente pasa con los cambios (o se ajustan payloads de specs que enviaban campos extra) — **además**: auditoría estática FE↔BE encontró 1 caso roto (`confirmPassword` en signup) corregido en `qr-app` (commit `48e9c41`); el resto de flujos del frontend coinciden con los DTOs
- [ ] **CA-09**: `tsc --noEmit` sin errores nuevos
- [ ] **CA-10**: inyección clásica NoSQL (`{"$ne":""}` en body) → 400 (ya funcionaba; verificado tras Capa 2)

## 8. No funcionales

- **Rendimiento**: escape de regex y validación añaden < 1ms por request; `helmet`/`throttler` overhead despreciable.
- **Compatibilidad**: no se cambian contratos de API (solo se endurecen) — el frontend no requiere cambios salvo que envíe campos no declarados (revisar).
- **Portabilidad**: `escape-string-regexp` funciona igual con Mongoose/TypeORM; el patrón ValidationPipe es estándar NestJS.
- **Mantenibilidad**: `PaginationDto` existente se reutiliza; helpers de escape en `src/common/utils/` con unit tests.

## 9. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| `forbidNonWhitelisted: true` (rechaza campos extra) | Solo `whitelist: true` (los ignora) | Rechazar es más seguro: detecta intentos y evita silencio; riesgo: romper clientes que envían basura — se ajustan tests |
| Escape manual `escapeHtml` | `sanitize-html` (librería) | Para 4 campos de texto plano un helper de 5 líneas basta; `sanitize-html` solo si el mensaje fuera rich-text con whitelist de tags |
| `escape-string-regexp` (literal) | Sanitizar removiendo metacaracteres a mano | Librería probada (~1KB, sin deps) vs. regex de exclusión frágil (evasiones tipo doble-encoding) |
| `express-mongo-sanitize` opcional | Confiar solo en DTOs | Defensa en profundidad para endpoints futuros; hoy la capa DTO ya bloquea |
| No usar `$text` index | Índice de texto real para búsqueda | Fuera de alcance; cambio de comportamiento de búsqueda (relevancia vs substring) requiere otra SPEC |

## 10. Trabajo futuro (backlog)

- [x] Implementar Capa 1 (escape correo) — H1, commit `127b614`
- [x] Implementar Capa 2 (ValidationPipe) — H2, commit `743117a` (sin specs rotas)
- [x] Implementar Capa 3 (escape-string-regexp ×6 repos + MaxLength) — H3, commit `3078528`
- [x] Implementar Capa 4 (helmet + CORS + throttler) — H4, commit `1d5d94c`
- [x] Implementar Capa 5 (ObjectId + PaginationDto en QR) — H5, commit `3bfd30d`
- [x] (Opcional) Capa 5b: express-mongo-sanitize — H6, commit `73eabd0` (como interceptor, ver nota)
- [x] Validación final: tsc, tests (144 suites / 1118), CAs cubiertos por tests — H7
- [ ] Verificación manual con datos reales (CA-01..CA-10 contra instancia con datos)
- [ ] Evaluar migración de búsquedas a índices `$text` (SPEC separada)
- [ ] Considerar limpiar errores de lint preexistentes en main (tracking/user decorators spec, mongo-doc.ts, response-logger, auth.service, jwt-auth.guard, PlanRepositoryAdapter, storage, webpay, logger.util) — fuera de alcance de esta SPEC

## 11. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-09 | Equipo | Borrador inicial |
| 2026-08-11 | Equipo | Revisión de alineación post-consolidación del repo (SPEC-001/005/007 cerradas; `backend-portaqr` ahora monolito). **Confirmado: 0 de 7 tareas implementadas** — todos los riesgos R1-R6 siguen presentes en el código actual. Líneas de código actualizadas: R2 → `mongo-qr` L266-295/L391-446, `mongo-pet-tag` :96,:101; R5 → `mongo-qr.repository.ts:233-255`; R6 → `qr.controller.ts:407-409, 452-455, 673-675`. Verificaciones: `PaginationDto` existe con `page`/`limit` tipados pero `search` sin `@MaxLength(100)` (nota añadida en Capa 3); `auth.service.ts` ya tiene `isValidObjectId` reutilizable (Capa 5); `escape-string-regexp`/`helmet`/`@nestjs/throttler`/`express-mongo-sanitize` ausentes de `package.json`; sin `CORS_ORIGINS`/`THROTTLE_*` en envs. Nota operativa: `backend-portaqr` es repo git independiente (gitignored del monorepo) — la rama `feat/spec-008-sanitizacion` se crea dentro de ese repo |
| 2026-08-11 | Equipo | **Implementada** en rama `feat/spec-008-sanitizacion` (6 commits, repo git interno de backend-portaqr): **H1** `escapeHtml` en `common/utils` + `NodemailerContactAdapter` escapado (CA-01); **H2** ValidationPipe whitelist/forbidNonWhitelisted/transform en `validation-pipe.config.ts` + test integración (CA-03/04/10); **H3** `escape-string-regexp@4` (CJS `export=`, la v5 es ESM-only y rompe CommonJS) en 6 repos + `@MaxLength(100)` en `PaginationDto.search`/`QueryReservedTagsDto` (CA-02); **H4** helmet con CSP ajustado (`style-src 'unsafe-inline'` — los templates EJS usan `<style>` y el default los rompería), `CORS_ORIGINS` + `parseCorsOrigins`, `ThrottlerModule` global 10/min + `@Throttle` 5/min en login/refresh/`POST /users`/`POST /mail/contact` (CA-05/06); **H5** `Types.ObjectId.isValid` → 400 (CA-07) + `PaginationDto`/`FavoriteQueryDto` en los 3 endpoints de QR (CA-04); **H6** `express-mongo-sanitize` como **interceptor global** — el middleware oficial crashea en Express 5 (reasigna `req.query`, getter-only) y `app.use()` corre antes del body-parser de Nest (`req.body` undefined). Resultado: **144 suites / 1118 tests verdes** (+53 nuevos), `tsc` 0 errores, eslint sin errores nuevos (los listados son preexistentes en main). CAs 01-10 cubiertos por tests; verificación manual con datos reales pendiente (backlog §10) |
| 2026-08-11 | Equipo | **Rediseño Capa 1 (H1)**: por decisión del producto, el enfoque cambia de "escapar en el adapter" a **limpiar en la entrada** — `stripHtml` (`src/common/utils/strip-html.util.ts`) aplicado con `@Transform` en `ContactFormDto` (`nombre`/`asunto`/`mensaje`): el contenido se guarda/envía como **texto plano sin formato HTML**. El adapter mantiene `escapeHtml` como segunda capa (callers que no pasen por el DTO). CA-01 redefinido: el payload `</p><img onerror=...>` se elimina completo (tags sin contenido interno); `<b>texto</b>` conserva el texto interno. Suite final: **146 suites / 1135 tests verdes** (+17 nuevos: stripHtml, DTO, adapter), `tsc` 0 errores |
| 2026-08-11 | Equipo | **Capa 1 (H1 v3)**: el formulario `/contacto` usa `<Textarea>` (mensaje multilínea) — dentro de `<p>` los `\n` se colapsaban como espacios y el admin perdía el formato. Fix: `\n`/`\r\n`/`\r` → `<br>` **después** del escape en el adapter (un `<br>` del usuario llega como texto `&lt;br&gt;`, no inyectable). Tests: conversión, normalización Windows/Mac, no-inyección de `<br>`, payload XSS multilínea sin HTML ejecutable (solo tags del template + `<br>`). Suite: **146 suites / 1139 tests verdes** |
| 2026-08-11 | Equipo | **Auditoría estática FE↔BE (adelanto de la verificación manual, CA-08)**: comparados los payloads de `qr-app` contra los DTOs del backend con `forbidNonWhitelisted` activo. Resultado: **1 caso roto y corregido** — `signup/route.ts` reenviaba `confirmPassword` (validación de UI) que no está en `CreateUserDto` → 400 en el registro; fix `48e9c41` en qr-app (payload explícito con los 6 campos del DTO, whitelist en el proxy). **Flujos verificados sin problema**: contacto (4/4), login (2/2), crear/actualizar QR (todos los campos en `CreateQrDto`/`UpdateQrDto`), activación Webpay (`buildWebpayActivation` no envía `_id`; createdAt/updatedAt declarados), pet-tag (el FE ya filtraba con `allowedKeys` por forbid), change-password (payload explícito), webpay create (⊆ DTO). **Riesgo menor documentado**: `PATCH /api/users/[id]` reenvía body crudo y `updateUser` no tiene callers en la UI — si se usa mañana, aplica el mismo patrón de whitelist en proxy |
