# SPEC-001: Migración de 3 microservicios a Monolito Modular (`backend/`)

**Estado:** Borrador
**Fecha:** 2026-08-06
**Autor:** Equipo Plataforma QR
**Decisión clave:** Crear un **nuevo componente `backend/`** que unifica `bff-service` + `user-service` + `qr-service` en un solo proceso NestJS modular. La unificación deja el código listo para una siguiente fase de refactor hacia **DDD + arquitectura hexagonal** (no incluida en este spec).

---

## 1. Objetivo

Construir un nuevo componente `backend/` (NestJS, puerto 3001) que contenga toda la lógica que hoy está repartida en tres servicios, eliminando:

- La **duplicación** de código entre `bff-service` y `qr-service` para `pet-tag`, `plan`, `scan`, `statistics`, `webpay`, `mail`, `qr-activate` y `qr-free-generation`.
- El borde HTTP interno (`@nestjs/axios` + `firstValueFrom` + `AxiosResponse<any>`) que rompe el tipado en runtime.
- Los 3 deploys, 3 `.env`, 3 healthchecks en Railway.

Manteniendo:

- La superficie pública actual del BFF como contrato con el frontend `qr-app`.
- Los límites de módulo NestJS para facilitar la futura extracción hacia hexagonal/DDD.

### 1.1 Beneficios buscados

| Beneficio                                                         | Estado actual | Tras SPEC-001 |
| ---------------------------------------------------------------- | ------------- | ------------- |
| Deploy único en Railway                                           | 3 servicios   | 1 (`backend`) |
| Tipado de extremo a extremo entre módulos                         | No (HTTP `any`) | Sí (inyección directa) |
| Lógica de negocio duplicada                                       | ~40%          | 0%            |
| Latencia de llamada interna (`bff → user` / `bff → qr`)           | +20-60ms      | 0ms           |
| Cobertura de tests (specs portados)                               | fragmentada   | unificada     |
| Punto de partida para DDD/hexagonal                               | disperso      | centralizado  |

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1**. Un único proceso NestJS en el puerto **3001**, exponiendo las rutas que hoy consume el frontend desde `bff-service` (ver §7 API pública).
- **RF-2**. Los módulos de dominio de `qr-service` (qr, scan, plan, pet-tag, webpay, qr-activate, qr-free-generation, statistics, mail) y de `user-service` (users, auth) se importan como **módulos NestJS en-proceso**, sin puerto propio.
- **RF-3**. Se elimina toda comunicación HTTP entre componentes internos. Prohibido en `src/`:
  - `@nestjs/axios`, `HttpService`, `firstValueFrom`, `AxiosResponse`
  - `configService.get('USER_SERVICE_URL' | 'QR_SERVICE_URL')`
- **RF-4**. Conexión única a MongoDB (`MongooseModule.forRootAsync`) a la BD `sistema`. **No hay migración de datos**: hoy `user-service` y `qr-service` ya apuntan a la misma BD física (`mongo:27017/sistema`).
- **RF-5**. Autenticación global con `JwtAuthGuard` (APP_GUARD) aplicada en el mono, con el mismo `JWT_SECRET` que ya comparten user/qr. Se descarta la doble validación (qr-service valida JWT sin tocar BD; user-service lo genera): ahora auth y dominios viven en el mismo proceso y el guard usa `JwtService` contra el mismo `JWT_SECRET`.
- **RF-6**. Superficie pública: ver §7. Como regla general, los **controllers de `user-service` y `qr-service` ganan** como base —ya tienen validaciones de autorización de recurso (ForbiddenException si el usuario no es propietario/admin) que los proxies del bff **no** tienen—. Los del bff se usan como referencia del contrato y se descartan como proxies. Ver §6 para las rutas donde el bff tiene rutas no presentes en qr-service (mail, qr-free-generation) que se deben portar con nueva lógica.
- **RF-7**. Se eliminan las entities y DTOs **espejo** del bff (ver §3.3). Quedan las entities real anotadas con `@Schema` de user/qr-service como única fuente de verdad. El bff no tiene `@nestjs/mongoose`; el mono sí (heredado de user/qr-service).
- **RF-8**. Un `Dockerfile` en `backend/Dockerfile` y `docker-compose.yml` actualizado con: `mongo` + `mongo-express` + `backend` (3001:3001) + `qr-app` (3000:3000). Se eliminan los servicios `bff-service`, `user-service`, `qr-service`.
- **RF-9**. **Estructura preparada para DDD/hexagonal** (sin применения todavía): cada módulo de dominio se aísla en su carpeta sin imports cruzados hacia otro dominio. Las dependencias entre dominios (si existen) se resuelven con interfaces en `shared/` (introducidas en fase 2, no en este spec).
- **RF-10**. Se expone `GET /auth/profile` que ya existe en `user-service` pero el bff no exponía —mejora mínima y alinea el contrato publicado en §7.

### 2.2 Criterios de aceptación (CA)

- **CA-01**. `GET /health` del mono responde 200 e incluye estado de la conexión a MongoDB.
- **CA-02**. Flujo `POST /auth/login`, `POST /auth/refresh`, `GET /auth/profile` y una ruta autenticada de `/users` funcionan contra el mono.
- **CA-03**. CRUD de `/qr`, `/scan`, `/pet-tag` y `/plan` funcionan contra el mono, **incluyendo las validaciones de autorización** (`ForbiddenException` cuando un usuario no admin intenta acceder a un QR/scan ajeno).
- **CA-04**. No hay ninguna ruta pública del bff con método/status/payload distinto en el mono (validación con `postman_collection.json` y `postman_collection_qr_free.json`). Se documenta expresamente en §8 toda diferencia intencional.
- **CA-05**. `npm run build` y `npm run test` pasan en `backend/` con los `.spec.ts` portados de user-service y qr-service (ajustando imports).
- **CA-06**. El frontend `qr-app` apuntando a `http://localhost:3001` recorre sin errores: login, dashboard, listado QR, detalle QR, pet-tags, planes, webpay.
- **CA-07**. Cero ocurrencias de `@nestjs/axios`, `HttpService`, `firstValueFrom`, `AxiosResponse` en `backend/src/`. Cero ocurrencias de `USER_SERVICE_URL` o `QR_SERVICE_URL` en `backend/.env.example` o `backend/src/`.
- **CA-08**. `docker-compose.yml` levanta solo `mongo` + `mongo-express` + `backend` + `qr-app`. `docker compose up` arranca limpio desde `npm run build` del mono.
- **CA-09**. Railway queda operativo con un solo servicio backend (`backend`) + `qr-app` + Mongo.
- **CA-10**. La carpeta `backend/src/` queda estructurada por módulos NestJS autónomos; ningún módulo de dominio importa símbolos de otro módulo de dominio (excepto vía `shared/`). Ver §6 para la única excepción documentada (`auth → users`).
- **CA-11**. Se preservan `TrackingIdMiddleware` y `RequestLoggerEntryMiddleware` y `ResponseLoggerInterceptor` con su comportamiento actual.

### 2.3 Reglas de negocio (R)

