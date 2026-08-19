---
title: "SPEC-020: Registro simplificado (email+contraseña) + onboarding de perfil + login con Google"
date: 2026-08-17
tags:
  - spec
  - backend
  - frontend
  - auth
  - oauth
  - google
  - onboarding
  - signup
status: borrador
aliases:
  - SPEC-020
  - registro simplificado
  - google oauth
  - onboarding primer login
  - boton google login
---

# SPEC-020: Registro simplificado (email+contraseña) + onboarding de perfil + login con Google

> [!abstract] Decisión clave
> Reducir el formulario de registro a **solo email + contraseña** (más confirmación y términos) para eliminar la fatiga del usuario, y mover la captura de **nombre, apellidos y nombre de usuario (opcional)** a un **onboarding post-primer-login** (`/onboarding`). Además, agregar **login con Google** (OAuth 2.0 Authorization Code + PKCE implícito de `passport-google-oauth20`) con botón en login y signup. En backend (`backend-portaqr`): `CreateUserDto` hace **opcionales** `userName`, `firstName`, `paternalLastName`, `maternalLastName`; el **`userName` se genera automáticamente** (`user_<8 hex>`) cuando no se provee (mantiene `required+unique` del schema, el JWT y el login por userName intactos — ADR-020.1); el schema de usuario agrega `googleId?` (unique sparse), `provider` (`'local'|'google'`, default `'local'`) y `avatarUrl?`; nuevo módulo de **Google OAuth** con `GET /auth/google` y `GET /auth/google/callback` (ADR-020.2), donde el callback **pasa por el proxy del frontend** (`/api/auth/google/callback`) para que las cookies httpOnly se seteen en el dominio del frontend y los tokens **nunca viajen en query strings** (ADR-020.3); si el email ya existe (cuenta local) se **vincula** el `googleId` y se loguea (ADR-020.4); los usuarios Google nacen con `isEmailVerified: true` y `password` = hash aleatorio inutilizable (ADR-020.7). El **onboarding es obligatorio** para entrar al dashboard (nombre + apellidos; userName opcional con generación automática si se omite — ADR-020.5), con guard en `DashboardLayoutClient` y detección por campos vacíos (sin flag nuevo en BD). **No se toca** `bff-service`/`user-service`/`qr-service` (deprecados, SPEC-001).

> [!info] Metadatos
> - **Estado:** Borrador (v2 — feedback usuario 2026-08-17: correo de bienvenida Google, copy de onboarding, edición de perfil en settings)
> - **Fecha:** 2026-08-17
> - **Componente destino:** `desarrollo-qr/backend-portaqr/` (módulos `users`, `auth`; schema `user.schema.ts`) y `desarrollo-qr/qr-app/` (`SignUpForm`, `LoginForm`, nueva página `/onboarding`, proxies `/api/auth/google*`)
> - **Origen:** Requerimiento del usuario (2026-08-17): "el formulario es demasiado largo, puede caer en fatiga para el usuario... solo pedir correo y contraseña y cuando logee la primera vez pedirle nombre y apellido y nombre de usuario opcional... me gustaría el botón de Google para login". Se revisaron `qr-app` y `backend-portaqr`.
> - **Infraestructura reutilizada:** `JwtAuthService.generateTokens` (RS256), `PasswordService`, `UserValidationRules`, `MongoUserRepository`, `UsersModule` (use cases `Create`/`Update`/`Get`), `PassportModule` (ya registrado con estrategia JWT), `SENSITIVE_ENDPOINT_THROTTLE`, proxies `/api/auth/*` + `setAuthCookies` de `qr-app`.
> - **Dependencias nuevas:** `passport-google-oauth20` + `@types/passport-google-oauth20` (backend-portaqr). **Cero dependencias nuevas en qr-app** (el botón Google es un link/redirect; el icono se toma de `components/icon` existente o inline SVG).

---

## 1. Objetivo

1. **Reducir la fricción del registro**: el formulario de `/signup` pasa de **9 campos** (userName, email, confirmEmail, password, confirmPassword, firstName, paternalLastName, maternalLastName + términos) a **4** (email, password, confirmPassword + términos). El usuario crea su cuenta en segundos.
2. **Capturar el perfil en el primer login**: al loguear por primera vez (perfil incompleto), el usuario completa **nombre, apellido paterno y apellido materno** (obligatorios) y **nombre de usuario** (opcional — si lo omite, el backend genera uno automático).
3. **Login con Google**: botón "Continuar con Google" en `/login` y `/signup` que autentica vía OAuth 2.0, crea la cuenta automáticamente si el email no existe (con email verificado por Google) o vincula si ya existe.
4. **Cero regresión** en el flujo existente: verificación de email, recuperación de contraseña, JWT RS256 + cookies httpOnly, refresh con rotación, logout con `tokenVersion`.

### 1.1 Out of scope

- **NO** se implementa OAuth con otros proveedores (GitHub, Facebook, Apple): solo Google (requerimiento explícito). El diseño deja el patrón listo para extender (ADR-020.2).
- **NO** se agrega "cambiar contraseña" para usuarios Google (no tienen password local; el flujo forgot-password no aplica — mejora futura, §6).
- **NO** se agrega desvinculación de cuenta Google (mejora futura).
- **NO** se modifica el flujo de verificación de email (se mantiene: el login local bloquea emails no verificados con `email_not_verified`).
- **NO** se migran datos existentes: los usuarios actuales ya tienen perfil completo; el onboarding solo aplica a cuentas nuevas (o Google sin `family_name`).
- **NO** se toca `bff-service`/`user-service`/`qr-service` (deprecados, SPEC-001).
- **NO** se agrega 2FA, WebAuthn ni magic links.
- **NO** se cambia el contrato de `POST /auth/login` ni de `POST /users` (solo se relajan campos del DTO de creación).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Backend: registro simplificado (`users` module)**

- **RF-1 (CreateUserDto relajado)**. `backend-portaqr/src/modules/users/application/dto/create-user.dto.ts`: `userName`, `firstName`, `paternalLastName`, `maternalLastName` pasan de `@IsNotEmpty()` a `@IsOptional()` (mantienen `@IsString()` y `@MaxLength` cuando aplican). `email` y `password` siguen obligatorios (mismas reglas: IsEmail, MinLength 8, MaxLength 20). **No cambia el contrato HTTP**: los clientes que envíen los campos completos siguen funcionando (backward compatible).
- **RF-2 (UserValidationRules.validateForCreate ajustado)**. `domain/validators/user-validation.rules.ts`: la validación de creación **no exige** userName/firstName/paternalLastName/maternalLastName. `normalize()` sigue normalizando email/userName (trim + lowercase) solo si vienen presentes.
- **RF-3 (generación automática de userName)**. `CreateUserUseCase.execute()`: si `dto.userName` está vacío/ausente → generar `user_<8 hex>` con `randomBytes(4).toString('hex')` (CSPRNG, mismo patrón de `code-generator.util.ts`). El userName generado **nunca colisiona** (8 hex = 4.3×10⁹ combinaciones; si Mongo devuelve E11000 por userName, se reintenta una vez con otro valor — defensa en profundidad). El usuario puede cambiarlo después vía `PATCH /users/:id` (UpdateUserDto ya lo permite) o desde settings. **NO dispara welcomeEmail** (RF-23: la bienvenida va en el primer login verificado, no en el registro).
- **RF-4 (schema: nombre/apellidos opcionales)**. `infrastructure/repository/mongo/schemas/user.schema.ts`: `firstName`, `paternalLastName`, `maternalLastName` pasan de `required: true` a `required: false` con `default: ''` (trim). `userName` **sigue `required: true` + `unique: true`** (siempre se genera — ADR-020.1). El índice `name_index` (sparse) no se ve afectado.
- **RF-5 (payload de creación sin campos extra)**. El proxy `qr-app/src/app/api/auth/signup/route.ts` y `auth.service.ts` (`SignUpData`) envían solo `{ email, password }`. El backend completa el resto (RF-3). El flujo de verificación de email no cambia (el `verificationCode` se genera en el mismo insert — SPEC-007 H7).

**Bloque B — Backend: Google OAuth (`auth` module)**

- **RF-6 (dependencia y estrategia)**. `backend-portaqr/package.json`: + `passport-google-oauth20` (^2.0.0, CommonJS) y `@types/passport-google-oauth20` (devDeps). Nueva `GoogleStrategy` en `src/modules/auth/infrastructure/strategies/google.strategy.ts` (patrón de `jwt.strategy.ts`): `clientID = GOOGLE_CLIENT_ID`, `clientSecret = GOOGLE_CLIENT_SECRET`, `callbackURL = GOOGLE_CALLBACK_URL`, `scope: ['profile', 'email']`, `passReqToCallback: true` (para leer el `state` de la cookie — ADR-020.6). **Sin sessions** (el proyecto no usa express-session): `session: false` en el `AuthGuard('google')`.
- **RF-7 (endpoints)**. `auth.controller.ts`:
  - `GET /auth/google` — `@Public()` + `SENSITIVE_ENDPOINT_THROTTLE`. Genera `state` (CSPRNG 16 hex), lo guarda en **cookie httpOnly `oauth_state`** (SameSite=Lax, maxAge 10 min, secure en prod) y redirige a Google (`passport.authenticate('google', { state })`).
  - `GET /auth/google/callback` — `@Public()` + `SENSITIVE_ENDPOINT_THROTTLE`. Valida el `state` contra la cookie `oauth_state` (si no coincide → 400 `'Estado de autenticación inválido'` — CSRF, ADR-020.6), intercambia el code, obtiene perfil y delega en `GoogleAuthService` (RF-8). Respuesta: **JSON `{ user, accessToken, refreshToken }`** (mismo shape que `POST /auth/login` — el proxy del frontend setea las cookies, ADR-020.3).
