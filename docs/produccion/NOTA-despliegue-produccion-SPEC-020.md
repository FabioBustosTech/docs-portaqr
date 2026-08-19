---
title: "Nota: Paso a producción — SPEC-020 (Registro simplificado + onboarding + login con Google)"
date: 2026-08-18
tags:
  - nota-despliegue
  - produccion
  - auth
  - oauth
  - google
  - onboarding
  - signup
aliases:
  - nota despliegue spec 020
  - nota produccion registro simplificado google oauth
---

# Nota: Paso a producción — SPEC-020 (Registro simplificado + onboarding + login con Google)

> [!abstract] Resumen
> La SPEC-020 (1) reduce el registro a **solo email + contraseña** (el backend genera el `userName` automáticamente — ADR-020.1), (2) captura **nombre, apellido paterno y materno** (obligatorios) + **userName opcional** en una **pantalla de bienvenida universal** (`/onboarding`) en el primer login (por correo o por Google — RF-24), (3) agrega **login con Google** (OAuth 2.0, `passport-google-oauth20`) con botón en login/signup, (4) permite **editar esos datos** en `/dashboard/settings` (RF-25), (5) distingue **login vs signup** en el flujo Google (el login NO crea cuentas; el signup exige aceptar términos — ADR-020.10), y (6) permite a cuentas Google **agregar contraseña** para loguear con email (flag `hasPassword` — ADR-020.11). **4 variables nuevas en `backend-portaqr`** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `WELCOME_EMAIL_ENABLED`) y **0 en `qr-app`** (el flag `NEXT_PUBLIC_GOOGLE_ENABLED` se eliminó — decisión usuario 2026-08-18: el botón se muestra siempre). Requiere **crear credenciales OAuth en Google Cloud Console** (requisito previo) y **2 migraciones one-off** (`welcomeEmailSent` y `hasPassword`). Se despliegan **ambos** repos (backend-portaqr y qr-app).

## Requisito previo: credenciales OAuth en Google Cloud Console