- **R-01**. **No se cambia lógica de negocio** durante la migración; solo mover, fusionar y conectar. Todo cambio de comportamiento se hace en PRs posteriores (fase DDD/hexagonal).
- **R-02**. No cambian los nombres de colecciones ni las entidades (`users`, `qrcodes`, `scans`, `plans`, `pettags`…). Se respetan los `@Schema({ collection: ... })` de qr-service.
- **R-03**. Se conserva el sistema de roles/`@Public()` del JWT actual del bff (`RolesGuard`, `@Public()`, `@Roles('admin'|'user')`).
- **R-04**. Se conservan `TrackingIdMiddleware` y `RequestLoggerEntryMiddleware` y `ResponseLoggerInterceptor`.
- **R-05**. El puerto público del backend es **3001** (reemplaza al `bff-service`). Los puertos 3002 (user) y 3003 (qr) se dejan de mapear.
- **R-06**. **`bff-service/src/*` no se borra** durante la migración. Se preservan las carpetas originales hasta el final del plan (CA-09 confirmado en Railway) para permitir rollback. Una vez validado en producción, se eliminan del repo en un PR de cleanup posterior.

---

## 3. Estado actual: inventario exacto

### 3.1 Estructura de los 3 servicios

```
plataforma_qr_cursor/
├─ bff-service/      (NestJS, puerto 3001, proxies HTTP hacia user/qr)
│   ├─ N Mongoose NO → entities/ son clases planas o vacías (espejo)
│   ├─ Controllers: SÍ expuestos al frontend (12 archivos .controller.ts)
│   ├─ Services: SÍ usan HttpService → user-service / qr-service
│   └─ Sin @nestjs/mongoose configurado en app.module.ts
│
├─ user-service/     (NestJS, puerto 3002, dueño de users + auth)
│   ├─ SÍ Mongoose (MongooseModule.forRootAsync + uri: MONGODB_URI)
│   ├─ Entities reales @Schema: users
│   ├─ Auth: JWT (genera access + refresh), bcrypt
│   ├─ Email (nodemailer) + templateEmail/
│   ├─ scripts/create-admin.ts (CLI para crear admin)
│   └─ Controllers duplicados con el bff (auth, users)
│
└─ qr-service/       (NestJS, puerto 3003, dueño del dominio QR)
    ├─ SÍ Mongoose (igual que user-service)
    ├─ Entities reales @Schema: qr, scan, plan, pet-tag, qr-activate, qr-free-generation, webpay
    ├─ Auth: NO genera tokens, solo valida JWT (JwtStrategy + JwtAuthGuard)
    ├─ webpay: usa transbank-sdk
    ├─ mail: usa nodemailer (duplicado del bff)
    └─ Controllers duplicados con el bff (qr, scan, plan, pet-tag, webpay, qr-activate, qr-free-generation, statistics, mail)
```

> **Observación crítica:** los `auth/guards/jwt-auth.guard.ts` existen en los 3 servicios (bff, user, qr) con contenido ligeramente distinto. Los `decorators/` (`public`, `roles`, `user`) son virtualmente idénticos. La `JwtStrategy` de user-service consulta la BD; la de qr-service valida sin BD (solo firma). Ver §6.1 para la resolución.

### 3.2 Inventario de archivos por servicio

#### `bff-service/src/` (47 archivos .ts)

| Ruta                            | Archivos                                                                     | Notas                                           |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `/`                             | `app.module.ts`, `main.ts`, `types/express-response.d.ts`, `utils/logger.util.ts` | `main.ts` usa `process.env.SERVER_PORT \|\| 3000` |
| `auth/`                         | `auth.controller.ts`, `auth.service.ts`, `auth.module.ts`<br>`decorators/`: `public`, `roles`, `user`<br>`guards/`: `jwt-auth`, `roles`<br>`strategies/`: `jwt.strategy.ts` | Controller expone solo `/login` y `/refresh` (no `/profile`) |
| `health/`                       | `health.controller.ts`, `health.module.ts`                                   | Sin check de BD                                 |
| `mail/`                         | `mail.controller.ts`, `mail.service.ts`, `mail.module.ts`, `dto/contact-form.dto.ts` | Ruta `POST /mail/contact`                       |
| `pet-tag/`                      | `pet-tag.controller.ts`, `pet-tag.service.ts`, `pet-tag.module.ts`<br>`dto/`: `activate-pet-tag`, `create-pet-tag`, `generate-pet-tags`, `pet-tag`, `query-reserved-tags`, `update-pet-tag`<br>`enums/commercial-status.enum.ts`<br>`*.controller.spec.ts`, `*.service.spec.ts` | Controller expone `/admin/generate`, `/admin/reserved`, `/public/status/:idQr`, `/update/:petTagId`, `/activate` |
| `plan/`                         | `plan.controller.ts`, `plan.service.ts`, `plan.module.ts`<br>`dto/create-plan.dto.ts`, `dto/update-plan.dto.ts`<br>`entities/plan.entity.ts` (clase plana, sin @Schema, ** espejo muerto**)<br>`*.spec.ts` | 5 rutas: POST, GET, GET /active, GET /:id, PATCH /:id, DELETE /:id |
| `qr/`                           | `qr.controller.ts`, `qr.service.ts`, `qr.module.ts`<br>`dto/create-qr.dto.ts`, `dto/qr-seo.dto.ts`, `dto/update-qr.dto.ts`<br>`entities/qr.entity.ts` → `export class Qr {}` (**vacío, muerto**) | Controller expone 9 rutas                       |
| `qr-activate/`                  | `qr-activate.controller.ts`, `qr-activate.service.ts`, `qr-activate.module.ts`<br>`dto/create-qr-activate.dto.ts`, `dto/update-qr-activate.dto.ts`<br>`entities/qr-activate.entity.ts` (**muerto**)<br>`*.spec.ts` | Tiene ruta `PATCH /webpay/:token_ws`            |
| `qr-free-generation/`           | `qr-free-generation.controller.ts`, `qr-free-generation.service.ts`, `*.module.ts`<br>`dto/create-qr-free-generation.dto.ts` | Sin entity, sin spec (diferente a qr-service)  |
| `scan/`                         | `scan.controller.ts`, `scan.service.ts`, `scan.module.ts`<br>`dto/create-scan.dto.ts` (vacío), `dto/create-scan-stats.dto.ts`, `dto/update-scan.dto.ts`<br>`entities/scan.entity.ts` (**muerto**)<br>`*.spec.ts` | Rutas `/stats`, `/:id/stats`, `/:id/recent`, `/:id/daily`, `/:id/locations`, `/:id/devices` |
| `statistics/`                   | `statistics.controller.ts`, `statistics.service.ts`, `statistics.module.ts` | `/user/:userId`, `/system`                       |
| `users/`                        | `users.controller.ts`, `users.service.ts`, `users.module.ts`<br>`dto/`: `ChangePassword.dto.ts`, `create-user.dto.ts`, `update-user.dto.ts`<br>`entities/user.entity.ts` (clase plana, **espejo muerto**)<br>`*.spec.ts` | 14 rutas                                        |
| `webpay/`                       | `webpay.controller.ts`, `webpay.service.ts`, `webpay.module.ts`, `dto/create-transaction.dto.ts` | `/create`, `/return`, `/refund`, `/status`, `/transaction/:token` |
| `middleware/`, `interceptors/`  | `tracking-id.middleware.ts`, `request-logger-entry.middleware.ts`, `response-logger.interceptor.ts` | Idénticos a user/qr-service                     |

#### `user-service/src/` (24 archivos .ts)