- **RF-8 (GoogleAuthService — implementa puerto de entrada)**. Nuevo `src/modules/auth/domain/services/google-auth.service.ts` que **implementa `IGoogleAuthService`** (nuevo `src/modules/auth/domain/ports/in/google-auth-service.port.ts` — patrón `IAuthService`/`AUTH_SERVICE_PORT`). Método `authenticate(profile: GoogleProfile, tracking): Promise<AuthResponse>`:
  1. Recibe el perfil de Google (`{ email, googleId, givenName, familyName, picture }`).
  2. `getUserUseCase.executeByEmail(email)`:
     - **No existe** → crea usuario: `email`, `userName` generado (RF-3), `firstName = givenName ?? ''`, `paternalLastName = familyName ?? ''`, `maternalLastName = ''`, `password = hash aleatorio inutilizable` (ADR-020.7), `provider: 'google'`, `googleId`, `avatarUrl = picture`, `isEmailVerified: true` (Google ya verificó el email — ADR-020.4). **No** se envía correo de verificación (email ya verificado).
     - **Existe** → **vincula**: si no tiene `googleId`, se setea `googleId` + `provider: 'google'` + `avatarUrl` (si viene) vía `updateUserUseCase.update` (sin tocar email/password/role — el repo ya destruye `role` del `$set`). Si el usuario existente tiene `password` local, **se mantiene** (puede seguir usando ambos métodos — ADR-020.4).
  3. `updateUserUseCase.updateLastLogin(user.id)`.
  4. `jwtAuthService.generateTokens(user)` + `persistRefreshToken` (mismo flujo que `AuthService.login` — SPEC-009 A8).
  5. Si la cuenta fue **creada** (su primer login, email ya verificado): `sendWelcomeEmail(email)` best-effort vía puerto `AUTH_EMAIL_PORT` (RF-27) → marcar `welcomeEmailSent: true` si el envío fue exitoso. Al **vincular** → NO se envía.
  6. Retorna `{ user: Omit<User,'password'>, accessToken, refreshToken }`.
- **RF-9 (schema: campos Google + welcomeEmailSent)**. `user.schema.ts`: + `googleId?: string` (`unique: true, sparse: true` — múltiples usuarios sin googleId conviven), `provider: string` (`default: 'local'`, `enum: ['local','google']`), `avatarUrl?: string`, `welcomeEmailSent: boolean` (`default: false` — RF-27). Mapper `user-mongo.mapper.ts` mapea los 4 campos nuevos (toEntity/toSchemaData).
- **RF-10 (login local con usuario Google)**. Sin cambios de código: el usuario Google tiene un hash aleatorio de password → `comparePassword` falla → `'Credenciales inválidas'` (mensaje homogéneo, no revela existencia — patrón existente). El usuario Google entra solo por Google.
- **RF-11 (wiring del módulo — puertos y tokens)**. `auth.tokens.ts`: + `GOOGLE_AUTH_SERVICE_PORT` y `AUTH_EMAIL_PORT`. `auth.module.ts`: importar `EmailModule` (shared/email); registrar `GoogleStrategy`, `GoogleAuthService` como providers; bindings: `{ provide: GOOGLE_AUTH_SERVICE_PORT, useClass: GoogleAuthService }` (patrón `AUTH_SERVICE_PORT`) y `{ provide: AUTH_EMAIL_PORT, useExisting: EmailService }` (EmailService implementa estructuralmente `ICanSendWelcomeEmail` — patrón SPEC-019 `QR_ACTIVATE_EMAIL_PORT`/ADR-019.8: la capa de aplicación/auth NUNCA inyecta EmailService directo). `AuthModule` ya importa `UsersModule` (GetUserUseCase/CreateUserUseCase/UpdateUserUseCase). El `AuthController` inyecta `GoogleAuthService` directo (patrón real del controller, que inyecta `AuthService` directo).

**Bloque C — Frontend: signup simplificado (`qr-app`)**

- **RF-12 (SignUpForm reducido)**. `src/components/SignUpForm/`:
  - `state.ts`: `SignUpFormData` queda con `{ email, password, confirmPassword, acceptTerms }` (se eliminan `userName`, `confirmEmail`, `firstName`, `paternalLastName`, `maternalLastName`).
  - `helpers.ts`: `validateFieldValue`/`isFieldValid`/`isFormValid`/`buildSubmitData` sin los campos eliminados. `buildSubmitData` retorna `{ email, password }`.
  - `index.tsx`: se eliminan las secciones "Datos Personales" y los campos userName/confirmEmail; queda email (con check de existencia async en blur — se mantiene), password (con `PasswordStrengthMeter` y tooltip), confirmPassword y términos. El botón "Crear Cuenta" se habilita con la validación reducida.
  - `SignUpFormField.tsx`/`SignUpFormContext.ts`: sin cambios estructurales (tipos derivados de `SignUpFormField`).
- **RF-13 (SignUpPageClient y proxy)**. `SignUpPageClient.tsx` y `api/auth/signup/route.ts`: payload `{ email, password }` (whitelist explícita — SPEC-008 forbidNonWhitelisted). El redirect a `/verify-email?userId=...&email=...` se mantiene.
- **RF-14 (auth.service.ts)**. `SignUpData` → `{ email: string; password: string }`.

**Bloque D — Frontend: onboarding de perfil (`qr-app`)**

- **RF-15 (página `/onboarding`)**. Nueva `src/app/onboarding/page.tsx` (server, metadata `index: false`) + `OnboardingPageClient.tsx` (client):
  - Header/Footer iguales a `/signup` (misma línea visual).
  - Formulario: `firstName` (obligatorio), `paternalLastName` (obligatorio), `maternalLastName` (obligatorio), `userName` (**opcional**, con check de disponibilidad async en blur — reutiliza `authService.checkUsernameExists`; si se deja vacío, el backend genera uno — ADR-020.5).
  - Submit: `PATCH /api/users/:id` (proxy existente) con `{ firstName, paternalLastName, maternalLastName, userName? }` → `dispatch({ type: 'SET_USER', payload: user })` → `window.location.href = '/dashboard'` (navegación completa, patrón del LoginForm).
  - Si el perfil ya está completo → redirect a `/dashboard` (useEffect).
- **RF-16 (guard de onboarding en el dashboard)**. `src/app/dashboard/DashboardLayoutClient.tsx`: tras `status === 'authenticated'`, si `!state.user?.firstName || !state.user?.paternalLastName || !state.user?.maternalLastName` → `router.replace('/onboarding')` (useEffect, sin render del layout). Protege **todas** las rutas del dashboard.
- **RF-17 (LoginForm redirige a onboarding)**. `src/components/LoginForm/index.tsx`: tras login exitoso, si el perfil está incompleto (misma condición RF-16) → `window.location.href = '/onboarding'`; si no → `/dashboard` (comportamiento actual).
- **RF-18 (display name resiliente)**. `DashboardHeader`/`Sidebar`/donde se muestre `userName`: helper `getDisplayName(user)` → `firstName` si existe, si no `email` (los userName generados `user_xxx` no se muestran al usuario). Sin cambios de contrato.

**Bloque E — Frontend: botón Google (`qr-app`)**

- **RF-19 (botón en login y signup)**. `LoginForm` y `SignUpForm`: botón "Continuar con Google" (estilo outline, icono G multicolor inline SVG — sin dependencias nuevas) **sobre** el formulario, separado por divisor "o". **Siempre visible** (decisión usuario 2026-08-18: se eliminó el flag `NEXT_PUBLIC_GOOGLE_ENABLED` — si el backend no tiene credenciales, `GET /auth/google` responde 503 con mensaje claro, CA-07). Click → `window.location.href = '/api/auth/google'`.
- **RF-20 (proxies Google)**. Nuevos en `qr-app/src/app/api/auth/`:
  - `google/route.ts` (GET): `302` a `{NEXT_PUBLIC_BFF_URL}/auth/google` (el navegador sigue el redirect; la cookie `oauth_state` la setea el backend en esa respuesta).
  - `google/callback/route.ts` (GET): recibe `?code=...&state=...` de Google → reenvía a `{NEXT_PUBLIC_BFF_URL}/auth/google/callback?code=...&state=...` (forward de cookies del request para validar `oauth_state`) → si OK: `setAuthCookies(accessToken, refreshToken)` (reutiliza `src/lib/auth.ts`) y `302` a `/dashboard` (o `/onboarding` si perfil incompleto — el proxy puede decidir con `data.user`); si error: `302` a `/login?error=google` (LoginForm muestra mensaje genérico).
  - **Los tokens nunca viajan en query strings** (ADR-020.3): el backend responde JSON al proxy; el proxy setea cookies y redirige.
- **RF-21 (AuthUser con campos nuevos)**. `src/interfaces/user.ts` y `src/lib/auth.ts` (`AuthUser`): + `provider?: 'local' | 'google'`, `googleId?: string`, `avatarUrl?: string` (firstName/apellidos ya son opcionales). `getAuthUser()` (claims del JWT) no cambia (el JWT no lleva provider — no es necesario).

**Bloque F — Ajustes de feedback del usuario (2026-08-17)**

- **RF-22 (mapa de correos — verificado, ajustes puntuales)**. Auditoría completa de los correos de `backend-portaqr` (2026-08-17):

  | Correo | Template | ¿Usa nombre? | Detalle |
  | --- | --- | --- | --- |
  | Verificación de email (signup) | `registerEmail.ejs` | ❌ No | Saludo genérico "¡Bienvenido(a) a Porta QR!"; `sendVerificationEmail(email, id, code)` sin nombre → **sin cambios** |
  | Restablecer contraseña | `passwordReset.ejs` | ✅ Sí | `Hola <%= user.name %>!`; `sendPasswordResetEmail(email, code, nombreCompleto)` con `nombreCompleto = firstName + paternalLastName + maternalLastName` (`forgot-password.usecase.ts:51`) → **ajustar**: con signup simplificado un usuario sin onboarding tendría `nombreCompleto = "  "` → "Hola  !" |
  | Activación de QRs (SPEC-019) | `qrActivated.ejs` | ✅ Sí | `Hola <%= userName %>...`; `userName = firstName + paternalLastName` (`qr-activated-notification.service.ts:73`) → **ajuste defensivo**: firstName vacío → "Hola , tus códigos..." |
  | Bienvenida Google (nuevo) | `welcomeEmail.ejs` | ❌ No | Saludo genérico por diseño (ADR-020.9) |

  **Ajuste (RF-26)**: helper backend `getDisplayName(user)` → `firstName` si existe, si no `email` (consistente con RF-18 del frontend) y `getFullName(user)` → `firstName paternalLastName maternalLastName` si firstName existe, si no `email`. Aplicar en `forgot-password.usecase.ts` (usar `getFullName`) y `qr-activated-notification.service.ts` (usar `getDisplayName`). Los previews `registerEmail.html`/`email-preview*.html` son estáticos de desarrollo (no se envían) — sin cambios.