1. Ir a [Google Cloud Console](https://console.cloud.google.com/) → proyecto → **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Tipo: **Web application**.
3. **Authorized redirect URIs** (ambas):
   - `https://portaqr.cl/api/auth/google/callback` (producción)
   - `http://localhost:3000/api/auth/google/callback` (desarrollo local)
4. Copiar el **Client ID** y el **Client Secret** → configurar en Railway (backend-portaqr).

## Orden de despliegue

1. **`backend-portaqr`**: merge de `feat/spec-020-registro-simplificado-google-oauth` → deploy en Railway (npm install incluye `passport-google-oauth20`). Configurar las 4 variables de Google + welcomeEmail.
2. **Migración one-off #1** (ANTES de habilitar el login con welcomeEmail): marcar los usuarios existentes para que NO reciban el correo de bienvenida (solo los nuevos — decisión usuario 2026-08-17):
   ```js
   // mongosh (base `sistema`)
   db.users.updateMany(
     { welcomeEmailSent: { $exists: false } },
     { $set: { welcomeEmailSent: true } }
   );
   ```
3. **Migración one-off #2** (cuentas Google existentes sin contraseña asignada): las cuentas Google creadas ANTES del flag `hasPassword` no tienen el campo → el mapper asume `true` y la UI les pediría "Contraseña actual" (roto). Marcarlas `false` para que vean "Agregar contraseña":
   ```js
   // mongosh (base `sistema`)
   db.users.updateMany(
     { provider: 'google', hasPassword: { $exists: false } },
     { $set: { hasPassword: false } }
   );
   ```
4. **`qr-app`**: merge de `feat/spec-020-registro-simplificado-google-oauth` → deploy en Railway. **Sin variables nuevas** (el flag `NEXT_PUBLIC_GOOGLE_ENABLED` se eliminó — decisión usuario 2026-08-18: el botón se muestra siempre).

## Variables de entorno

| Variable                     | Descripción                                                                                                                                                                              | ¿Nueva? | Dónde                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------- |
| `GOOGLE_CLIENT_ID`           | Client ID de la app OAuth de Google                                                                                                                                                      | **Sí**  | backend-portaqr (Railway) |
| `GOOGLE_CLIENT_SECRET`       | Client Secret de la app OAuth (**secreto**)                                                                                                                                              | **Sí**  | backend-portaqr (Railway) |
| `GOOGLE_CALLBACK_URL`        | `https://portaqr.cl/api/auth/google/callback` — apunta al **proxy del frontend** (ADR-020.3: las cookies httpOnly se setean en el dominio del frontend; los tokens nunca viajan en URLs) | **Sí**  | backend-portaqr (Railway) |
| `WELCOME_EMAIL_ENABLED`      | `true` (default) envía el correo de bienvenida en el primer login verificado; solo `'false'` explícito lo desactiva (patrón `EMAIL_ACTIVATION_ENABLED` de SPEC-019)                      | **Sí**  | backend-portaqr (Railway) |

> [!note] Sin cambios de infraestructura
> No hay cambios de CORS, R2 ni Mongo (los campos nuevos `googleId`/`provider`/`avatarUrl`/`welcomeEmailSent`/`hasPassword` son opcionales — sin migración de schema, solo las 2 migraciones de datos one-off). El callback de Google pasa por el mismo dominio (`portaqr.cl/api/auth/google/callback`), así que no hay CORS cross-origin.

## Checklist de despliegue

1. **Google Cloud Console**: credenciales OAuth creadas con las 2 redirect URIs.
2. **backend-portaqr**: merge + deploy + 4 variables configuradas.
3. **Migración one-off #1** `welcomeEmailSent` ejecutada.
4. **Migración one-off #2** `hasPassword` (cuentas Google existentes) ejecutada.
5. **qr-app**: merge + deploy (sin variables nuevas — el botón se muestra siempre).
6. Verificar en logs: `GET /auth/google` responde 302 (no 503) — confirma que las credenciales están configuradas.

## Verificación post-despliegue

1. **Flujo local**: `/signup` muestra solo email/password/confirmPassword/términos → registrarse → correo de verificación (saludo genérico, sin nombre — RF-22) → verificar → login → **pantalla de bienvenida** "Queremos saber cómo te llamas" → completar perfil → dashboard sin redirects.
2. **Flujo Google (signup)**: botón "Continuar con Google" **deshabilitado hasta aceptar términos** (con hint "Acepta los términos y condiciones para habilitar el registro con Google.") → al aceptar, click → consentimiento → callback → dashboard (o `/onboarding` si Google no trajo `family_name`). Cuenta nueva de Google recibe **welcomeEmail** (best-effort).
3. **Flujo Google (login)**: botón "Continuar con Google" → si la cuenta **existe** → loguea (vincula `googleId` si era local — sin tocar password/role); si la cuenta **NO existe** → redirige a `/signup?error=google-no-account` con "No tienes una cuenta con este correo. Regístrate para continuar." (NO crea cuenta — ADR-020.10).
4. **Login local de usuario Google** → `401 'Credenciales inválidas'` (password aleatorio inutilizable — ADR-020.7).
5. **"Agregar contraseña" (cuentas Google)**: `/dashboard/settings` muestra la sección **"Agregar contraseña"** (sin pedir la anterior) → al asignarla, la UI pasa a "Cambio de Contraseña" normal (pide la anterior). Después puede loguear con email+contraseña O con Google. Si se olvida → "¿Olvidaste tu contraseña?" (flujo existente).
6. **`/dashboard/settings`** → sección "Datos Personales" → editar nombre/apellidos/userName → persiste y el header se actualiza. El campo userName muestra "✓ Nombre de usuario disponible" (verde) si está libre o el error rojo si está ocupado.
7. **Correos con fallback**: reset de password de un usuario sin onboarding → "Hola {email}!" (nunca "Hola  !"); activación de QR con firstName vacío → "Hola {email}, tus códigos..." (RF-26).
8. **`mongosh`**: usuarios Google con `provider: 'google'`, `googleId`, `isEmailVerified: true`, `hasPassword: false` (hasta asignar contraseña); usuarios nuevos locales con `userName` `user_*` y nombres vacíos hasta completar onboarding; `welcomeEmailSent: false` en nuevos / `true` en existentes.

## Consideraciones operativas

- **Seguridad del callback**: el `state` CSRF se valida contra la cookie httpOnly `oauth_state` (10 min) — un callback con `state` manipulado responde 400 sin crear nada (ADR-020.6). Los tokens JWT **nunca** viajan en query strings (ADR-020.3).
- **Mode login/signup**: el `mode` viaja en cookie httpOnly `oauth_mode` (seteada al iniciar el flujo). El proxy `/api/auth/google` reenvía el `mode` al backend y **todas** las Set-Cookie (`oauth_state` + `oauth_mode`) — si solo se reenvía una, el login con cuenta no creada crearía la cuenta (bug corregido en v13).
- **Best-effort del welcomeEmail**: si SMTP falla, el flag `welcomeEmailSent` queda `false` y se reintenta en el próximo login (RF-27). Un fallo de SMTP nunca rompe el login ni el callback OAuth.
- **`/auth/google` sin credenciales** → 503 con log claro (no 500). El botón se muestra **siempre** (decisión usuario 2026-08-18: se eliminó el flag `NEXT_PUBLIC_GOOGLE_ENABLED` — ya no depende de variables de entorno).
- **Rate limiting**: `GET /auth/google` y `GET /auth/google/callback` usan `SENSITIVE_ENDPOINT_THROTTLE` (5 req/min por IP — anti-bruteforce, SPEC-008 H4).
- **JWT con claims nuevos**: el access token ahora incluye `provider` y `hasPassword` — el frontend los usa para decidir si muestra "Agregar contraseña". Los tokens emitidos antes del deploy no los traen (el frontend usa fallback del perfil completo del backend en `/api/auth/session`).
- **Proxy `change-password` (fix v15)**: el backend responde 200 con body vacío (controller `Promise<void>`) — el proxy debe leer `response.text()` y devolver `{ success: true }` si está vacío (antes hacía `response.json()` → 500 "Error al cambiar la contraseña" SIEMPRE). Afecta el cambio de contraseña normal y el flujo "Agregar contraseña" de cuentas Google.

## Referencias

- [[SPEC-020-registro-simplificado-google-oauth]] — spec técnica completa (RF-1..RF-27, ADR-020.1..11).
- [[NOTA-despliegue-produccion-SPEC-019]] — patrón de nota de despliegue.
- [[SPEC-009]] — hardening auth (refresh hasheado, throttle, mensajes homogéneos).
- `passport-google-oauth20` npm: https://www.npmjs.com/package/passport-google-oauth20
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2/web-server