| Ruta                                       | Archivos                                                          | Notas                                  |
| ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| `/`                                        | `app.module.ts`, `main.ts`                                        | `main.ts` ya tiene CORS + pipes        |
| `auth/`                                    | `auth.controller.ts`, `auth.service.ts`, `auth.module.ts`<br>`dto/login.dto.ts`, `dto/token.dto.ts`<br>`decorators/`: `public`, `roles`, `user`<br>`guards/`: `jwt-auth`, `roles`<br>`strategies/jwt.strategy.ts` | **Lógica real de login + refresh + profile** |
| `config/mongodb.config.ts`                 |                                                                   |                                        |
| `health/`, `interceptors/`, `middleware/`  | Idénticos al bff                                                  |                                        |
| `scripts/create-admin.ts`                  | CLI para crear usuario admin (***importante***)                    |                                        |
| `templateEmail/`                           | Plantillas HTML para emails                                        | Recurso no-.ts (ver §9)                |
| `users/`                                   | `users.controller.ts`, `users.service.ts`, `users.module.ts`<br>`dto/`: `ChangePassword.dto.ts`, `create-user.dto.ts`, `update-user.dto.ts`<br>`entities/user.entity.ts` (con `@Schema`, índices)<br>`*.spec.ts` | **Service con toda la lógica CRUD + verificación email + reset password** |
| `utils/`                                   | `email.service.ts`, `email.module.ts`, `logger.util.ts`           | email.service NO está en el bff       |

#### `qr-service/src/` (41 archivos .ts)

| Ruta                                       | Archivos                                                                                                                                                                       | Notas                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `/`                                        | `app.module.ts`, `main.ts`                                                                                                                                                     |                                                       |
| `auth/`                                    | `auth.module.ts` (**sin controller ni service**), `config.validation.ts`<br>`decorators/`: `public`, `roles`, `user`<br>`guards/`: `jwt-auth`, `roles`<br>`strategies/jwt.strategy.ts` | Solo valida JWT, sin BD                          |
| `health/`, `interceptors/`, `middleware/`  | Idénticos                                                                                                                                                                       |                                                       |
| `mail/`                                    | `mail.controller.ts`, `mail.service.ts`, `mail.module.ts`, `dto/contact-form.dto.ts`                                                                                          | Duplicado con bff                                    |
| `pet-tag/`                                 | `pet-tag.controller.ts`, `pet-tag.service.ts`, `*.module.ts`<br>`dto/`: `activate-pet-tag`, `create-pet-tag`, `generate-pet-tags`, `pet-tag`, `query-reserved-tags`, `update-pet-tag`<br>`entities/pet-tag.entity.ts` (con @Schema)<br>`enums/commercial-status.enum.ts`<br>`*.spec.ts` | **Entity real + service con toda la lógica**          |
| `plan/`                                    | `plan.controller.ts`, `plan.service.ts`, `*.module.ts`<br>`dto/`: `create-plan.dto.ts`, `update-plan.dto.ts`<br>`entities/plan.entity.ts` (con @Schema)<br>`*.spec.ts`           |                                                       |
| `qr/`                                      | `qr.controller.ts`, `qr.service.ts`, `*.module.ts`<br>`dto/`: `create-qr.dto.ts`, `qr-seo.dto.ts`, `update-qr.dto.ts`, `url-item.dto.ts`<br>`entities/`: `qr.entity.ts` (con @Schema), `vacrd.entity.ts`<br>`interfaces/dashboard-item.interface.ts`<br>`*.spec.ts` | **Controller con validaciones de autorización que el bff NO tiene** |
| `qr-activate/`                             | `qr-activate.controller.ts`, `qr-activate.service.ts`, `*.module.ts`<br>`dto/`: `create-qr-activate.dto.ts`, `qr-activate-response.dto.ts`, `update-qr-activate.dto.ts`<br>`entities/qr-activate.entity.ts` (con @Schema)<br>`*.spec.ts` |                                                       |
| `qr-free-generation/`                      | `qr-free-generation.controller.ts`, `qr-activate.service.ts`, `*.module.ts`<br>`dto/`: `create-qr-free-generation.dto.ts`, `update-qr-free-generation.dto.ts`<br>`entities/qr-free-generation.entity.ts` (con @Schema)<br>`*.spec.ts` | **No está como entity en el bff**                     |
| `scan/`                                    | `scan.controller.ts`, `scan.service.ts`, `scan.module.ts`<br>`dto/`: `create-scan.dto.ts`, `update-scan.dto.ts`<br>`entities/scan.entity.ts` (con @Schema)                     |                                                       |
| `statistics/`                              | `statistics.controller.ts`, `statistics.service.ts`, `statistics.module.ts`                                                                                                   |                                                       |
| `user/`                                    | `entities/user.entity.ts` (sin @Schema, **lightweight**), `interface/usuario.type.ts`                                                                                          | Solo tipo/interface para uso interno de qr-service    |
| `webpay/`                                  | `webpay.controller.ts`, `webpay.service.ts`, `webpay.module.ts`<br>`dto/`: `create-transaction.dto.ts`, `create-webpay.dto.ts`, `refund-transaction.dto.ts`, `update-webpay.dto.ts`<br>`entities/`: `atransaction.entity.ts`, `webpay.entity.ts`<br>`interfaces/transaction-result.interface.ts`<br>`webpay.config.ts` |                                                       |
| `utils/logger.util.ts`                     |                                                                                                                                                                                 |                                                       |

### 3.3 Inventario de duplicación / muertos detectados