- **RF-23 (correo de bienvenida — se envía en el PRIMER LOGIN con cuenta verificada, no al registrarse)**. Nuevo template `backend-portaqr/src/templateEmail/welcomeEmail.ejs` (misma línea gráfica de `registerEmail.ejs`, solo modo claro como `qrActivated.ejs` — ADR-019.7) + `EmailService.sendWelcomeEmail(email)` (payload `{ baseUrl }`, saludo genérico "¡Bienvenido(a) a Porta QR!" — a esa altura no hay nombre, ADR-020.9). **Regla (decisión usuario 2026-08-17)**: NO se envía al registrarse (la cuenta no está verificada); se envía en el **primer login con cuenta verificada**:
  - **Flujo local**: registrarse → solo correo de verificación (`registerEmail`). En el primer login exitoso (el login local ya exige email verificado — SPEC-009) → `AuthService.login` dispara `sendWelcomeEmail` best-effort.
  - **Flujo Google**: el email nace verificado y el callback OAuth **es** su primer login → `GoogleAuthService` dispara `sendWelcomeEmail` al crear la cuenta.
  - **Solo usuarios nuevos** (decisión usuario 2026-08-17): los usuarios existentes antes del deploy se marcan `welcomeEmailSent: true` (migración one-off) para no spamearlos.
  - **Flag `welcomeEmailSent`** (RF-27): si el envío falla (SMTP), el flag NO se marca y se reintenta en el próximo login. Best-effort: un fallo de SMTP nunca rompe el login ni el callback OAuth (RN-2).
- **RF-24 (pantalla de bienvenida universal — primer login de TODOS los usuarios)**. La página `/onboarding` (RF-15) se titula **"Queremos saber cómo te llamas"** con subtítulo "Completa tu perfil para personalizar tu experiencia" y aplica **a todos los usuarios, sin excepción, en su primer login** — tanto si se registraron por **correo** (email+password) como si entraron por **Google** (Gmail). En esa pantalla se piden: **nombre**, **apellido paterno** y **apellido materno** (obligatorios) + **nombre de usuario** (opcional, con hint de generación automática). El guard (RF-16) y el redirect del LoginForm (RF-17) y del callback Google (RF-20) usan la misma condición `!firstName || !paternalLastName || !maternalLastName` — cualquier usuario que llegue al dashboard con perfil incompleto pasa por la bienvenida, sin importar cómo se autenticó.
- **RF-25 (edición de perfil en `/dashboard/settings`)**. `SettingsAccordion` (hoy solo "Cambio de Contraseña") agrega la sección **"Datos Personales"** con un nuevo `EditProfileForm` (componente client): `firstName`, `paternalLastName`, `maternalLastName` (obligatorios) y `userName` (opcional, con check de disponibilidad async — reutiliza `authService.checkUsernameExists`). Submit → `PATCH /api/users/:id` (proxy existente; `UpdateUserDto` ya permite estos campos — verificado) → `dispatch({ type: 'SET_USER', payload: user })` (refresca el contexto). Maneja 409 de userName duplicado. Esto permite corregir los datos capturados en el onboarding (o los que Google trajo) en cualquier momento.
- **RF-26 (helpers de nombre en backend para correos)**. Nuevo `backend-portaqr/src/common/utils/user-name.util.ts` (util compartido entre módulos — junto a `code-generator.util.ts`/`hash.util.ts`): `getDisplayName(user)` → `firstName` si existe, si no `email`; `getFullName(user)` → `firstName paternalLastName maternalLastName` (trim) si firstName existe, si no `email`. Aplicar en: `forgot-password.usecase.ts` (línea 51: `nombreCompleto = getFullName(user)` — evita "Hola  !" para usuarios sin onboarding) y `qr-activated-notification.service.ts` (línea 73: `userName = getDisplayName(user)` — evita "Hola , tus códigos..."). Unit tests para ambos helpers (firstName presente, firstName vacío → email, espacios en blanco).
- **RF-27 (flag `welcomeEmailSent` + disparo en el primer login verificado)**. Schema `user.schema.ts`: + `welcomeEmailSent: boolean` (`default: false`). Entidad + mapper: mapear el campo. Disparo (RF-23):
  - `AuthService.login` (flujo local): tras el login exitoso (cuenta ya verificada por el flujo), si `!user.welcomeEmailSent` → `sendWelcomeEmail(email)` best-effort **vía puerto `AUTH_EMAIL_PORT`** (`ICanSendWelcomeEmail` — try/catch + log, no rompe el login) → si el envío fue exitoso, `updateUserUseCase.update(user.id, { welcomeEmailSent: true })` (si SMTP falla, el flag queda `false` y se reintenta en el próximo login). `AuthService` ya inyecta `UpdateUserUseCase` — sin dependencias nuevas de users.
  - `GoogleAuthService.authenticate` (flujo Google): al **crear** la cuenta (su primer login, email ya verificado) → `sendWelcomeEmail(email)` best-effort vía `AUTH_EMAIL_PORT` → marcar `welcomeEmailSent: true` si el envío fue exitoso. Al **vincular** una cuenta existente → NO se envía (no es un registro nuevo).
  - **Migración one-off** (deploy): `db.users.updateMany({ welcomeEmailSent: { $exists: false } }, { $set: { welcomeEmailSent: true } })` — los usuarios existentes antes del deploy NO reciben bienvenida (decisión usuario 2026-08-17). Los usuarios nuevos nacen con `welcomeEmailSent: false`.

### 2.2 Reglas de negocio

- **RN-1**. El registro requiere **solo email + contraseña** válidos y aceptación de términos. Nombre/apellidos/userName se capturan en el onboarding post-primer-login.
- **RN-2**. El **userName siempre existe** en BD (generado si no se provee — ADR-020.1): el login por userName, el JWT (`userName` claim) y las vistas que lo usan no se rompen.
- **RN-3**. El **onboarding es obligatorio** para acceder al dashboard (nombre + apellidos). El userName es opcional (generación automática). No hay opción "saltar" (ADR-020.5).
- **RN-4**. El onboarding aplica solo a perfiles incompletos (`!firstName || !paternalLastName || !maternalLastName`). Usuarios existentes (perfil completo) nunca lo ven.
- **RN-5**. **Google verifica el email**: los usuarios creados por Google nacen con `isEmailVerified: true` y no reciben correo de verificación.
- **RN-6**. **Vincular por email**: si el email de Google ya existe (cuenta local), se vincula `googleId` y se loguea; la contraseña local se conserva (el usuario puede usar ambos métodos). Si el email no existe, se crea la cuenta.
- **RN-7**. Un usuario Google **no puede** iniciar sesión con contraseña (hash aleatorio inutilizable → `'Credenciales inválidas'`, sin revelar existencia).
- **RN-8**. El `state` de OAuth es obligatorio (CSRF): el callback sin `state` válido responde 400 y **no** crea/vincula nada.
- **RN-9**. Los tokens JWT **nunca** se exponen en query strings ni en el body al navegador (solo cookies httpOnly vía proxy — patrón existente).
- **RN-10**. El botón Google se muestra **siempre** (decisión usuario 2026-08-18: se eliminó el flag `NEXT_PUBLIC_GOOGLE_ENABLED`); el backend debe tener `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` configurados (si faltan, `GET /auth/google` responde 503 con mensaje claro en logs).

### 2.3 Criterios de aceptación (CA)

- **CA-01**: `POST /users` con `{ email, password }` (sin userName/nombres) → 201, usuario con `userName` generado (`user_<8 hex>`), `firstName/paternalLastName/maternalLastName = ''`, email de verificación enviado. Verificado con unit test + `mongosh`.
- **CA-02**: `POST /users` con payload completo (legacy) → 201 igual que hoy (backward compatible).
- **CA-03**: `POST /users` con email duplicado → 409 `'El correo electrónico ya está registrado'` (sin regresión).
- **CA-04**: login local de un usuario recién registrado (sin perfil) → 200 con `user` completo (firstName vacíos) → el frontend redirige a `/onboarding`.
- **CA-05**: `/onboarding` con nombre+apellidos+userName opcional → `PATCH /users/:id` persiste → redirect a `/dashboard`; el dashboard ya no redirige a onboarding.
- **CA-06**: usuario autenticado con perfil incompleto navega a cualquier ruta `/dashboard/*` → redirigido a `/onboarding` (guard).
- **CA-07**: `GET /auth/google` sin credenciales configuradas → 503 + log claro; con credenciales → 302 a `accounts.google.com` con `state` y cookie `oauth_state`.
- **CA-08**: callback con `state` inválido/ausente → 400 `'Estado de autenticación inválido'`, sin crear usuario.
- **CA-09**: callback con code válido y email **nuevo** → usuario creado con `provider: 'google'`, `googleId`, `isEmailVerified: true`, `firstName`/`paternalLastName` de Google, `password` = hash aleatorio; respuesta `{ user, accessToken, refreshToken }`.
- **CA-10**: callback con code válido y email **existente** (cuenta local) → se vincula `googleId` (sin tocar password/role), login exitoso con tokens.
- **CA-11**: login local (password) de un usuario Google → 401 `'Credenciales inválidas'`.
- **CA-12**: `/api/auth/google/callback` (proxy) con respuesta OK → cookies httpOnly seteadas + 302 a `/dashboard` (o `/onboarding` si perfil incompleto); con error → 302 a `/login?error=google`. **Sin tokens en la URL**.
- **CA-13**: `/signup` muestra solo email/password/confirmPassword/términos (sin "Datos Personales", sin userName, sin confirmEmail); el botón Google aparece **siempre** (sin flag configurable — decisión usuario 2026-08-18).
- **CA-14**: `tsc --noEmit` + suites jest verdes en backend-portaqr y qr-app (sin regresión en SPEC-009/011/012/019).
- **CA-15** (integración manual): flujo completo — signup email+password → verify-email → login → onboarding → dashboard; y flujo Google — botón → consentimiento → callback → dashboard (o onboarding si Google no trajo `family_name`).
- **CA-16**: auditoría de correos — `registerEmail.ejs` **no contiene nombre** (saludo genérico, sin cambios); `passwordReset.ejs` y `qrActivated.ejs` usan nombre pero con fallback a email vía `getFullName`/`getDisplayName` (RF-22/RF-26): usuario sin onboarding que pide reset → "Hola {email}!" (nunca "Hola  !"); activación de QR con firstName vacío → "Hola {email}, tus códigos...".
- **CA-17**: el correo de bienvenida se envía en el **primer login con cuenta verificada** (no al registrarse): flujo local → primer login exitoso; flujo Google → al crear la cuenta (su primer login). Al **vincular** una cuenta existente **no** se envía. Si SMTP falla, el flag `welcomeEmailSent` queda `false` y se reintenta en el próximo login (RF-23/RF-27).
- **CA-18**: `/dashboard/settings` muestra la sección "Datos Personales" con nombre/apellidos/userName editables; el PATCH persiste y el contexto se actualiza; userName duplicado → 409 visible en el campo (RF-25).

