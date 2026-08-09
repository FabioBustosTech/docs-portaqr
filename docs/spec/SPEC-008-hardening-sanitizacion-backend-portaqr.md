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
status: borrador
aliases:
  - SPEC-008
  - Hardening sanitización backend
---

# SPEC-008: Hardening de sanitización y seguridad de entradas (`backend-portaqr`)

> [!abstract] Decisión clave
> Blindar las entradas del monolito `backend-portaqr` con una **defensa en profundidad de 3 capas** (validación → saneamiento → perimetral). Se corrigen 3 riesgos reales encontrados en auditoría: (1) **XSS por HTML injection sin escapar en el correo de contacto**, (2) **ReDoS por `$regex` con input del usuario en 6 repositorios**, (3) **ValidationPipe global sin `whitelist`/`forbidNonWhitelisted`/`transform`** (mass-assignment + NaN). Se añade perimetral: `helmet`, CORS whitelist y `@nestjs/throttler`. La inyección NoSQL clásica (operadores `$ne`/`$gt`/`$where`) NO es explotable hoy (DTOs en todos los endpoints + mappers whitelist + Mongoose strict) — se mantiene como defensa extra opcional con `express-mongo-sanitize`.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-09
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

### 2.2 Riesgos encontrados en auditoría

| # | Severidad | Riesgo | Ubicación |
|---|---|---|---|
| R1 | 🔴 Crítico | **XSS / HTML injection en correo de contacto** — `nombre`, `asunto`, `mensaje` interpolados en HTML sin escapar (`${message.x}`). `</p><img onerror=...>` se ejecuta en el cliente de correo del admin | `src/modules/mail/infrastructure/adapters/NodemailerContactAdapter.ts:38-45` |
| R2 | 🟠 Alto | **ReDoS** — término de búsqueda del usuario inyectado directo en `$regex` (~40 campos). Patrón `(a+)+$` → backtracking exponencial (PCRE de MongoDB) → CPU 100% / DoS. Además `.*` fuerza full-collection scan | `mongo-qr`, `mongo-pet-tag` (:102,107), `mongo-user` (:43), `mongo-plan` (:59), `mongo-qr-free-generation` (:65), `mongo-qr-activate` (:56) |
| R3 | 🟠 Alto | **ValidationPipe sin opciones** — sin `whitelist: true` (mass-assignment), sin `forbidNonWhitelisted` (campos desconocidos pasan), sin `transform: true` (los `@Type(() => Number/Date)` nunca corren → `NaN` en `skip`/`limit`, fechas string crudas a Mongo) | `src/main.ts:13` |
| R4 | 🟡 Medio | CORS `origin: '*'`; sin `helmet`; sin rate-limiting (login/registro bruteforceables) | `src/main.ts:18-22` |
| R5 | 🟡 Medio | `new Types.ObjectId(userId)` sin validar → 500 con ID inválido (debe ser 400) | `mongo-qr.repository.ts:213` (`findUserByFavorites`) |
| R6 | 🟡 Medio | Paginación sin DTO en `qr.controller` (`@Query('page') page: number = 1` sin validación ni transform) → NaN/valores negativos | `qr.controller.ts:263-265, 308-311, 470-473` |

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

### Capa 1 — Sanear la salida de correos (fix R1, crítico)

**a)** En `NodemailerContactAdapter`: escapar `nombre`, `email`, `asunto`, `mensaje` antes de interpolar en el HTML. Helper pequeño y probado:

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

**b)** Alternativa (preferida si el mensaje puede crecer): migrar el adapter a una plantilla **EJS** (`<%= %>`) como ya hacen `registerEmail.ejs`/`passwordReset.ejs` — patrón del proyecto, escape automático.

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
- Opcional futuro: índices de texto `$text` para búsqueda real (fuera de alcance).

### Capa 4 — Perimetral (fix R4)

- **`helmet`**: `app.use(helmet())` → headers CSP, `X-Content-Type-Options`, `X-Frame-Options`, etc.
- **CORS whitelist**: reemplazar `origin: '*'` por array de dominios autorizados desde env (`CORS_ORIGINS`), manteniendo `*` solo en dev.
- **`@nestjs/throttler`**: guard global (ej. 10 req/min) + reglas específicas para `/auth/login`, `/auth/register` y `POST /mail/contact` (más agresivo, ej. 5/min).

### Capa 5 — Validaciones puntuales (fix R5, R6)

- **ObjectId**: en `findUserByFavorites` usar `Types.ObjectId.isValid(targetUserIdString)` → `BadRequestException` (400) en vez de excepción interna (500).
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

- [ ] **CA-01 (R1)**: `POST /mail/contact` con `mensaje = '</p><img src=x onerror=alert(1)>'` → el correo recibido muestra el texto escapado (`&lt;/p&gt;`), sin HTML ejecutable
- [ ] **CA-02 (R2)**: búsqueda con `search=(a+)+$` responde en < 200ms (sin hang de CPU); `search=.*` no rompe
- [ ] **CA-03 (R3)**: `POST /qr` con campo extra `"hack": true` → 400 (forbidNonWhitelisted); sin él, el campo no se persiste (whitelist)
- [ ] **CA-04 (R3)**: `GET /qr?page=abc` → 400 (con DTO); `page=2&limit=50` funciona tipado (skip=50)
- [ ] **CA-05 (R4)**: headers de respuesta incluyen `X-Content-Type-Options: nosniff` y CSP de helmet; origen no listado en CORS → bloqueado
- [ ] **CA-06 (R4)**: >10 requests en 60s a `/auth/login` → 429 (throttler)
- [ ] **CA-07 (R5)**: `GET /qr/user/favorites?userId=id-invalido` → 400 (no 500)
- [ ] **CA-08**: la suite de tests existente pasa con los cambios (o se ajustan payloads de specs que enviaban campos extra)
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

- [ ] Implementar Capa 1 (escape correo) — ~30 min
- [ ] Implementar Capa 2 (ValidationPipe) + ajustar specs rotas — ~1h
- [ ] Implementar Capa 3 (escape-string-regexp ×6 repos + MaxLength) — ~1.5h
- [ ] Implementar Capa 4 (helmet + CORS + throttler) — ~1h
- [ ] Implementar Capa 5 (ObjectId + PaginationDto en QR) — ~1h
- [ ] (Opcional) Capa 5b: express-mongo-sanitize — ~15 min
- [ ] Validación final: tsc, tests, CA-01..CA-10, actualizar SPEC a `implementado`
- [ ] Evaluar migración de búsquedas a índices `$text` (SPEC separada)