| Elemento                                | En bff-service                           | En user-service | En qr-service                      | Resolución       |
| ---------------------------------------- | ----------------------------------------- | --------------- | ----------------------------------- | ---------------- |
| `auth/guards/jwt-auth.guard.ts`          | ✓                                         | ✓               | ✓                                   | Conservar versión user-service (consulta BD) |
| `auth/strategies/jwt.strategy.ts`        | ✓                                         | ✓ (con BD)     | ✓ (sin BD)                          | Conservar user-service |
| `auth/decorators/*`                      | ✓                                         | ✓               | ✓ (idénticos)                       | Conservar uno; borrar duplicados |
| `auth/guards/roles.guard.ts`             | ✓                                         | ✓               | ✓                                   | Conservar uno    |
| `auth/auth.service.ts`                   | Proxy HTTP a `/auth/login` y `/auth/refresh` | **REAL** (bcrypt + JWT) | —                         | Conservar user-service; borrar proxy del bff |
| `auth/auth.controller.ts`                | 2 rutas (login, refresh)                  | 3 rutas (login, refresh, profile) | —                          | Conservar user-service (añade `/profile`)    |
| `users/users.service.ts`                 | Proxy HTTP a `/users/*`                   | **REAL CRUD**   | —                                   | Conservar user-service; borrar proxy del bff |
| `qr/qr.service.ts`                       | Proxy HTTP a `/qr/*`                      | —               | **REAL con validaciones de authz**  | Conservar qr-service; borrar proxy del bff |
| `qr/qr.controller.ts`                    | 9 rutas, **sin validación de propietario**| —               | 9 rutas + 1 (`user/:userId`), **con ForbiddenException** | Conservar qr-service |
| `entities/plan.entity.ts` (bff)          | Clase plana, sin `@Schema`                | —               | `@Schema` real                     | Borrar bff; usar qr-service |
| `entities/qr.entity.ts` (bff)            | `export class Qr {}` (**vacío**)          | —               | `@Schema` real (285 líneas)         | Borrar bff; usar qr-service |
| `entities/user.entity.ts` (bff)          | Clase plana, sin `@Schema`                | `@Schema` con índices | —                       | Borrar bff; usar user-service |
| `entities/scan.entity.ts` (bff)          | Sin `@Schema`                             | —               | `@Schema` real                      | Borrar bff; usar qr-service |
| `entities/qr-activate.entity.ts` (bff)   | Sin `@Schema`                             | —               | `@Schema` real                      | Borrar bff; usar qr-service |
| `mail/`, dto                             | ✓ (lite)                                 | —               | ✓ (con entity implícita)            | Conservar qr-service (incluye service real) |
| `pet-tag/`, dto, enums                  | ✓ (**sin entity**)                         | —               | ✓ con `entities/pet-tag.entity.ts`  | Conservar qr-service (entity + lógica real) |
| `qr-free-generation/`                    | ✓ (sin entity, sin spec)                  | —               | ✓ con `entities/qr-free-generation.entity.ts`, spec, dto/update | Conservar qr-service |
| `webpay/` dto + interfaces               | 1 dto                                     | —               | 4 dto + entities + iface + config  | Conservar qr-service |
| `middleware/tracking-id.middleware.ts`   | ✓                                         | ✓               | ✓                                   | Conservar uno; borrar duplicados |
| `interceptors/response-logger.interceptor.ts` | ✓                                    | ✓               | ✓                                   | Conservar uno; borrar duplicados |
| `utils/logger.util.ts`                  | ✓                                         | ✓               | ✓                                   | Conservar uno; borrar duplicados |
| `tasks/scripts/create-admin.ts`         | —                                         | ✓               | —                                   | Portar a `backend/src/scripts/` |
| `templateEmail/` (assets)               | —                                         | ✓               | —                                   | Portar a `backend/src/templateEmail/` |
| `config/mongodb.config.ts`              | —                                         | ✓               | —                                   | Portar a `backend/src/config/mongodb.config.ts` |
| `auth/dto/login.dto.ts`, `token.dto.ts` | —                                         | ✓               | —                                   | Portar al `auth/` fusionado |
| `utils/email.service.ts`, `email.module.ts` | —                                      | ✓               | —                                   | Portar al `shared/email/` (fase inicial `users/` o `mail/`) |

---

## 4. Arquitectura objetivo

### 4.1 Diagrama de contexto

```
qr-app (Next.js, 3000)
        │  HTTPS con Authorization: Bearer <jwt>
        ▼
─────────────────────────────────────────────────────────
   backend (NestJS, 3001)   ← NUEVO componente mono modular
─────────────────────────────────────────────────────────
   ├─ ConfigModule (global)
   ├─ MongooseModule.forRootAsync(MONGODB_URI → "sistema")
   │
   ├─ [Infraestructura cross-cutting]
   │   ├─ TrackingIdMiddleware
   │   ├─ RequestLoggerEntryMiddleware
   │   ├─ ResponseLoggerInterceptor
   │   └─ AuthModule
   │        ├─ JwtAuthGuard (APP_GUARD global, con BD)
   │        ├─ RolesGuard, @Public(), @Roles(), @GetUser()
   │        └─ JwtStrategy (con BD, versión user-service)
   │
   ├─ [Dominio] AuthModule        (controller login/refresh/profile)
   ├─ [Dominio] UsersModule       (controller + service + entity @Schema)
   ├─ [Dominio] QrModule           (controller + service + entity + dto)
   ├─ [Dominio] ScanModule
   ├─ [Dominio] PlanModule
   ├─ [Dominio] PetTagModule
   ├─ [Dominio] WebpayModule       (transbank-sdk)
   ├─ [Dominio] QrActivateModule
   ├─ [Dominio] QrFreeGenerationModule
   ├─ [Dominio] StatisticsModule
   ├─ [Dominio] MailModule         (nodemailer)
   ├─ [Soporte shared] EmailService (heredado de user-service)
   └─ HealthModule
        ▼
        MongoDB (sistema)
```

### 4.2 Estructura de `backend/src/`

```
backend/
├─ src/
│   ├─ main.ts                      (puerto 3001, CORS, ValidationPipe, interceptors)
│   ├─ app.module.ts                (unión de todos los módulos + MongooseModule)
│   ├─ config/
│   │   └─ mongodb.config.ts             (de user-service)
│   │
│   ├─ auth/                         (fusión: lógica de user + guards del bff + /profile)
│   │   ├─ auth.module.ts
│   │   ├─ auth.controller.ts         (login, refresh, profile)
│   │   ├─ auth.service.ts            (de user-service: bcrypt + JwtService)
│   │   ├─ dto/                       (login.dto.ts, token.dto.ts — de user-service)
│   │   ├─ decorators/               (public, roles, user — uno solo)
│   │   ├─ guards/                    (jwt-auth.guard, roles.guard — uno solo)
│   │   ├─ strategies/               (jwt.strategy.ts con BD)
│   │   └─ config.validation.ts       (de qr-service si aplica)
│   │
│   ├─ users/                         (de user-service completo)
│   │   ├─ users.module.ts
│   │   ├─ users.controller.ts
│   │   ├─ users.service.ts
│   │   ├─ dto/                       (create, update, change-password)
│   │   └─ entities/                  (user.entity.ts con @Schema)
│   │
│   ├─ qr/                            (de qr-service completo)
│   ├─ scan/                          (de qr-service completo)
│   ├─ plan/                          (de qr-service completo)
│   ├─ pet-tag/                       (de qr-service completo, incluye entity)
│   ├─ webpay/                        (de qr-service completo: dto + entities + config + iface)
│   ├─ qr-activate/                   (de qr-service completo)
│   ├─ qr-free-generation/            (de qr-service completo)
│   ├─ statistics/                    (de qr-service completo)
│   ├─ mail/                          (de qr-service completo: dto + service real)
│   │
│   ├─ health/
│   │   ├─ health.module.ts
│   │   └─ health.controller.ts       (con check de MongoDB via @nestjs/terminus)
│   │
│   ├─ middleware/                    (uno solo: tracking-id + request-logger-entry)
│   ├─ interceptors/                   (uno solo: response-logger)
│   ├─ shared/                        (nueva carpeta, base para DDD futuro)
│   │   ├─ email/                     (email.service.ts, email.module.ts — de user-service)
│   │   └─ utils/
│   │       └─ logger.util.ts         (uno solo)
│   │
│   ├─ templateEmail/                 (assets HTML/EJS — de user-service)
│   └─ scripts/
│       └─ create-admin.ts            (CLI de user-service)
│
├─ test/
│   └─ *.spec.ts portados             (ver §10)
│
├─ Dockerfile
├─ package.json                       (merge de las 3)
├─ tsconfig.json
├─ tsconfig.build.json
├─ nest-cli.json
├─ .eslintrc.js
├─ .prettierrc
├─ .env.example
├─ .dockerignore
└─ .gitignore
```

> **Sujeto a fase 2 (DDD/hexagonal):** las carpetas actuales (sin `domain/`, `application/`, `infrastructure/`) se mantienen por **R-01** para no romper lógica. La fase 2 moverá cada módulo a esa estructura hexagonal y extraerá agregados.

### 4.3 Roadmap hacia DDD/hexagonal (post-SPEC-001)

Este spec **solo contiene** la fusión. La evolución posterior queda fuera de scope pero se drivers con esta estructura:

- **Fase 1** — SPEC-001 (este documento): monolito modular con módulos NestJS autónomos. Sin cambios de lógica.
- **Fase 2** — SPEC-002 (a definir): introducción de carpetas `domain/`, `application/`, `infrastructure/` por bounded context; agregados (`User`, `Qr`, `Scan`, `Plan`, `PetTag`, `Transaction`); value objects (`Email`, `Url`, `QrType`); puertos de salida (`UserRepository`, `QrRepository`, `EmailSender`, `PaymentGateway`). Los módulos de infraestructura cruzada (`shared/`) maduran a interfaces.
- **Fase 3** — SPEC-003 (a definir): uso compartido entre contextos exclusivamente vía interfaces y Application Services. No se permite imports transversales entre carpetas de dominio. Preparación para eventuel extracción de servicios si la escala lo justifica.

---

## 5. Estrategia de migración

### 5.1 Principio rector

> **"Los controllers y services de `user-service` y `qr-service` son la fuente de verdad. Los del `bff-service` son proxies que se descartan, salvo donde exponen rutas que user/qr-service no tienen (lo cual, tras el análisis, no ocurre para el dominio QR: el bff solo replica subconjuntos)."**

Ver §6 para la matriz de fusión decisión por decisión.

### 5.2 Plan por fases (PR-by-PR)

11 PRs ordenados con verificación en cada uno. Tras cada PR la app debe compilar y pasar tests.

#### PR-01 — Scaffold (`backend/`)
- Crear carpeta `backend/` con `nest new` o copia estructurada.
- `package.json` mergeado (ver §8.1).
- `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.eslintrc.js`, `.prettierrc` copiados de qr-service (versión más reciente).
- `Dockerfile` basado en el de bff-service pero con `EXPOSE 3001` y `SERVER_PORT=3001` por defecto en CMD.
- `.env.example` (ver §8.2).
- `src/main.ts` nuevo, con `process.env.SERVER_PORT || 3001`, CORS, ValidationPipe, interceptors.
- `src/app.module.ts` vacío provisorio (solo ConfigModule + MongooseModule + HealthModule + middleware).
- **Verificación:** `npm run build` pasa.

#### PR-02 — Cross-cutting: middleware, interceptors, utils, shared/email
- Copiar **una sola vez** (desde user-service cuando existan):
  - `src/middleware/tracking-id.middleware.ts`
  - - `src/middleware/request-logger-entry.middleware.ts`
  - `src/interceptors/response-logger.interceptor.ts`
  - `src/shared/utils/logger.util.ts`
  - `src/shared/email/email.service.ts` + `email.module.ts`
- Registrar middleware e interceptor en `app.module.ts`.
- Añadir `templateEmail/` (assets) con script postbuild para copiar a `dist/`.
- **Verificación:** `npm run build` pasa; smoke test de `main.ts` levanta en 3001.

#### PR-03 — Auth fusionado
- Copiar `user-service/src/auth/auth.service.ts` (lógica real bcrypt + JwtService).
- Copiar `user-service/src/auth/auth.controller.ts` (incluye `GET /auth/profile`).
- Copiar `user-service/src/auth/auth.module.ts` y `dto/`.
- Para guards/strategies: copiar de `user-service` (con consulta a BD).
- Copiar `auth/decorators/*` (uno solo — son idénticos).
- **Importante:** el `JwtStrategy` puede depender de `UsersService` (para hidratar `req.user`). Resolver importando `UsersModule` en `AuthModule`. Es la **única dependencia documentada** entre dominios en este spec.
- Guardar `config.validation.ts` de `qr-service` solo si reemplaza la verificación nula en jwt.strategy.
- **Verificación:** `POST /auth/login` devuelve tokens. `GET /auth/profile` (con token) devuelve datos del usuario.

#### PR-04 — Users module
- Copiar `user-service/src/users/` completo (controller, service, module, dto, entities).
- Reemplazar `src/users/entities/user.entity.ts` con el de user-service (con `@Schema`, índices).
- Ajustar imports (path absolutos → relativos `../utils/`).
- **Verificación:** `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`, `GET /users/check-username/:userName`, `GET /users/check-email/:email`, rutas de verificación y reseteo de password todas funcionan.

#### PR-05 — Módulos de dominio QR (qr, scan, plan, pet-tag)
- Copiar `qr-service/src/qr/` completo (incluye entities reales, dto, interfaces).
- Copiar `qr-service/src/scan/`.
- Copiar `qr-service/src/plan/`.
- Copiar `qr-service/src/pet-tag/` (con `entities/pet-tag.entity.ts`, enums, dto).
- Ajustar imports de `auth` y `utils` a las nuevas rutas unificadas.
- Ajustar `qr.service.ts` para usar `GetUser()` o `req.user.id` sin re-hacer validación (conservar las `ForbiddenException` actuales del controller de qr-service → CA-03).
- En `app.module.ts` añadir QrModule, ScanModule, PlanModule, PetTagModule.
- **Verificación:** `POST /qr`, `GET /qr`, `GET /qr/:id`, `PATCH /qr/:id`, `DELETE /qr/:id`, `/qr/public/:id`, `/qr/seo-idqr`, `/qr/user/:userId`, `/qr/user/favorites`, `/qr/user/:userId/paginated`; scans; plans; pet-tag rutas — incluyendo validación de que un `user` no pueda ver QRs ajenos.

#### PR-06 — Módulos restantes de qr-service
- Copiar `qr-service/src/qr-activate/` (con entity, dto, spec).
- Copiar `qr-service/src/qr-free-generation/` (con entity, dto, spec).
- Copiar `qr-service/src/statistics/`.
- Copiar `qr-service/src/mail/` (con dto, service real).
- Copiar `qr-service/src/webpay/` (con 4 dto, 2 entities, iface, config; registrar `transbank-sdk`).
- En `app.module.ts` añadir QrActivateModule, QrFreeGenerationModule, StatisticsModule, MailModule, WebpayModule.
- **Verificación:** Rutas `/qr-activate/*`, `/qr-free-generation/*`, `/statistics/*`, `/mail/contact`, `/webpay/create`, `/webpay/return`, `/webpay/refund`, `/webpay/status`, `/webpay/transaction/:token` todas funcionan (mock o real según env).

#### PR-07 — HealthModule unificado
- Reemplazar el healthcheck del bff (sin BD) por uno que use `@nestjs/terminus` + `MongooseModule.healthIndicator` de user-service/qr-service.
- Exponer `GET /health` con respuesta `{ status: 'ok', info: { mongodb: { status: 'up' } } }`.
- **Verificación:** CA-01.

#### PR-08 — Eliminación de restos del bff dentro del mono
- Borrar cualquier archivo vestigial referenciado desde el bff (entities espejo, controllers duplicados si fuera el caso).
- Eliminar `@nestjs/axios` y `axios` de `package.json`.
- Lanzar `npm run build` y `npm run test`: CA-07 cero ocurrencias.
- **Verificación:** `grep -r "HttpService\|firstValueFrom\|@nestjs/axios" src/` retorna vacío.

#### PR-09 — Tests portados
- Portar todos los `*.spec.ts` de user-service y qr-service a `backend/test/` o mantenerlos junto a su fuente `backend/src/<module>/`.
- Ajustar mocks e imports. Donde spec mockaba `HttpService`, eliminar ese mock y mockear el service real subyacente.
- **Verificación:** `npm run test` pasa. Reportar cobertura.