---

## 3. Baseline del problema (verificado 2026-08-17)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| Formulario `/signup` | 9 campos: userName, email, confirmEmail, password, confirmPassword, firstName, paternalLastName, maternalLastName + términos (`SignUpForm/index.tsx`, `state.ts`, `helpers.ts`) | 4 campos: email, password, confirmPassword + términos (RF-12) |
| `CreateUserDto` (backend-portaqr) | userName (3-20), password (8-20), firstName, paternalLastName, maternalLastName **todos `@IsNotEmpty`** | userName/nombres/apellidos `@IsOptional()` (RF-1) |
| Schema `users` | `userName`, `firstName`, `paternalLastName`, `maternalLastName` `required: true` | nombres/apellidos `required: false, default: ''`; userName sigue required (RF-4) |
| `CreateUserUseCase` | `UserValidationRules.validateForCreate` exige todos los campos; insert con E11000 → ConflictException | userName generado si falta (RF-3); validación relajada (RF-2) |
| Login | `POST /auth/login` → `{ user (perfil completo sin password), accessToken, refreshToken }`; acepta email o userName | **Sin cambios de contrato** (el frontend deduce perfil incompleto por campos vacíos) |
| Google OAuth | **No existe** (verificado: cero coincidencias `google|oauth|passport-google` en backend-portaqr; auth 100% local) | `GET /auth/google` + `GET /auth/google/callback` (RF-7/8) |
| Schema campos Google | — | + `googleId?` (unique sparse), `provider` (default 'local'), `avatarUrl?`, `welcomeEmailSent` (default false) (RF-9/RF-27) |
| Flag "perfil completo"/"primer login" | **No existe** en backend (verificado: cero coincidencias `profileComplete|firstLogin|onboarding`) | No se crea: el frontend deduce por `!firstName \|\| !paternalLastName \|\| !maternalLastName` (RF-16/17) |
| `UpdateUserDto` | `PartialType(OmitType(CreateUserDto, ['email','password','isEmailVerified']))` → userName/nombres/apellidos/phone opcionales | **Sin cambios** (ya permite el onboarding vía `PATCH /users/:id`) |
| Proxies auth qr-app | `/api/auth/login`, `/signup`, `/refresh`, `/logout`, `/session`, etc. → `{NEXT_PUBLIC_BFF_URL}` (backend-portaqr:3004) | + `/api/auth/google` y `/api/auth/google/callback` (RF-20) |
| Cookies | `setAuthCookies` httpOnly SameSite=Lax (access 1h, refresh 7d) | Reutilizadas tal cual en el callback Google (RF-20) |
| `AuthUser` (qr-app) | `{ id, email?, userName?, firstName?, paternalLastName?, maternalLastName?, role?, isEmailVerified? }` | + `provider?`, `googleId?`, `avatarUrl?` (RF-21) |
| Dashboard guard | Solo `status === 'authenticated'` | + redirect a `/onboarding` si perfil incompleto (RF-16) |
| Correo de verificación (`registerEmail.ejs`) | Saludo genérico "¡Bienvenido(a) a Porta QR!"; `sendVerificationEmail(email, id, code)` sin nombre (verificado) | **Sin cambios** (RF-22) |
| Correo de bienvenida Google | **No existe** | Nuevo `welcomeEmail.ejs` + `sendWelcomeEmail` al crear cuenta Google (RF-23) |
| `/dashboard/settings` | Solo "Cambio de Contraseña" (`SettingsAccordion` + `ChangePasswordForm`) | + sección "Datos Personales" (`EditProfileForm`: nombre/apellidos/userName → PATCH) (RF-25) |

---

## 4. Diseño Técnico

### 4.1 Flujo de datos — registro simplificado + onboarding

```
[Usuario] /signup (email + password + confirmPassword + términos)
   │  POST /api/auth/signup  { email, password }          (RF-13/14)
   ▼
[qr-app proxy] → POST {NEXT_PUBLIC_BFF_URL}/users  { email, password }
   ▼
[backend-portaqr] CreateUserUseCase
   1. validateForCreate (relajado — RF-2)
   2. userName = dto.userName ?? `user_${randomBytes(4).hex}`   (RF-3)
   3. hash password · verificationCode + expiración (SPEC-007 H7)
   4. insert (E11000 → ConflictException) · email verificación (best-effort)
   ▼ 201 { user (sin password) }
[qr-app] → /verify-email?userId=...&email=...   (flujo existente)
   ▼ (usuario verifica email)
[Usuario] /login (email + password)
   ▼ POST /api/auth/login → POST /auth/login → { user, tokens } → cookies httpOnly
[LoginForm] user.firstName vacío → window.location.href = '/onboarding'   (RF-17)
   ▼
[/onboarding] firstName + paternalLastName + maternalLastName (obligatorios)
              + userName (opcional, check de disponibilidad async)
   ▼ PATCH /api/users/:id  { firstName, paternalLastName, maternalLastName, userName? }
[backend] UpdateUserUseCase (assertOwnerOrAdmin — dueño) → 200 user actualizado
   ▼ dispatch SET_USER → window.location.href = '/dashboard'
[DashboardLayoutClient] guard: perfil completo → render normal   (RF-16)
```

### 4.2 Flujo de datos — Google OAuth

```
[Usuario] click "Continuar con Google" (login o signup)   (RF-19)
   ▼ window.location.href = '/api/auth/google'
[qr-app proxy] GET /api/auth/google → 302 {BFF}/auth/google   (RF-20)
   ▼
[backend] GET /auth/google (público, throttle)
   1. state = randomBytes(8).hex
   2. Set-Cookie: oauth_state=<state> (httpOnly, SameSite=Lax, 10 min, secure prod)
   3. 302 → accounts.google.com (scope profile+email, state)   (RF-7)
   ▼ (consentimiento de Google)
[Google] 302 → {GOOGLE_CALLBACK_URL} = {FRONTEND_URL}/api/auth/google/callback?code=...&state=...
   ▼
[qr-app proxy] GET /api/auth/google/callback
   1. forward: {BFF}/auth/google/callback?code=...&state=... + cookies (oauth_state)
   2. respuesta OK → setAuthCookies(accessToken, refreshToken) → 302 /dashboard (o /onboarding si perfil incompleto)
   3. respuesta error → 302 /login?error=google   (RF-20, ADR-020.3)
   ▼
[backend] GET /auth/google/callback (público, throttle)
   1. validar state vs cookie oauth_state (400 si no coincide)   (RF-7, RN-8)
   2. passport intercambia code → perfil { email, googleId, givenName, familyName, picture }
   3. GoogleAuthService (RF-8):
      ├─ email NO existe → crear: provider='google', googleId, isEmailVerified=true,
      │    firstName=givenName, paternalLastName=familyName, password=hash aleatorio (ADR-020.7)
      ├─ email existe → vincular googleId (sin tocar password/role)   (RN-6)
      ├─ updateLastLogin → generateTokens (RS256) → persistRefreshToken (sha256)
      └─ 200 { user, accessToken, refreshToken }   (JSON al proxy — nunca query strings)
```

### 4.3 Contratos de API

```
POST /users                          — SIN cambios de contrato (DTO relajado, RF-1)
POST /auth/login                     — SIN cambios
PATCH /users/:id                     — SIN cambios (ya permite userName/nombres/apellidos)
GET  /auth/google                    — NUEVO (público, throttle): 302 a Google | 503 sin credenciales
GET  /auth/google/callback           — NUEVO (público, throttle): 200 { user, accessToken, refreshToken } | 400 state inválido
GET  /api/auth/google                — NUEVO (qr-app proxy): 302 a {BFF}/auth/google
GET  /api/auth/google/callback       — NUEVO (qr-app proxy): setAuthCookies + 302 /dashboard | /login?error=google
```

```ts
// backend-portaqr/src/modules/users/application/dto/create-user.dto.ts (RF-1)
export class CreateUserDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido.' })
  email: string;

  @IsString({ message: 'El nombre de usuario debe ser una cadena de texto.' })
  @IsOptional()                       // ← ANTES: @IsNotEmpty
  @MinLength(3, { message: 'El nombre de usuario debe tener al menos 3 caracteres.' })
  @MaxLength(20, { message: 'El nombre de usuario no puede tener más de 20 caracteres.' })
  userName?: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'La contraseña es requerida.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(20, { message: 'La contraseña no puede tener más de 20 caracteres.' })
  password: string;

  @IsString() @IsOptional() @MaxLength(20) firstName?: string;          // ← ANTES: @IsNotEmpty
  @IsString() @IsOptional() @MaxLength(20) paternalLastName?: string;   // ← ANTES: @IsNotEmpty
  @IsString() @IsOptional() @MaxLength(20) maternalLastName?: string;   // ← ANTES: @IsNotEmpty
  // phone?, isEmailVerified?, lastLogin?, createdAt?, updatedAt? — sin cambios
}

// backend-portaqr/src/modules/users/infrastructure/repository/mongo/schemas/user.schema.ts (RF-4/RF-9)
@Prop({ required: false, default: '', trim: true }) firstName: string;        // ← ANTES: required: true
@Prop({ required: false, default: '', trim: true }) paternalLastName: string; // ← ANTES: required: true
@Prop({ required: false, default: '', trim: true }) maternalLastName: string; // ← ANTES: required: true
@Prop({ required: true, unique: true, trim: true }) userName: string;         // SIN CAMBIOS (siempre generado)
@Prop({ unique: true, sparse: true }) googleId?: string;                      // NUEVO
@Prop({ default: 'local', enum: ['local', 'google'] }) provider: string;      // NUEVO
@Prop() avatarUrl?: string;                                                   // NUEVO

// backend-portaqr/src/modules/auth/domain/services/google-auth.service.ts (RF-8)
interface GoogleProfile {
  email: string;
  googleId: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
}
class GoogleAuthService {
  async authenticate(profile: GoogleProfile, tracking: TrackingContext): Promise<AuthResponse>;
  // 1. getByEmail → crear (provider google, isEmailVerified true, password hash aleatorio) o vincular googleId
  // 2. updateLastLogin → generateTokens → persistRefreshToken
  // 3. return { user: Omit<User,'password'>, accessToken, refreshToken }
}

// qr-app/src/app/api/auth/google/callback/route.ts (RF-20 — esqueleto)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  // forward cookies del request (oauth_state) al backend
  const response = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/google/callback?code=${code}&state=${state}`, {
    headers: { cookie: request.headers.get('cookie') ?? '', 'x-tracking-id': trackingId },
  });
  if (!response.ok) return NextResponse.redirect(new URL('/login?error=google', request.url));
  const data = await response.json();
  await setAuthCookies(data.accessToken, data.refreshToken);
  const needsOnboarding = !data.user?.firstName || !data.user?.paternalLastName || !data.user?.maternalLastName;
  return NextResponse.redirect(new URL(needsOnboarding ? '/onboarding' : '/dashboard', request.url));
}
```

### 4.4 Cambios por archivo — Backend (`backend-portaqr`)

| Archivo | Cambio |
| --- | --- |
| `package.json` | + `passport-google-oauth20` ^2.0.0; devDeps: `@types/passport-google-oauth20` (RF-6) |
| `src/modules/users/application/dto/create-user.dto.ts` | userName/nombres/apellidos → `@IsOptional()` (RF-1) |
| `src/modules/users/domain/validators/user-validation.rules.ts` | `validateForCreate` sin exigir userName/nombres/apellidos; `normalize` condicional (RF-2) |
| `src/modules/users/application/use-cases/create-user.usecase.ts` | Generar `user_<8 hex>` si userName vacío + reintento ante E11000 por userName (RF-3). **NO dispara welcomeEmail** (RF-23) |
| `src/modules/users/infrastructure/repository/mongo/schemas/user.schema.ts` | nombres/apellidos `required: false, default: ''`; + `googleId` (unique sparse), `provider` (default 'local'), `avatarUrl` (RF-4/RF-9) |
| `src/modules/users/infrastructure/repository/mongo/mappers/user-mongo.mapper.ts` | Mapear `googleId`/`provider`/`avatarUrl`/`welcomeEmailSent` en toEntity/toSchemaData (RF-9/RF-27) |
| `src/modules/users/domain/entities/user.entity.ts` | + `googleId?`, `provider`, `avatarUrl?`, `welcomeEmailSent` (RF-9/RF-27) |
| `src/modules/auth/infrastructure/strategies/google.strategy.ts` (nuevo) | `GoogleStrategy` (passport-google-oauth20, `session: false`, `passReqToCallback`, scope profile+email) (RF-6) |
| `src/modules/auth/domain/ports/in/google-auth-service.port.ts` (nuevo) | `IGoogleAuthService` + `GoogleProfile` (RF-8) |
| `src/modules/auth/domain/ports/out/email-sender.port.ts` (nuevo) | `ICanSendWelcomeEmail { sendWelcomeEmail(email): Promise<void> }` (RF-27, ADR-019.8) |
| `src/modules/auth/domain/constants/auth.tokens.ts` | + `GOOGLE_AUTH_SERVICE_PORT`, `AUTH_EMAIL_PORT` (RF-11) |
| `src/modules/auth/domain/services/google-auth.service.ts` (nuevo) | `GoogleAuthService implements IGoogleAuthService` — crear/vincular + tokens + welcomeEmail (RF-8) |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | + `GET /auth/google` (state + cookie + redirect) y `GET /auth/google/callback` (validar state, delegar, JSON) (RF-7) |
| `src/modules/auth/domain/services/auth.service.ts` | Tras login exitoso: si `!user.welcomeEmailSent` → `sendWelcomeEmail` vía `AUTH_EMAIL_PORT` best-effort → marcar `welcomeEmailSent: true` si el envío fue exitoso (RF-27) |
| Migración one-off (deploy) | `db.users.updateMany({ welcomeEmailSent: { $exists: false } }, { $set: { welcomeEmailSent: true } })` — usuarios existentes no reciben bienvenida (RF-27) |
| `src/modules/auth/auth.module.ts` | Importar `EmailModule`; registrar `GoogleStrategy` + `GoogleAuthService`; bindings `GOOGLE_AUTH_SERVICE_PORT` (useClass) y `AUTH_EMAIL_PORT` (useExisting: EmailService) (RF-11) |
| `src/templateEmail/welcomeEmail.ejs` (nuevo) | Correo de bienvenida Google, línea gráfica registerEmail, solo modo claro, saludo genérico (RF-23) |
| `src/shared/email/email.service.ts` | + `sendWelcomeEmail(email)` (payload `{ baseUrl }`, best-effort) (RF-23) |
| `src/common/utils/user-name.util.ts` (nuevo) | `getDisplayName(user)` + `getFullName(user)` (RF-26) |
| `src/modules/users/application/use-cases/forgot-password.usecase.ts` | `nombreCompleto = getFullName(user)` (RF-26) |
| `src/modules/qr-activate/application/services/qr-activated-notification.service.ts` | `userName = getDisplayName(user)` (RF-26) |
| `backendPortaqr.env` (no versionado) | + `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (documentar en `.env.example` si existe) |
| Tests | `create-user.usecase.spec.ts` (CA-01/02/03), `user-validation.rules.spec.ts`, `google-auth.service.spec.ts` (CA-09/10/11/17), `auth.controller.spec.ts` (CA-07/08), `user.schema.spec.ts` (RF-9), `email.service.spec.ts` (CA-16/17 — sendVerificationEmail sin nombre, sendWelcomeEmail best-effort), `user-name.util.spec.ts` (RF-26), `forgot-password.usecase.spec.ts` (CA-16 — nombreCompleto con fallback email), `qr-activated-notification.service.spec.ts` (CA-16 — userName con fallback email), `auth.service.spec.ts` (CA-17 — login dispara welcomeEmail solo si `!welcomeEmailSent`, marca flag si éxito, no rompe login si SMTP falla) |

### 4.5 Cambios por archivo — Frontend (`qr-app`)

| Archivo | Cambio |
| --- | --- |
| `src/components/SignUpForm/state.ts` | `SignUpFormData` → `{ email, password, confirmPassword, acceptTerms }` (RF-12) |
| `src/components/SignUpForm/helpers.ts` | Validaciones/payload sin campos eliminados; `buildSubmitData` → `{ email, password }` (RF-12) |
| `src/components/SignUpForm/index.tsx` | Quitar sección "Datos Personales", userName, confirmEmail; mantener email (check async), password (strength meter), confirmPassword, términos (RF-12) |
| `src/app/signup/SignUpPageClient.tsx` | Payload `{ email, password }` (RF-13) |
| `src/app/api/auth/signup/route.ts` | Payload whitelist `{ email, password }` (RF-13) |
| `src/services/auth.service.ts` | `SignUpData` → `{ email, password }` (RF-14) |
| `src/app/onboarding/page.tsx` (nuevo) | Server page + metadata (RF-15) |
| `src/app/onboarding/OnboardingPageClient.tsx` (nuevo) | Form perfil + PATCH + redirect (RF-15) |
| `src/app/dashboard/DashboardLayoutClient.tsx` | Guard: perfil incompleto → `/onboarding` (RF-16) |
| `src/components/LoginForm/index.tsx` | Redirect condicional a `/onboarding`; botón Google (RF-17/RF-19) |
| `src/components/SignUpForm/index.tsx` | Botón Google (RF-19) |
| `src/app/api/auth/google/route.ts` (nuevo) | Proxy redirect (RF-20) |
| `src/app/api/auth/google/callback/route.ts` (nuevo) | Proxy callback + `setAuthCookies` + redirect (RF-20) |
| `src/interfaces/user.ts` + `src/lib/auth.ts` | `AuthUser` + `provider?`, `googleId?`, `avatarUrl?` (RF-21) |
| `src/components/dashboard/DashboardHeader.tsx` / `Sidebar.tsx` | `getDisplayName(user)` (RF-18) |
| `src/components/SettingsAccordion/index.tsx` | + sección "Datos Personales" con `EditProfileForm` (RF-25) |
| `src/components/EditProfileForm/` (nuevo) | Form nombre/apellidos/userName → `PATCH /api/users/:id` → `SET_USER` (RF-25) |
| Tests | `SignUpForm` spec (CA-13), `OnboardingPageClient` spec (CA-05), `LoginForm` spec (CA-04/19), proxy callback spec (CA-12), `EditProfileForm` spec (CA-18) |

### 4.6 ADRs

> [!info] ADR-020.1 — ¿userName nullable o generado automáticamente?
> **Decisión**: **generado automáticamente** (`user_<8 hex>` CSPRNG) cuando el usuario no lo provee (signup o onboarding omitido).
> - `userName` es `required + unique` en el schema y viaja en el **JWT** (`userName` claim) y en el **login** (acepta email o userName). Hacerlo nullable rompería: el claim del JWT (habría que hacerlo opcional), el login por userName, y las vistas del dashboard que lo muestran.
> - Con generación automática: cero cambios en JWT/login/UI; el usuario puede cambiarlo después vía `PATCH /users/:id` (UpdateUserDto ya lo permite) o settings.
> - Contra-punto aceptado: el userName generado (`user_abc12345`) no es "bonito" — mitigado con display name por `firstName`/email (RF-18) y edición posterior.

> [!info] ADR-020.2 — ¿passport-google-oauth20 o flujo OAuth manual?
> **Decisión**: **`passport-google-oauth20`** (estrategia oficial de passport para Google OAuth 2.0).
> - El proyecto ya usa `@nestjs/passport` + `PassportModule` (estrategia JWT). Agregar una estrategia más es el patrón natural de NestJS, con `session: false` (el proyecto no usa sessions).
> - El flujo manual (fetch a `accounts.google.com` + intercambio de code) duplicaría lógica madura (validación de tokens, manejo de errores, profile parsing) sin beneficio.
> - El patrón queda listo para extender a otros proveedores (GitHub/Facebook) agregando estrategias hermanas.

> [!info] ADR-020.3 — ¿Callback directo al backend o vía proxy del frontend?
> **Decisión**: **vía proxy del frontend** (`GOOGLE_CALLBACK_URL = {FRONTEND_URL}/api/auth/google/callback`).
> - El backend no puede setear cookies httpOnly en el dominio del frontend (cross-domain). El patrón existente de la app es: backend devuelve tokens JSON → proxy de qr-app setea cookies (`setAuthCookies`) → redirect.
> - Alternativa descartada: callback directo al backend + redirect con tokens en query string — **inseguro** (tokens en URL/logs/historial). Alternativa descartada 2: callback directo + HTML con script que hace fetch al proxy — frágil y rompe el flujo de redirect del navegador.
> - El proxy reenvía las cookies del request (para validar `oauth_state`) y nunca loguea tokens.