#### PR-10 — Docker y compose
- `backend/Dockerfile` final (multi-stage: builder + development + production).
- Actualizar `docker-compose.yml` raíz: reemplazar servicios `bff-service`, `user-service`, `qr-service` por `backend` (3001:3001). Cambiar `NEXT_PUBLIC_BFF_URL=http://bff-service:3001` por `NEXT_PUBLIC_BFF_URL=http://backend:3001` en el servicio `qr-app` (la variable se llama BFF por compatibilidad del frontend; no se renombra en esta fase).
- Eliminar `USER_SERVICE_URL` y `QR_SERVICE_URL` del compose y de env files.
- **Verificación:** CA-08. `docker compose up` levanta mongo + mongo-express + backend + qr-app.

#### PR-11 — Validación end-to-end y Railway
- Correr coleccion Postman `postman_collection.json` y `postman_collection_qr_free.json` contra `localhost:3001`.
- Correr smoke test del frontend contra `localhost:3000` con `NEXT_PUBLIC_BFF_URL=http://localhost:3001`.
- Deploy a Railway: crear nuevo servicio `backend`, eliminar los 2 servicios viejos `user-service` y `qr-service` y/o `bff-service`.
- **Verificación:** CA-04, CA-06, CA-09.

### 5.3 Orden de eliminación de los servicios viejos

Tras PR-11 (CA-09 confirmado):

1. Marcar `bff-service/`, `user-service/`, `qr-service/` como deprecated (no se buildan en CI).
2. Una vez estable en producción X días, abrir PR de cleanup eliminando las 3 carpetas del repo.
3. Mantener las carpetas en git history para rollback.

---

## 6. Matriz de fusión (decisión por módulo)

> **Leyenda:** "✓" presente. "—" ausente. "✓*" presente pero generado en el propio módulo.

### 6.1 Auth — Resolver conflicto `JwtStrategy`

| Aspecto                             | bff-service                  | user-service                              | qr-service                                | Decisión SPEC-001 |
| ----------------------------------- | ----------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------- |
| `auth.service.ts`                   | Proxy HTTP a `:3002/auth/*` `| bcrypt + jwtService → tokens    | —                                          | **user-service** (elimina proxy bff) |
| `auth.controller.ts`                | `POST /auth/login`, `POST /auth/refresh` | **+ `GET /auth/profile`**                 | —                                         | **user-service** (añade `/profile` → RF-10) |
| `JwtStrategy` (validación de token) | Sí                               | Con BD: valida `user.sub` contra `UsersService` | Sin BD: solo verifica la firma del JWT      | **user-service** (la BD ya está disponible en el mono) |
| `JwtAuthGuard`                      | Sí                               | Sí                                         | Sí                                         | **user-service** (consistencia con strategy)|
| `RolesGuard`, `@Public`, `@Roles`, `@GetUser` | Idénticos              | Idénticos                                 | Idénticos                                 | Conservar uno (de user-service) |
| `dto/login.dto.ts`, `dto/token.dto.ts` | —                          | Sí                                         | —                                         | **user-service** (los proxies del bff usan `any`) |

> **Consecuencia importante:** las validaciones que `qr-service` añadía **sin BD** (solo leyendo claims del JWT) se mantienen idénticas —ya que los claims los sigue generando el `auth.service` de user-service fusionado—, pero ahora `JwtStrategy` puede además hidratar el `req.user` completo desde BD. Las `ForbiddenException` que el controller de qr-service añade (`isAdmin`, `isOwner`) se conservan tal cual del lado del controller de qr-service.

### 6.2 Qr — Conservar controller de qr-service

| Ruta pública                   | En bff-service                  | En qr-service                                            | Novedad |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------|---------|
| `POST /qr`                      | Sin authz; pasa el `userId` por `DTO` | Con `ForbiddenException` si `user.id !== userId` && !admin | ✓ validación real |
| `GET /qr`                       | Sin paginación                   | Con `page`, `limit`, `search` (`findAllWithSearch`)        | Diferencia de contrato |
| `GET /qr/:id`                   | Sin verificar propietario       | Si `!admin && qr.userId !== user.id` → 403                 | ✓ validación real |
| `GET /qr/user/:userId`          | NO existe                       | Existe                                                     | Ruta nueva (sí la usa el front? → revisar §8) |
| `GET /qr/user/favorites`         | Sí, con `userId` query           | Sí, con `@GetUser()` y paging                             | Diferencia de firma |
| `GET /qr/user/:userId/paginated`| Sí                               | Sí                                                        | idéntica |
| `GET /qr/seo-idqr`               | Sí                               | Sí (transforma a `{id, updatedAt}`)                        | idéntica |
| `PATCH /qr/:id`                  | Sin verificar propietario       | Verifica `userId` no se cambia si no admin, propietario    | ✓ validación |
| `DELETE /qr/:id`                 | Sin verificar propietario       | Verifica propietario/admin                                 | ✓ validación |
| `GET /qr/public/:id`             | Sí, devuelve `qrService.getPublicQr` | Sí, devuelve `{data, name, id, description}` localmente   | Mapeo respuesta |

**Decisión:** conservar controller de **qr-service**. La diferencia clave para Postman:
- `GET /qr` en bff no soporta query params (`page`, `limit`, `search`); en qr-service sí. El front hoy no los envía (porque sabe que el bff no los soporta). No rompe compatibilidad.
- `GET /qr/user/favorites`: en bff recibe `userId` por query; en qr-service usa `@GetUser()`. Para mantener compatibilidad con el front que envía `userId` por query, modificar el controller de qr-service para que **accepte ambos** (query o `req.user.id`).

### 6.3 Otros módulos (resumen)

| Módulo              | Decisión origen                 | Justificación                                            |
| -------------------- | -------------------------------| ---------------------------------------------------------|
| `users`              | user-service                    | Service real con CRUD + verificación email + reset       |
| `qr`                | qr-service                      | Service real + validaciones de propietario                |
| `scan`               | qr-service                      | Service real                                              |
| `plan`               | qr-service                      | Service real (`@Schema` real)                            |
| `pet-tag`            | qr-service                      | Service real + entity real + enums                       |
| `qr-activate`        | qr-service                      | Service real + entity real + dto más completo            |
| `qr-free-generation` | qr-service                      | Service real + entity real + spec                         |
| `statistics`         | qr-service                      | Service real                                              |
| `mail`               | qr-service                      | Service real con contenido más completo (786 bytes dto)  |
| `webpay`             | qr-service                      | 4 dto + entities + iface + config; bff solo tiene 1 dto  |
| `auth`               | user-service + `/profile`       | Service real de generación de tokens + bcrypt            |
| `health`             | qr-service/user-service (fusión)| Usar `@nestjs/terminus` con MongooseHealthIndicator      |

### 6.4 Excepciones a la estrategia base (DOCUMENTADAS en §8)

- `GET /auth/profile` — ruta nueva expuesta que el bff no tenía. (Mejora intencional, RF-10.)
- `GET /qr` — el del bff no soporta paginación; el del mono (de qr-service) sí. Si el front usa `GET /qr` sin query params, recibe resultados estructurados como `{ data, pagination }` (respuesta distinta). **Acción:** mantener la firma del endpoint de qr-service tal cual, pero verificar si el front la llama con solo token. Si rompe el front, revertir a una variante "all" en una ruta nueva `/qr/all` y mantener `/qr` con respuesta simple.
- `GET /qr/user/:userId` — existe en qr-service pero el bff no la expone. **Acción:** exponerla como lectura; no rompe compatibilidad (es adición).

---

## 7. API pública resultante (contrato del mono)

### 7.1 Mapa de rutas

| Módulo              | Ruta base              | Endpoints heredados                                                              |
| -------------------- | ----------------------| ----------------------------------------------------------------------------------|
| auth                 | /auth                  | `POST /login`, `POST /refresh`, **`GET /profile`** (nuevo)                       |
| users                | /users                 | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `GET /search`, `GET /paginated`, `GET /check-username/:userName`, `GET /check-email/:email`, `POST /:id/verify-email`, `POST /:id/resend-verification`, `POST /forgot-password`, `POST /reset-password`, `PATCH /:id/change-password` |
| qr                   | /qr                    | `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `GET /seo-idqr`, `GET /public/:id`, `GET /user/favorites`, `GET /user/:userId`, `GET /user/:userId/paginated` |
| scan                 | /scan                  | `POST /stats`, `GET /:id/stats`, `GET /:id/recent`, `GET /:id/daily`, `GET /:id/locations`, `GET /:id/devices` |
| plan                 | /plan                  | `POST`, `GET`, `GET /active`, `GET /:id`, `PATCH /:id`, `DELETE /:id`            |
| pet-tag              | /pet-tag               | `POST /admin/generate`, `GET /admin/reserved`, `GET /public/status/:idQr`, `PATCH /update/:petTagId`, `PATCH /activate` |
| webpay               | /webpay                | `POST /create`, `GET /return`, `POST /refund`, `GET /status`, `GET /transaction/:token` |
| qr-activate          | /qr-activate           | `POST`, `GET`, `GET /:id`, `PATCH /webpay/:token_ws`, `PATCH /:id`, `DELETE /:id` |
| qr-free-generation   | /qr-free-generation    | `POST`, `GET`, `GET /:id`                                                         |
| statistics           | /statistics            | `GET /user/:userId`, `GET /system`                                                |
| mail                 | /mail                  | `POST /contact`                                                                   |
| health               | /health                | `GET`                                                                             |