> [!info] ADR-020.4 — ¿Crear siempre o vincular por email?
> **Decisión**: **vincular por email**: si el email de Google ya existe (cuenta local), se setea `googleId`/`provider`/`avatarUrl` y se loguea; si no existe, se crea con `isEmailVerified: true`.
> - Vincular evita cuentas duplicadas (el usuario que se registró con email+password y luego usa Google conserva su historial/QRs).
> - La contraseña local se conserva: el usuario puede usar ambos métodos. El email verificado de Google **no** marca `isEmailVerified` en una cuenta local pre-existente sin verificar (el usuario debe verificar por el flujo normal — no se salta la verificación de una cuenta local por vincular Google; decisión conservadora, evita escalar privilegios de verificación sin consentimiento).
> - Riesgo aceptado: si un atacante controla el email de Google de una víctima, podría vincularse a su cuenta — mitigado porque el email de Google ya está verificado por Google (mismo nivel de confianza que el flujo de reset-password por email).

> [!info] ADR-020.5 — ¿Onboarding obligatorio o saltable?
> **Decisión**: **obligatorio** para acceder al dashboard (nombre + apellidos); userName opcional (generación automática si se omite).
> - El usuario pidió "cuando logee la primera vez pedirle nombre y apellido y nombre de usuario opcional" — "pedirle" implica obligatorio para nombre/apellidos.
> - Si fuera saltable, ¿cuándo se volvería a pedir? (cada login sería molesto; un banner permanente sería ruido). Obligatorio una sola vez es la UX más limpia.
> - El guard vive en `DashboardLayoutClient` (una sola condición, sin flag en BD): `!firstName || !paternalLastName || !maternalLastName`.

> [!info] ADR-020.6 — ¿Cómo se protege el callback OAuth (CSRF)?
> **Decisión**: **`state` CSPRNG en cookie httpOnly `oauth_state`** (SameSite=Lax, 10 min, secure en prod), validado en el callback.
> - El proyecto no usa express-session (sin `req.session`): el patrón estándar de passport con sessions no aplica.
> - La cookie viaja del backend al navegador en el redirect inicial y vuelve al backend vía el proxy del frontend (que reenvía cookies) en el callback.
> - SameSite=Lax ya bloquea la mayoría de CSRF cross-site; el `state` agrega la capa de defensa estándar de OAuth 2.0.

> [!info] ADR-020.7 — ¿Qué password tiene un usuario Google?
> **Decisión**: **hash aleatorio inutilizable** (`bcrypt.hash(randomBytes(16).hex, 10)`).
> - El schema tiene `password: required: true`. Hacerlo nullable implicaría tocar el schema, el mapper y el login (que asume `user.password`).
> - Con hash aleatorio: el login local falla naturalmente con `'Credenciales inválidas'` (mensaje homogéneo, no revela que la cuenta es de Google — RN-7), sin cambios en `AuthService.login`.
> - El usuario Google nunca conoce esa contraseña; si quiere password local, usa el flujo **"Agregar contraseña"** (ADR-020.11, flag `hasPassword`) — primer set-password sin pedir la anterior.

> [!info] ADR-020.8 — ¿Cómo se muestra el nombre del usuario con userName generado?
> **Decisión**: helper `getDisplayName(user)` → `firstName` si existe, si no `email` (nunca el `user_xxx` generado).
> - Los userName generados (`user_abc12345`) son identificadores técnicos, no nombres de display. Mostrar el email es más humano que mostrar `user_xxx`.
> - Aplica a `DashboardHeader`/`Sidebar` y cualquier vista que muestre el userName; el userName real sigue disponible donde se necesite (perfil, settings).

> [!info] ADR-020.9 — ¿Cuándo y con qué saludo se envía el correo de bienvenida?
> **Decisión**: **en el primer login con cuenta verificada** (no al registrarse), con **saludo genérico** "¡Bienvenido(a) a Porta QR!", y **solo para usuarios nuevos** (decisión usuario 2026-08-17).
> - No enviarlo al registrarse: a esa altura la cuenta local **no está verificada** — un correo de bienvenida antes de verificar es disonante ("bienvenido" a una cuenta que aún no puede usar). El usuario lo pidió explícitamente: "no se envía bienvenida si la cuenta no está verificada, el correo se enviará al primer login con cuenta verificada".
> - En el primer login el usuario ya está autenticado y puede usar la app → la bienvenida tiene contexto. Para Google, el callback OAuth ES el primer login (email ya verificado) → se envía ahí.
> - Saludo genérico porque a esa altura **no hay nombre** (el onboarding viene después) — mismo criterio que RF-22.
> - Solo usuarios nuevos: los existentes se marcan `welcomeEmailSent: true` en la migración one-off (evita spam a cuentas antiguas). Flag `welcomeEmailSent` (RF-27) garantiza un solo envío y reintento si SMTP falla. Best-effort: un fallo de SMTP nunca rompe el login ni el callback OAuth (RN-2).

> [!info] ADR-020.10 — ¿Qué pasa si el login con Google y la cuenta NO existe? (mode login/signup)
> **Decisión**: el flujo OAuth distingue origen con `?mode=login|signup` (persistido en cookie httpOnly `oauth_mode`). En **`mode=login`** si el email NO existe → **NO se crea cuenta** → 401 → el frontend redirige a `/signup?error=google-no-account` ("No tienes una cuenta con este correo. Regístrate para continuar."). En **`mode=signup`** se crea (términos ya aceptados en el form).
> - Antes (v1): el login con Google creaba la cuenta automáticamente (ADR-020.7) **sin aceptar términos** — problema legal/UX. El usuario lo reportó: "si en el login presiono iniciar sesión con el botón pero mi cuenta no está creada".
> - El backend no puede distinguir login de signup por sí solo → el `mode` viaja en el query inicial y se persiste en cookie httpOnly (no en el state string, para no exponerlo).
> - En **signup**, el botón Google se **deshabilita hasta aceptar términos** (RN-1) con hint "Acepta los términos y condiciones para habilitar el registro con Google." — el registro con Google también exige aceptación.
> - El proxy `/api/auth/google` reenvía el `mode` al backend y **todas** las Set-Cookie (`oauth_state` + `oauth_mode`) — `headers.getSetCookie()` (get() solo devuelve la primera).

> [!info] ADR-020.11 — ¿Cómo loguea con contraseña un usuario creado con Google? (flag hasPassword)
> **Decisión**: flag **`hasPassword`** (default `true`; `false` solo para cuentas Google recién creadas — ADR-020.7). El primer set-password (cuenta Google sin contraseña) **no pide contraseña anterior** y **no incrementa tokenVersion**; después de asignarla, aplica el cambio normal con la anterior. Si se olvida → flujo "¿Olvidaste tu contraseña?" existente.
> - Sin el flag no se distingue "Google sin contraseña" de "Google con contraseña" (ambos tienen `provider='google'` y un hash). El hash aleatorio hace que `comparePassword` siempre falle → el flujo anterior estaba roto para Google (exigía `currentPassword`).
> - `ChangePasswordDto.currentPassword` → `@IsOptional()`; `ChangePasswordUseCase`: si `provider==='google' && !hasPassword` salta la verificación y NO incrementa tokenVersion (el usuario está logueado vía Google; incrementarlo lo desloguearía).
> - El JWT incluye `provider` y `hasPassword` como claims (el frontend los usa para decidir si muestra "Agregar contraseña" vs "Cambio de Contraseña").
> - Migración one-off: `updateMany({ provider: 'google', hasPassword: { $exists: false } }, { $set: { hasPassword: false } })`.

---

## 5. Mockups / Referencias

- **`/signup` (nuevo)**: tarjeta centrada (misma línea visual actual) → título "Crear Cuenta" → [botón "Continuar con Google" outline con icono G] → divisor "o" → email → contraseña (con medidor de fuerza) → confirmar contraseña → checkbox términos → botón "Crear Cuenta". Sin secciones "Datos Personales"/"Información de la Cuenta".
- **`/onboarding` (nuevo)**: tarjeta centrada → título **"Queremos saber cómo te llamas"** → subtítulo "Completa tu perfil para personalizar tu experiencia" → Nombre* → Apellido Paterno* → Apellido Materno* → Nombre de usuario (opcional, con hint "Si lo dejas vacío, generaremos uno automáticamente") → botón "Continuar al Dashboard". **Universal**: se muestra en el primer login de TODOS los usuarios — por correo **y** por Google (RF-24).
- **`/login`**: igual que hoy + botón "Continuar con Google" sobre el formulario (mismo estilo que signup).
- **Referencias**: `SignUpForm/index.tsx` (estructura actual a reducir), `LoginForm/index.tsx` (patrón de submit + redirect), `api/auth/login/route.ts` + `lib/auth.ts` (patrón de proxy + cookies), `auth.controller.ts` + `jwt.strategy.ts` (patrón de endpoints y estrategias del backend), `SPEC-009` (hardening auth: refresh hasheado, throttle, mensajes homogéneos).

---

## 6. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| **userName generado automáticamente** | JWT/login/UI intactos; editable después | `user_xxx` no es "bonito" (display name mitiga) | ✅ (ADR-020.1) |
| **userName nullable (sparse)** | Sin userName artificial | Rompe JWT claim, login por userName, vistas; más cambios | ❌ |
| **passport-google-oauth20** | Estándar NestJS, patrón existente (PassportModule), extensible | 1 dependencia nueva | ✅ (ADR-020.2) |
| **Flujo OAuth manual** | Cero dependencias | Duplica lógica madura (tokens, errores, profile) | ❌ |
| **Callback vía proxy frontend** | Cookies httpOnly en dominio correcto; tokens nunca en URL; patrón existente | 2 proxies nuevos en qr-app | ✅ (ADR-020.3) |
| **Callback directo al backend** | Menos código | Tokens en query string (inseguro) o HTML con fetch (frágil) | ❌ |
| **Vincular por email** | Sin cuentas duplicadas; conserva historial | Riesgo teórico de vinculación por email controlado (mitigado, ADR-020.4) | ✅ (ADR-020.4) |
| **Crear siempre cuenta nueva** | Cero lógica de vinculación | Cuentas duplicadas; el usuario pierde su historial | ❌ |
| **Onboarding obligatorio** | Perfil completo siempre; UX limpia | Fricción de 3 campos en el primer login (aceptable) | ✅ (ADR-020.5) |
| **Onboarding saltable** | Cero fricción | ¿Cuándo se pide de nuevo? Ruido permanente | ❌ |
| **state en cookie httpOnly** | CSRF estándar OAuth 2.0; sin sessions | Cookie extra (10 min) | ✅ (ADR-020.6) |
| **password = hash aleatorio** | Schema/login intactos; mensaje homogéneo | Usuario Google no puede tener password local (feature futura) | ✅ (ADR-020.7) |
| **Flag `profileComplete` en BD** | Explícito | Campo extra + migración + sync; la condición por campos vacíos es suficiente | ❌ |
| **Detección por campos vacíos** | Cero cambios de contrato; backward compatible | Acopla la regla al frontend (documentada en la spec) | ✅ |

---

## 7. Producción

1. **Variables nuevas (Railway, backend-portaqr)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=https://portaqr.cl/api/auth/google/callback`. **Requisito previo**: crear credenciales OAuth en Google Cloud Console (OAuth 2.0 Client ID, tipo "Web application", Authorized redirect URIs = `https://portaqr.cl/api/auth/google/callback` y `http://localhost:3000/api/auth/google/callback` para dev).
2. **qr-app**: sin variables nuevas — el botón Google se muestra **siempre** (decisión usuario 2026-08-18: se eliminó el flag `NEXT_PUBLIC_GOOGLE_ENABLED`).
3. **Railway**: redeploy de `backend-portaqr` (npm install incluirá `passport-google-oauth20`) y de `qr-app` (nuevos proxies + onboarding). Sin cambios de CORS (todo pasa por el mismo dominio) ni de Mongo (campos nuevos opcionales; sin migración).
4. **Verificación post-despliegue**: flujo completo signup→verify→login→onboarding; flujo Google (consentimiento → callback → dashboard); `mongosh`: usuarios Google con `provider: 'google'`, `googleId`, `isEmailVerified: true`; usuarios nuevos locales con `userName` `user_*` y nombres vacíos hasta completar onboarding.

> [!note] Checklist de seguridad post-despliegue
> 1. `GET /auth/google` sin credenciales → 503 (no 500) y log claro.
> 2. Callback con `state` manipulado → 400, sin creación de usuario.
> 3. Tokens ausentes en cualquier URL/log (grep de `accessToken` en logs de qr-app).
> 4. Login local de usuario Google → 401 `'Credenciales inválidas'`.
> 5. Cuenta nueva de Google → `welcomeEmail` recibido (best-effort); cuenta local vinculada → **sin** welcomeEmail.
> 6. Correo de verificación (flujo local) sin nombre — saludo genérico (RF-22).
> 7. Reset de contraseña de un usuario sin onboarding → "Hola {email}!" (nunca "Hola  !"); activación de QR con firstName vacío → "Hola {email}, tus códigos..." (RF-26).

---

## 8. Criterios de calidad

- **Backend**: unit tests de `CreateUserUseCase` (CA-01/02/03 — userName generado, backward compatible, E11000 + reintento por userName generado RF-3), `UserValidationRules` (RF-2), `GoogleAuthService` (CA-09/10/11 — crear, vincular, login local falla; mode login sin cuenta → 401), `AuthController` (CA-07/08 — redirect con state, 400 state inválido, 503 sin credenciales; callback pasa mode de la cookie), `ChangePasswordUseCase` (primer set-password Google sin verificar anterior + sin tokenVersion++), `UserSchema` (RF-9), `JwtAuthService` (claims provider/hasPassword). `tsc --noEmit` + lint sin errores; suite completa verde (sin regresión en SPEC-009/011/012/019).
- **Frontend**: specs de `SignUpForm` (CA-13 — campos reducidos, validación), `OnboardingPageClient` (CA-05 — submit PATCH + redirect; feedback positivo userName disponible), `EditProfileForm` (feedback positivo userName), `LoginForm` (CA-04/19 — redirect condicional, botón Google condicional), `GoogleButton` (mode login/signup, disabled con hint de términos), proxy `google` (CA-07 — reenvía mode + todas las Set-Cookie), proxy `google/callback` (CA-12 — cookies + redirect, sin tokens en URL; 401 → /signup?error=google-no-account), proxy `change-password` (body vacío → `{ success: true }`). `tsc --noEmit` + jest verdes.
- **E2E** (`e2e-tests-portaqr`): suite chromium completa verde (92 passed + 1 flaky preexistente). Tests nuevos: `google-signup.spec.ts` (modal de términos + navegación mode=signup), `google-login.spec.ts` (navegación mode=login), `onboarding-username.spec.ts` (feedback "✓ disponible" / error), `settings-username.spec.ts` (feedback en EditProfileForm), `set-password.spec.ts` (Agregar contraseña para cuenta Google). Fixture `test-user.ts` y `SignUpPage.ts` actualizados al flujo RF-12/RF-13 (solo email+password; perfil completado en BD). `webpay-integration` (pago real Transbank) corre aparte.

## 9. Tareas

- [ ] Tareas registradas en `docs/tareas/SPEC-020-tareas.json` (formato Taskmaster).
- [ ] Rama `feat/spec-020-registro-simplificado-google-oauth` (backend-portaqr) y rama de qr-app (o la misma feature branch si el repo es monorepo — verificar convención de ramas del proyecto).

## 10. Referencias

- [[SPEC-001]] — migración al monolito modular `backend-portaqr` (bff/user/qr-service deprecados).
- [[SPEC-009]] — hardening auth: refresh token hasheado (A8), throttle `SENSITIVE_ENDPOINT_THROTTLE`, mensajes homogéneos `'Credenciales inválidas'`, `tokenVersion` + logout.
- [[SPEC-008]] — forbidNonWhitelisted: el proxy de signup construye payload explícito (whitelist).
- [[SPEC-007]] — H7: creación de usuario en 1 round-trip (verificationCode en el mismo insert).
- `backend-portaqr/src/modules/users/` — DTOs, schema, use cases, validators (baseline verificado 2026-08-17).
- `backend-portaqr/src/modules/auth/` — `AuthService.login`, `JwtAuthService.generateTokens` (RS256), `jwt.strategy.ts`, `auth.controller.ts`.
- `qr-app/src/components/SignUpForm/` — formulario a reducir (state/helpers/index).
- `qr-app/src/components/LoginForm/index.tsx` — patrón de submit + redirect + manejo `email_not_verified`.
- `qr-app/src/lib/auth.ts` — `setAuthCookies` (cookies httpOnly) reutilizada en el callback Google.
- `qr-app/src/app/dashboard/DashboardLayoutClient.tsx` — punto del guard de onboarding.
- `passport-google-oauth20` npm: https://www.npmjs.com/package/passport-google-oauth20
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2/web-server

---