### 7.2 Validación de contrato

La colección Postman `postman_collection.json` y `postman_collection_qr_free.json` se corre contra `http://localhost:3001` y debe pasar con las dos siguientes excepciones documentadas (añadir tests a la colección):

- Nueva ruta `GET /auth/profile` — assertions: 200 con `Authorization: Bearer <token válido>`.
- `GET /qr` ahora responde `{ data, pagination }` en lugar de un array. **Aktion antes de cerrar SPEC-001:** comparar la colección actual; si algún request envía `page/limit/search`, ya estaban siendo ignorados. Si la colección asume array, bifurcar la colección y actualizar. **Decisión:** actualizar la colección al contrato del qr-service (más expresivo) y reflejarlo en el front si fuera necesario (en un PR frontend separado).

---

## 8. Detalles técnicos adicionales

### 8.1 Merge `package.json`

**Dependencias a conservar en `backend/package.json`:**

```
@nestjs/common           ^10.0.0
@nestjs/config           ^3.3.0
@nestjs/core             ^10.0.0
@nestjs/jwt              ^10.2.0
@nestjs/mapped-types     ^2.0.4     (versión más reciente de user-service)
@nestjs/mongoose         ^10.1.0
@nestjs/passport         ^10.0.3
@nestjs/platform-express ^10.0.0
@nestjs/swagger          ^8.1.0     (versión más reciente de qr-service)
@nestjs/terminus         ^10.2.3
bcrypt                   ^5.1.1     (de user-service)
class-transformer        ^0.5.1
class-validator          ^0.14.1
dotenv                   ^16.4.7
ejs                      ^3.1.10    (de user-service, templates email)
mongoose                 ^8.9.3     (versión más reciente; user-service tiene 7.8.3 — pin a 8)
nanoid                   ^5.1.5     (de qr-service)
nodemailer               ^6.10.0    (versión más reciente; qr-service)
passport                 ^0.7.0
passport-jwt             ^4.0.1
reflect-metadata         ^0.2.0
rxjs                     ^7.8.1
transbank-sdk            ^5.0.0     (de qr-service)
uuid                     ^11.0.5
```

**Dependencias que se ELIMINAN:**

```
@nestjs/axios            (del bff)          ← CA-07
axios                    (del bff)          ← CA-07
npm                      ^11.0.0            (paquete espurio en user-service)
install                  ^0.13.0            (paquete espurio en user-service)
body-parser              (del bff, conflict)
```

**devDependencies:** idénticas a las de qr-service, añadir `@types/bcrypt` (de user-service).

**Scripts (nuevos):**

```json
{
  "scripts": {
    "build": "nest build && npm run copy-assets",
    "copy-assets": "node scripts/copy-assets.js",
    "dev": "nest start --watch",
    "prod": "node dist/main",
    "start": "nest start",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:cov": "jest --coverage",
    "create:admin": "ts-node src/scripts/create-admin.ts"
  }
}
```

`scripts/copy-assets.js` copia `src/templateEmail/` a `dist/templateEmail/` en el build (lo que hoy hace `cp -r` en user-service; al ser Windows-friendly se prefiere un script node).

### 8.2 Variables de entorno consolidadas (`backend/.env.example`)

```
# ───────── Configuración del servidor ─────────
NODE_ENV=development
SERVER_PORT=3001
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000

# ───────── MongoDB (BD unificada "sistema") ─────────
MONGO_USERNAME=root
MONGO_PASSWORD=example
MONGO_PORT=27017
MONGO_DATABASE=sistema
MONGO_HOST=mongo
MONGODB_URI=mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}?authSource=admin

# ───────── JWT (compartido por user-service + qr-service) ─────────
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
JWT_EXPIRATION=24h
JWT_REFRESH_EXPIRATION=7d

# ───────── Webpay (transbank) ─────────
WEBPAY_COMMERCE_CODE=YOUR_WEBPAY_COMMERCE_CODE_HERE
WEBPAY_API_KEY=YOUR_WEBPAY_API_KEY_HERE
WEBPAY_ENVIRONMENT=integration

# ───────── Email (nodemailer + EJS) ─────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-app-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_VERIFICATION_EXPIRY=3600
FRONTEND_URL=http://localhost:3000

# ───────── App (opcional) ─────────
API_PREFIX=
ENABLE_SWAGGER=true
```

**Variables eliminadas (prohibidas en el mono):**

- `USER_SERVICE_URL` (del bff y de qr-service)
- `QR_SERVICE_URL` (del bff)
- `PORT` duplicado de qr-service (se unifica en `SERVER_PORT`)

### 8.3 Riesgo de desincronía entre `qr-app` y el mono

El frontend `qr-app` usa `NEXT_PUBLIC_BFF_URL` como variable de entorno (`docker-compose.yml` línea 126: `NEXT_PUBLIC_BFF_URL=http://bff-service:3001`). En el nuevo compose se cambia a `http://backend:3001` pero **el nombre de la variable se mantiene** (`NEXT_PUBLIC_BFF_URL`) para no requerir cambios en el código del frontend. 

---

## 9. Mockups / Referencias

- `docker-compose.yml` raíz — para ver la topología actual de servicios.
- `bff-service/src/*/*.controller.ts` — referencia del contrato público actual.
- `user-service/src/users/entities/user.entity.ts` — entity real `@Schema` con índices.
- `qr-service/src/{qr,scan,plan,pet-tag,webpay,...}/entities` — entities reales.
- `postman_collection.json`, `postman_collection_qr_free.json`, `qr-platform-statistics.postman_collection.json` — para validación de contrato.
- `.env.example` de cada servicio (3 fuentes) — para construir el consolidado en §8.2.