## 11. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-08-17 | **SPEC creada** (borrador). Investigación verificada en `qr-app` y `backend-portaqr`: formulario de signup con 9 campos (`SignUpForm/index.tsx`, `state.ts`, `helpers.ts`); `CreateUserDto` con 6 campos obligatorios; schema `users` con userName/nombres/apellidos `required: true`; login devuelve perfil completo sin password (`AuthResponse = { user: Omit<User,'password'>, accessToken, refreshToken }`); **sin OAuth/Google** en backend (cero coincidencias); **sin flag de perfil completo/primer login**; `UpdateUserDto` ya permite userName/nombres/apellidos vía `PATCH /users/:id`; proxies `/api/auth/*` + `setAuthCookies` (cookies httpOnly) listos para reutilizar; `DashboardLayoutClient` como punto del guard; `NEXT_PUBLIC_BFF_URL=http://backend-portaqr:3004` (monolito activo, SPEC-001). |
| 2026-08-17 | **v2 — feedback del usuario**: (1) verificado que `registerEmail.ejs`/`sendVerificationEmail` **no usan nombre** (saludo genérico) → sin ajuste necesario, documentado como RF-22/CA-16; (2) **correo de bienvenida** para cuentas nuevas de Google (`welcomeEmail.ejs` + `sendWelcomeEmail`, saludo genérico, best-effort) → RF-23/CA-17/ADR-020.9; (3) copy del onboarding → **"Queremos saber cómo te llamas"**, aplica a primer login por correo y por Google → RF-24; (4) `/dashboard/settings` hoy solo tiene "Cambio de Contraseña" (`SettingsAccordion` + `ChangePasswordForm`) → nueva sección **"Datos Personales"** con `EditProfileForm` (nombre/apellidos/userName → `PATCH /users/:id` → `SET_USER`) → RF-25/CA-18. |
| 2026-08-17 | **v3 — auditoría completa de correos** (pedido del usuario "revisa todos los correos en cuáles usamos el nombre"): `registerEmail.ejs` (verificación) **no usa nombre**; `passwordReset.ejs` (recuperación) **sí** — `Hola <%= user.name %>!` con `nombreCompleto = firstName + paternalLastName + maternalLastName` (`forgot-password.usecase.ts:51`); `qrActivated.ejs` (activación QR, SPEC-019) **sí** — `Hola <%= userName %>...` con `userName = firstName + paternalLastName` (`qr-activated-notification.service.ts:73`). Con el signup simplificado, un usuario sin onboarding tendría "Hola  !" (reset) y "Hola , tus códigos..." (activación) → **RF-26**: helpers backend `getDisplayName(user)`/`getFullName(user)` (firstName si existe, si no email) aplicados en `forgot-password.usecase.ts` y `qr-activated-notification.service.ts`. Previews `registerEmail.html`/`email-preview*.html` son estáticos de desarrollo (no se envían). |
| 2026-08-17 | **v4 — decisión usuario**: el correo de bienvenida se envía a **TODOS los usuarios nuevos** (local y Google), no solo Google. RF-23/ADR-020.9/CA-17 actualizados: disparo en `CreateUserUseCase` (flujo local, además de la verificación) y en `GoogleAuthService` (flujo Google). El usuario local recibe 2 correos al registrarse (verificación + bienvenida); el usuario Google solo bienvenida (email ya verificado). |
| 2026-08-17 | **v5 — corrección usuario**: la bienvenida **NO se envía al registrarse** (cuenta no verificada) — se envía en el **primer login con cuenta verificada** (decisión usuario: "no se envía bienvenida si la cuenta no está verificada, el correo se enviará al primer login con cuenta verificada"). Nuevo **RF-27**: flag `welcomeEmailSent` (default false) en schema/entidad/mapper; disparo en `AuthService.login` (flujo local, tras login exitoso) y en `GoogleAuthService` (flujo Google, al crear = su primer login); si SMTP falla el flag queda `false` y se reintenta en el próximo login. **Solo usuarios nuevos** (decisión usuario): migración one-off `updateMany({ welcomeEmailSent: { $exists: false } }, { $set: { welcomeEmailSent: true } })` para los existentes. `CreateUserUseCase` ya NO dispara welcomeEmail. |
| 2026-08-17 | **v6 — ajustes de arquitectura hexagonal** (pedido del usuario "revisa la spec si hay que ajustar por hexagonal"): verificado contra el código real — `AuthService` NO inyecta `EmailService` (usa puertos `AUTH_SERVICE_PORT`/`REFRESH_TOKEN_STORE_PORT` y use cases de users); `AuthController` inyecta `AuthService` directo; `SENSITIVE_ENDPOINT_THROTTLE` existe en `common/config/throttle.config.ts`; `common/utils/` aloja utilidades compartidas. Ajustes: (1) `GoogleAuthService` implementa **puerto de entrada** `IGoogleAuthService` (`domain/ports/in/google-auth-service.port.ts`) + token `GOOGLE_AUTH_SERVICE_PORT` (patrón `AUTH_SERVICE_PORT`); (2) welcomeEmail se inyecta vía **puerto de salida** `ICanSendWelcomeEmail` (`domain/ports/out/email-sender.port.ts`) + token `AUTH_EMAIL_PORT` con binding `useExisting: EmailService` (patrón SPEC-019 `QR_ACTIVATE_EMAIL_PORT`/ADR-019.8 — la capa de aplicación/auth NUNCA inyecta EmailService directo); `AuthModule` importa `EmailModule`; (3) helpers RF-26 en `common/utils/user-name.util.ts` (compartidos entre users y qr-activate); (4) el `AuthController` inyecta `GoogleAuthService` directo (patrón real del controller). |
| 2026-08-18 | **v7 — implementación completa en backend-portaqr (repo local)**: el Google OAuth y el correo de bienvenida **solo existían en producción** (Railway), no en el repo local (el backend respondía 404 a `GET /auth/google` → el proxy devolvía `{"message":"Google OAuth no está configurado"}`). Implementado: `welcomeEmail.ejs` (paleta común de correos + logo `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png`, solo modo claro) + `sendWelcomeEmail` con flag `WELCOME_EMAIL_ENABLED` (default true, patrón `EMAIL_ACTIVATION_ENABLED` de SPEC-019); Google OAuth backend completo — `GoogleStrategy` (passport-google-oauth20), `GoogleAuthGuard`/`GoogleAuthCallbackGuard` (state CSPRNG + cookie httpOnly `oauth_state`, CSRF), `GoogleAuthService` (crear/vincular + tokens + welcomeEmail best-effort), endpoints `GET /auth/google` y `GET /auth/google/callback`, campos `googleId`/`provider`/`avatarUrl` en schema/entidad/mapper, `CreateUserDto` relajado (RF-1), `UserValidationRules` sin exigir nombre/apellidos (RF-2), `CreateUserUseCase` genera `user_<8 hex>` (RF-3) y no envía verificación si `isEmailVerified` (RF-8). Suite completa 157 suites/1310 tests verdes + `tsc` limpio. |
| 2026-08-18 | **v8 — reintento E11000 por userName generado (RF-3, defensa en profundidad)**: el usuario preguntó cómo se garantiza la unicidad del userName generado. Implementado en `CreateUserUseCase`: loop de hasta 3 intentos — si el E11000 es por `keyPattern.userName` y el userName fue **auto-generado** (no proveído), se regenera con otro valor y se reintenta; si es por `email` → 409 'El correo electrónico ya está registrado'; si es por userName elegido por el usuario → 409 'El nombre de usuario ya está en uso'; si se agotan los reintentos → 409 'No se pudo crear el usuario (conflicto de nombre de usuario)'. La unicidad real la da el índice `unique` de MongoDB; el reintento es la capa extra. 2 tests nuevos. |
| 2026-08-18 | **v9 — feedback positivo de disponibilidad de userName (RF-15/RF-25)**: el usuario pidió "si cambio el nombre de usuario pudiera saber si ese nombre está disponible". El check async ya existía (backend `GET /users/check-username/:userName` + proxy + `authService.checkUsernameExists` + blur handler) pero solo mostraba el error rojo cuando NO estaba disponible. Agregado estado `usernameAvailable` en `OnboardingPageClient` y `EditProfileForm`: cuando el check devuelve que el nombre NO existe → "✓ Nombre de usuario disponible" (verde, `role=status`); se resetea al cambiar el texto y al blur con campo vacío/igual al actual. 2 tests nuevos. |
| 2026-08-18 | **v10 — flujo "Agregar contraseña" para cuentas Google (ADR-020.11)**: el usuario preguntó "si me creo la cuenta con Google, ¿cómo logueo con contraseña?". El flujo anterior estaba ROTO para Google (`ChangePasswordDto` exigía `currentPassword` y el usecase la verificaba contra el hash aleatorio → siempre fallaba). Implementado flag `hasPassword` (default true; false solo para cuentas Google nuevas — `CreateUserUseCase` setea `hasPassword: dto.provider === 'google' ? false : true`); `ChangePasswordDto.currentPassword` → `@IsOptional()`; `ChangePasswordUseCase`: si `provider==='google' && !hasPassword` → salta verificación y NO incrementa tokenVersion; `SettingsAccordion` título dinámico "Agregar contraseña" vs "Cambio de Contraseña"; `ChangePasswordForm` no pide la anterior en el primer set-password y hace `SET_USER` con `hasPassword: true` tras éxito. 3 tests nuevos. |
| 2026-08-18 | **v11 — JWT con claims provider/hasPassword + migración**: el frontend no sabía si una cuenta era Google sin contraseña porque `getAuthUser()` construía el `AuthUser` SOLO desde el JWT (que no incluía `provider`/`hasPassword`) y el proxy de sesión solo copiaba firstName/apellidos. Fix: `JwtPayload` + `jwt.service.ts` agregan `provider`/`hasPassword` como claims; `getAuthUser()` (lib/auth.ts) y `session/route.ts` los propagan al `AuthUser` (el perfil completo del backend es la fuente de verdad). Migración one-off: `updateMany({ provider: 'google', hasPassword: { $exists: false } }, { $set: { hasPassword: false } })` (en local: 0 cuentas Google que migrar). |
| 2026-08-18 | **v12 — distinción login/signup en Google OAuth + términos obligatorios (ADR-020.10)**: el usuario preguntó "¿qué pasa si en el login presiono Google pero mi cuenta no está creada?" — antes el backend creaba la cuenta sin aceptar términos (problema legal/UX). Implementado: `GoogleAuthGuard` lee `?mode=login|signup` y lo persiste en cookie httpOnly `oauth_mode`; `GoogleAuthService.authenticate(profile, mode, tracking)` — en `mode='login'` si el email NO existe lanza 401 'No tienes una cuenta. Regístrate primero.' (no crea); en `'signup'` crea. Frontend: `GoogleButton` acepta props `mode`/`disabled` y navega a `/api/auth/google?mode=...`; `SignUpForm` pasa `disabled={!formData.acceptTerms}` (el botón Google exige aceptar términos — RN-1); `LoginForm` pasa `mode="login"`; callback redirige a `/signup?error=google-no-account` en 401; `SignUpPage` muestra "No tienes una cuenta con este correo. Regístrate para continuar." |
| 2026-08-18 | **v13 — fix proxy Google OAuth (mode + múltiples Set-Cookie)**: el usuario reportó que el login con cuenta no creada lo mandaba al **onboarding** en vez de signup. Causa raíz en `/api/auth/google/route.ts`: (1) NO pasaba el `mode` al backend (fetch a `/auth/google` sin `?mode=...`) → el backend asumía 'signup' → creaba la cuenta; (2) solo reenviaba UNA Set-Cookie (`headers.get('set-cookie')` devuelve solo la primera) → la cookie `oauth_mode` se perdía. Fix: leer `mode` del query del request y pasarlo al backend; usar `headers.getSetCookie()` y unirlas con `', '`. Además: hint visual en `GoogleButton` cuando `disabled` ("Acepta los términos y condiciones para habilitar el registro con Google.") y `provider`/`hasPassword` agregados al `JwtPayload` del frontend (lib/jwt.ts). Verificado en vivo: `/api/auth/google?mode=login` → 307 con cookies `oauth_state` + `oauth_mode=login`. Suites: backend 157/1313, frontend 25/178, `tsc` limpio. |
| 2026-08-18 | **v14 — tests E2E actualizados para SPEC-020 (26 fallos → 87 passed)**: al correr la suite E2E (`e2e-tests-portaqr`) había **26 fallos** — NO por los cambios de hoy, sino por tests desactualizados vs SPEC-020 (RF-12/RF-13/RF-24 implementados el 2026-08-17): el proxy de signup (RF-13) descarta `userName`/`firstName`/apellidos (whitelist solo email+password) → el fixture creaba el usuario con `user_xxx` y nombres vacíos → `loginAs` fallaba. Fixes: (1) `fixtures/test-user.ts` — crear con solo email+password, completar perfil en BD (`completeUserProfileInDb`), leer userName real de BD; (2) `pages/SignUpPage.ts` — formulario reducido (RF-12); (3) `tests/auth/register.spec.ts` — 3 tests al formulario reducido; (4) `tests/auth/verify-email.spec.ts` — crear con email+password, completar perfil, loguear con email; (5) `utils/db.ts` — helpers `completeUserProfileInDb` y `setUserNameInDb`; (6) `tests/admin/*` — `setUserNameInDb` + `completeUserProfileInDb` en qrs-admin-vista (3 clientes + CA-07), user-profile-soporte (2 tests), users-pagination (CA-06). Suite chromium completa: **87 passed / 0 failed**. |
| 2026-08-18 | **v15 — tests E2E nuevos para las features de SPEC-020 + fix proxy change-password**: creados 6 tests E2E nuevos: `tests/auth/google-signup.spec.ts` (click en Google sin aceptar términos abre el TermsModal con hint "Al continuar deberás aceptar los términos y condiciones."; aceptar navega a `/api/auth/google?mode=signup`), `tests/auth/google-login.spec.ts` (botón Google en login navega a `/api/auth/google?mode=login`), `tests/onboarding/onboarding-username.spec.ts` (feedback "✓ Nombre de usuario disponible" para userName libre y error para ocupado — login manual porque el usuario va a /onboarding), `tests/settings/settings-username.spec.ts` (feedback positivo en EditProfileForm), `tests/settings/set-password.spec.ts` (cuenta Google simulada con `makeUserGoogleInDb` muestra "Agregar contraseña" sin pedir la anterior y pasa a "Cambio de Contraseña"). **BUG REAL encontrado**: el proxy `/api/auth/change-password` hacía `response.json()` sobre un body vacío (el controller PATCH change-password devuelve `Promise<void>`) → **500 "Error al cambiar la contraseña" SIEMPRE** (afectaba el cambio normal y el set-password). Fix: leer `response.text()` y devolver `{ success: true }` si está vacío. Suite chromium completa: **92 passed + 1 flaky** (session-refresh logout, preexistente). |