---

## 10. Testing

### 10.1 Specs existentes a portar

| Origen                                   | `.spec.ts`                                           | Acción |
| ----------------------------------------| ------------------------------------------------------| -------|
| bff-service                              | `pet-tag.controller.spec.ts`, `*.service.spec.ts`     | Descartar (specs de proxies HTTP, sin valor para el mono) |
| user-service                             | `users.controller.spec.ts`, `users.service.spec.ts`   | Portar a `backend/src/users/`; ajustar mocks (`HttpService` no existe). Mockear el `UsersService` real interno. |
| qr-service                               | `qr.controller.spec.ts`, `qr.service.spec.ts`, `pet-tag.*.spec.ts`, `plan.*.spec.ts`, `qr-activate.*.spec.ts`, `qr-free-generation.*.spec.ts` | Portar a `backend/src/<module>/`; ajustar mocks. |

### 10.2 Tests mínimos a crear en el mono

- `auth.controller.spec.ts` (nuevo) — cubre `/login`, `/refresh`, `/profile` con mocks de `UsersService` y `JwtService`.
- `health.controller.spec.ts` (nuevo) — cubre CA-01 con `MongooseHealthIndicator` mockeado.
- `app.module.spec.ts` (nuevo) — smoke test de bootstrap.

### 10.3 Tests de aceptación (CA-04, CA-06)

- Importar `postman_collection.json` en Newman y correr contra `localhost:3001` en CI.
- Smoke script en `qr-app` que recorre `/login` → `/qr` → `/pet-tag` contra el mono levantado por compose.

### 10.4 Comandos

| Comando                              | Propósito |
| -----------------------------------| ----------|
| `npm run build`                     | Compilación TS (CA-05) |
| `npm run test`                      | Jest con specs (CA-05) |
| `npm run lint`                      | ESLint + Prettier (reglas de qr-service) |
| `docker compose up --build`         | CA-08 (mongo + backend + qr-app) |
| `newman run postman_collection.json --env-var url=http://localhost:3001` | CA-04 |

---

## 11. Trade-offs

### 11.1 Alternativas consideradas

1. **Mantener los 3 servicios** (actual).
   - Pro: escalado independiente, aislamiento de fallo.
   - Contra: código duplicado ~40%, borde HTTP con `any`, 3 deploys. No hay equipos separados ni requisitos de escalado. user y qr comparten BD y JWT — el "aislamiento" es nominal (un fallo en la BD común cae todo igual). Factura Railway ~$0.30/mes de diferencia. **Descartada.**

2. **Fusionar solo user-service + qr-service, dejar el BFF como proxy.**
   - Pro: el BFF sigue igual como contrato.
   - Contra: se mantiene la duplicación de controllers en el bff y el borde HTTP. Se pierde la mayor parte de los beneficios (latencia, tipado, deploy único). **Descartada.**

3. **Compartir package de tipos `@platform/shared` entre los 3 repos.**
   - Pro: bajo riesgo.
   - Contra: NO elimina duplicación de controllers ni los 3 deploys; el borde HTTP sigue rompiendo tipado en runtime. **Descartada.**

4. **Monolito total (un controller único gigante).**
   - Contra: viola modularidad y dificulta extracción futura. **Descartada.**

5. **Monolito modular con controllers de user/qr-service como base (DECISIÓN).**
   - Pro: conserva límites de módulo (extracción futura hacia hexagonal/DDD factible), elimina duplicación y HTTP, gana validaciones de autorización que el bff no tenía.
   - Con: requiere alinear el frontend con dos pequenas diferencias de contrato (ver §6.4, §7.2). Mitigación documentada.

### 11.2 Riesgos y mitigación

| Riesgo                                                              | Probabilidad | Impacto | Mitigación |
| ------------------------------------------------------------------ | ------------ | ------- | ----------|
| Conflicto en `JwtStrategy` y `AuthModule` con tres variantes       | Alta         | Alto    | §6.1: usar user-service como único source; el guard protege todo el proceso; el token se verifica contra BD. Pasar `.spec.ts` de auth. |
| Regresión de rutas públicas (CA-04)                                 | Media        | Alto    | Postman + Newman en CI; Mapeo de §7 con la excepción de `GET /qr` documentada. |
| Monstruo `app.module` si se importan mal los módulos             | Baja         | Medio   | Cada dominio en su módulo NestJS autónomo; CA-10. |
| `GET /qr` cambia de forma (array → `{data, pagination}`) frente al front | Alta         | Medio   | PR frontend paralelo que actualice el cliente; o, si prioridad es cero cambio en el front, bifurcar `/qr` a `/qr/all` para no romper (ver §6.4). Decidir antes de PR-11. |
| `@nestjs/axios` o `firstValueFrom` residual                         | Media        | Alto    | CA-07 con grep en CI. PR-08 dedicado. |
| `docker-compose` local se rompe por cambio de URL del frontend    | Baja         | Bajo    | CA-08 — solo se cambia `NEXT_PUBLIC_BFF_URL` de servicios `bff-service:3001` a `backend:3001`. |
| MongoDB connectionString con `?authSource=admin` distinto en prod | Media        | Medio  | Conserver exacta la `MONGODB_URI` que Railway tiene; no reescribir la variable. |
| Pérdida de scripts CLI de admin                                    | Baja         | Bajo    | Portar `scripts/create-admin.ts` y exponer `npm run create:admin`. |

### 11.3 Plan de rollback

Si tras PR-11 el mono falla en producción:

1. **Revert del deploy en Railway** al commit previo a PR-11 (los 3 servicios siguen deployados; no se eliminaron).
2. **Swap de DNS/route** en Railway: redirigir `qr-app` a `bff-service:3001` apuntando a `user-service:3002` y `qr-service:3003` (todavía deployados mientras no se cumpla §5.3).
3. Composer local: `git revert` de los PRs 10 y 11; restaurar las 3 carpetas de servicios (siguen en el repo hasta el PR de cleanup final).
4. Logs del mono para postmortem; corregir y re-deploy.

---

## 12. Out of scope (explícito)

- Refactor DDD / arquitectura hexagonal (Fase 2, SPEC-002).
- Migración de colecciones en MongoDB (no se requiere; RF-4).
- Cambio de framework de Email o de Webpay.
- Renombrado de la variable `NEXT_PUBLIC_BFF_URL` en el frontend.
- Eliminación física de las carpetas `bff-service/`, `user-service/`, `qr-service/` (post-PR-11, en PR de cleanup).
- Cambios de lógica de negocio (R-01).
- Renombrado de variables de entorno públicas usadas por el frontend.

---

## 13. Historial de cambios

| Fecha       | Autor      | Cambio |
| ----------| ---------- | --------- |
| 2026-08-06 | Equipo  | Borrador inicial |
| 2026-08-06 | Equipo  | Reescritura: estrategia "nuevo componente `backend/`", inventario exacto por archivo, matriz de fusión por módulo, roadmap DDD/hexagonal post-spec, CA-10 y RF-09 añadidos, `/auth/profile` expuesta, §8.1 merge package.json, §8.2 .env consolidado, §10 testing detallado, §11.3 rollback |