---
title: "SPEC-030: Newsletter gestionada por CMS con suscripción de usuarios y público + desuscripción"
date: 2026-09-03
tags:
  - spec
  - newsletter
  - cms
  - backend
  - frontend
  - email
  - qr-cms
  - qr-app
status: implementado
aliases:
  - SPEC-030
  - newsletter cms
  - suscripcion newsletter
  - newsletter desuscribir
---

# SPEC-030: Newsletter gestionada por CMS con suscripción de usuarios y público + desuscripción

> [!abstract] Decisión clave
> La **fuente de verdad de la newsletter vive en `qr-cms`** (nueva colección `subscribers` + endpoints públicos propios). Todo alta — venga de **signup de `qr-app` con checkbox aceptado** o del **formulario público para no usuarios** (footer/blog) — termina registrada en el CMS con `email` normalizado, `status`, `source`, `consentAt` y `unsubscribeToken`. El **backend (`backend-portaqr`) solo sincroniza** el intent del signup (server-to-server con API key, best-effort, nunca bloquea la creación de la cuenta). **Cada correo de newsletter incluye desuscripción**: link con token en el footer + headers `List-Unsubscribe` / `List-Unsubscribe-Post` (one-click RFC 8058) + página pública de baja. Fase 1 = suscripciones + **correo de aceptación/confirmación** + bienvenida + baja (esta spec). Fase 2 = envíos masivos vía ESP (diseñada, no implementada).

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-03)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-cms/` (colección + endpoints), `desarrollo-qr/backend-portaqr/` (sync best-effort), `desarrollo-qr/qr-app/` (checkbox signup + formulario público + página de baja)
> - **Origen:** Requerimiento del usuario (2026-09-03): "inscripciones manejadas por cms; toda cuenta que se genere en qrapp cuando se cree la cuenta y acepte la newsletter que se registre en qr-cms; en los correos enviados de esa newsletter que se pueda desuscribir; personas que no sean usuario también se puedan suscribir; revisar estado actual y darme reporte".
> - **Infraestructura reutilizada:** `EmailService` (nodemailer + EJS, SPEC-019/020), patrón anti-spam contacto (SPEC-006: honeypot + throttle), colección+proxy auth Google (SPEC-020: proxy qr-app → backend, cookies httpOnly), wiring hexagonal con puertos (SPEC-019 ADR-019.8).
> - **Dependencias nuevas:** cero obligatorias en Fase 1. Fase 2 (envíos bulk) requerirá un ESP (Resend/Brevo recomendado) — el SMTP Gmail actual NO sirve para masivos.

---

## 1. Objetivo

1. Que las **inscripciones a la newsletter se gestionen en el CMS** (`qr-cms`): alta, baja, estado y auditoría de consentimiento en un solo lugar administrable desde `/admin`.
2. Que **toda cuenta creada en `qr-app` que acepte la newsletter quede registrada en `qr-cms`** automáticamente (email+password y Google — ver RF-5/RF-6).
3. Que **cualquier correo de la newsletter permita desuscribirse** en 1 clic (link con token + headers estándar), sin login.
4. Que **personas sin cuenta puedan suscribirse** (formulario público en footer/blog, con doble opt-in).
5. Cumplimiento base Ley 19.628 / 19.496 (Chile): consentimiento explícito no premarcado, prueba de consentimiento (`consentAt` + versión del texto + `source`), baja fácil y gratuita.

### 1.1 Out of scope

- **NO** se implementa el motor de envíos masivos en esta spec (Fase 2): ni cola BullMQ, ni integración Resend/Brevo, ni colección `newsletter-issues`, ni tracking de aperturas/clics, ni segmentación. Fase 1 deja el modelo y los endpoints listos para que Fase 2 solo agregue el envío (§4.5).
- **SÍ entra en esta spec (Fase 1, EN ALCANCE)**: el **correo de aceptación/confirmación** del doble opt-in (RF-11) + el **correo de bienvenida** (RF-11b), ambos transaccionales enviados desde `qr-cms` con nodemailer mínimo. Sin ellos el doble opt-in no funciona.
- **NO** se usa el SMTP Gmail (`backend-portaqr`) para envíos bulk (límites ~500/día, reputación del dominio, entregabilidad). Los únicos correos de esta spec son **transaccionales de confirmación/bienvenida de suscripción** (bajo volumen), enviados desde `qr-cms`.
- **NO** se migran listas externas (Mailchimp/Excel): se documenta importación manual vía CSV del admin (mejora futura).
- **NO** se toca `bff-service`/`user-service`/`qr-service` (deprecados, SPEC-001).
- **NO** se agrega preferencia granular por temas/frecuencia (solo suscrito/no-suscrito; mejora futura).
- **NO** se guarda IP cruda del suscriptor (minimización de datos — RN-8).

---

## 2. Reporte de estado actual (verificado 2026-09-03)

> [!warning] Conclusión del reporte
> **No existe nada de newsletter hoy (0%)**: cero coincidencias de `newsletter|suscrib|subscribe|mailchimp|resend|sendgrid|brevo` en `desarrollo-qr` (grep 2026-09-03). Lo único reutilizable es la **infra transaccional** (nodemailer+EJS) y los **patrones** de contacto/OAuth/CMS. Todo lo de suscriptores, sync, formularios y baja es trabajo nuevo.

| Aspecto | Estado actual (verificado) | Brecha |
| --- | --- | --- |
| Colección de suscriptores en `qr-cms` | **No existe**. `payload.config.ts` registra solo `[Users, Media, Categories, Authors, Posts]` | Crear `subscribers` + registrar en config + exponer lectura solo-admin en MCP |
| Endpoint público suscribirse | **No existe** (CMS solo tiene REST auto de colecciones + `/api/mcp`; sin rutas newsletter) | Nuevos Route Handlers `qr-cms/src/app/api/newsletter/*` |
| Endpoint desuscribirse / token | **No existe** | Nuevo endpoint por `unsubscribeToken` + página pública de baja |
| Checkbox newsletter en signup | **No existe**. `SignUpForm` solo tiene `email/password/confirmPassword/acceptTerms`; proxy `api/auth/signup` whitelistea `{ email, password }`; `auth.service SignUpData = { email, password }` (SPEC-020) | Agregar `newsletterOptIn` en form + state + helpers + proxy + DTO backend |
| Flag newsletter en backend users | **No existe**. Grep `newsletter\|marketing\|optIn\|consent` en `modules/users` = 0 resultados | Agregar `newsletterOptIn` (DTO efímero) + `newsletterSyncedAt` opcional para auditoría; fuente de verdad sigue siendo el CMS |
| Sync backend → CMS | **No existe** | Nuevo `NewsletterSyncService` server-to-server con API key, best-effort |
| Formulario público (no usuarios) | **No existe**. `Footer` solo tiene marca, social y columnas legales; sin formulario | Nueva `NewsletterSection` en home + `/blog` + `/newsletter` (nunca en footer) |
| Página de baja | **No existe** | Nueva `/newsletter/baja` (token) |
| Template email newsletter | **No existe**. Solo `registerEmail/welcomeEmail/passwordReset/qrActivated.ejs` en `backend-portaqr` (transaccionales, sin footer de baja ni `List-Unsubscribe`) | Nuevos templates en `qr-cms` (confirmación + bienvenida newsletter) con footer de baja |
| Headers `List-Unsubscribe` | **No existen** en ningún `sendMail` | Agregar en todos los correos newsletter (obligatorio CA-06) |
| Proveedor envíos masivos | **No existe**. Solo nodemailer+SMTP Gmail (transaccional). `qr-cms/package.json` sin ESP | Fase 2: contratar ESP (Resend/Brevo). Fase 1 no lo necesita |
| Legal (privacidad/términos) | Mencionan `contacto@portaqr.cl` y formulario, **sin cláusula newsletter** | Actualizar `/privacidad` con cláusula + versionar texto (`consentTextVersion`) |
| Anti-spam público | Existe patrón en contacto (SPEC-006: honeypot + `THROTTLE_SENSITIVE_LIMIT`) reutilizable | Reutilizar en endpoints newsletter |

---

## 3. Especificación

### 3.1 Requisitos funcionales (RF)

**Bloque A — CMS: colección `subscribers` (`qr-cms`)**

- **RF-1 (colección `subscribers`)**. `qr-cms/src/collections/Subscribers.ts` (slug `subscribers`, admin `useAsTitle: 'email'`, `defaultSort: '-createdAt'`):
  - `email` (email, required, unique, index; admin: placeholder `hola@ejemplo.cl`). Se guarda **normalizado** (hook `beforeChange`: trim + lowercase — mismo patrón `normalize()` de users).
  - `name` (text, opcional, maxLength 100): nombre dado en el formulario público (para personalizar `Hola {{name}}`).
  - `status` (select, required, default `subscribed`): `pending` (doble opt-in sin confirmar) | `subscribed` | `unsubscribed` | `bounced` (Fase 2 lo setea el webhook del ESP).
  - `source` (select, required): `signup` (cuenta qr-app) | `onboarding` | `footer` | `blog` | `settings` | `manual` (admin) | `import` (CSV futuro).
  - `userId` (text, opcional, index): id del usuario `backend-portaqr` cuando el origen es cuenta (trazabilidad, sin FK entre BDs — son Mongo distintas).
  - `consentAt` (date, required): fecha del consentimiento (alta o re-suscripción).
  - `consentTextVersion` (text, required, default `v1-2026-09`): versión del texto legal aceptado (auditoría).
  - `unsubscribeToken` (text, required, unique, admin hidden/readOnly): CSPRNG 32 hex (`randomBytes(16).toString('hex')`), generado en `beforeChange` si falta; **se rota** en cada re-suscripción desde `unsubscribed` (invalida links viejos filtrados).
  - `unsubscribedAt` (date, opcional) + `unsubscribeReason` (select opcional: `too-many-emails` | `not-relevant` | `never-signed-up` | `other`).
  - `confirmToken` (text, opcional, admin hidden): token del doble opt-in público (CSPRNG 32 hex, expira 48h vía `confirmExpiresAt`); se limpia al confirmar.
  - `bouncedAt` (date, opcional, solo Fase 2).
  - **Access**: `create: () => true` solo vía endpoints dedicados (la REST auto de la colección queda `create: adminOnly` — los endpoints usan `payload.create/update` con `overrideAccess: true` tras validar); `read/update/delete: admin`.
  - **MCP**: no exponer `subscribers` en `mcpPlugin` (datos personales; solo admin web).
- **RF-2 (validaciones CMS)**. Email RFC + longitud ≤254; `name` strip HTML (máx 100); `source` en enum; `status` transiciones permitidas: `pending→subscribed|unsubscribed`, `subscribed→unsubscribed|bounced`, `unsubscribed→subscribed` (re-alta rota token + actualiza `consentAt`), `bounced→subscribed` solo manual admin. Email duplicado → **idempotencia**: si existe y `subscribed` → `200 { status: 'already-subscribed' }` (sin error, sin re-enviar confirmación — anti-enumeración); si `unsubscribed` → re-suscribir (nuevo consent); si `pending` → re-enviar confirmación (con throttle); si `bounced` → `200 { status: 'needs-review' }` (no auto-reactivar por API pública).

**Bloque B — CMS: endpoints públicos (`qr-cms/src/app/api/newsletter/*`)**

- **RF-3 (POST `/api/newsletter/subscribe`)**. Body `{ email, name?, source, honeypot?, consent: true }`. Valida: `consent === true` (400 si falta — consentimiento explícito), honeypot vacío (si lleno → `200 ok` falso, log `newsletter_honeypot`), email válido, throttle (ver RF-9), `source` en enum público (`blog|home|precios|contacto|newsletter-page|signup|onboarding|settings`; `manual|import` rechazados; sin `footer` — la suscripción no vive en el footer, ajuste 2026-09-03). Lógica:
  - Normaliza email → busca suscriptor.
  - Nuevo → crea `pending` (orígenes públicos sin cuenta: `blog|home|precios|contacto|newsletter-page`) o `subscribed` (orígenes cuenta `signup|onboarding|settings`, que ya pasaron verificación de email del flujo auth) + `confirmToken` solo si `pending` → envía confirmación (RF-8) → `201 { status: 'pending-confirmation' | 'subscribed' }`.
  - Existente → idempotencia RF-2 → `200` con status correspondiente. **Nunca 409 por duplicado** (no revelar existencia más allá de lo necesario; el mensaje público es genérico).
  - Respuesta pública genérica para `pending`: `{ ok: true, message: 'Revisa tu correo para confirmar la suscripción.' }` (no confirma si el email existía).
- **RF-4 (GET+POST `/api/newsletter/unsubscribe`)**. Acepta `?token=` (GET, para 1-clic desde el email y `List-Unsubscribe-Post`) y body `{ token, reason? }` (POST). Token inválido → `404 { ok: false }` genérico (sin distinguir). Token válido → set `status: 'unsubscribed'`, `unsubscribedAt: now`, `reason?`, limpia `confirmToken` → `200 { ok: true }` idempotente (baja repetida = mismo 200). Log `newsletter_unsubscribed { source }`.
- **RF-5 (GET `/api/newsletter/confirm?token=`)**. Doble opt-in público = **prueba de propiedad de la bandeja**: token válido, existente y no expirado (48h) → `subscribed` + `consentAt: now` + **invalida el token en el acto** (`confirmToken: null`, un solo uso; segundo clic → 404) + envía bienvenida → redirect/JSON a página de éxito. Token expirado → `410` + reenvío vía `POST /api/newsletter/resend-confirm { email }` (throttle estricto: máx 3/24h por email, mensaje genérico siempre). Sin token válido **no existe forma** de pasar a `subscribed` por API pública (el admin puede hacerlo manual con `source: manual`, auditado).
- **RF-6 (POST `/api/newsletter/sync`)**. **Privado server-to-server** (solo backend): header `x-newsletter-api-key === NEWSLETTER_API_KEY` (401 si falta; 403 si inválida; sin distinguir en el mensaje). Body `{ email, name?, userId?, source: 'signup|onboarding|settings', consentAt }`. Crea `subscribed` directo (la cuenta ya verificará su email por el flujo auth) o re-suscribe según RF-2. Rate-limit laxo (origen confiable). Log `newsletter_synced`.

**Bloque C — Signup qr-app + backend (`qr-app`, `backend-portaqr`)**

- **RF-7 (checkbox signup + onboarding, `qr-app`)**.
  - `SignUpForm/state.ts`: `SignUpFormData` += `newsletterOptIn: boolean` (default `false`, **no premarcado** — RN-3). `helpers.ts`: sin validación bloqueante (boolean libre); `buildSubmitData` → `{ email, password, newsletterOptIn }`.
  - `index.tsx`: nuevo checkbox "Quiero recibir la newsletter de Porta QR (puedo darme de baja cuando quiera)" + link a `/privacidad#newsletter`. No bloquea el submit; estado accesible (`aria-label`, error nunca).
  - Google: el redirect OAuth no transporta el flag (stateless) → el intent se captura en **onboarding** (RF-7.1): `OnboardingPageClient` agrega el mismo checkbox (default `false`) y lo envía en el `PATCH /api/users/:id` como `newsletterOptIn`. Cubre Google + quienes no marcaron en signup.
  - Proxy `api/auth/signup/route.ts`: whitelist += `newsletterOptIn` (boolean, default `false`).
  - `auth.service.ts`: `SignUpData` += `newsletterOptIn?: boolean`.
- **RF-8 (backend sync, `backend-portaqr`)**.
  - `CreateUserDto` += `newsletterOptIn?: boolean` (`@IsOptional() @IsBoolean()`; forbidNonWhitelisted lo permite explícito — no rompe clientes viejos que no lo envían).
  - Schema `user.schema.ts` += `newsletterOptIn: boolean` (`default: false`) + `newsletterSyncedAt?: Date` (auditoría/reintento). Entidad + mapper actualizados.
  - Nuevo `NewsletterSyncService` (módulo `users`, provider exportable): `syncOnSignup({ email, name?, userId, newsletterOptIn })` — si `newsletterOptIn !== true` → no-op; si `true` → `POST {CMS_BASE_URL}/api/newsletter/sync` con `{ email, name, userId, source: 'signup', consentAt: now }` + header API key + timeout 5s. **Best-effort**: try/catch, `NEWSLETTER_SYNC_ENABLED !== 'false'` como kill-switch (mismo patrón `WELCOME_EMAIL_ENABLED`/`EMAIL_ACTIVATION_ENABLED`), fallo → warn `newsletter_sync_failed { userId, reason }` + `newsletterSyncedAt` queda `null` (reintento en próximo login o job manual futuro). Éxito → set `newsletterSyncedAt: now`.
  - `CreateUserUseCase` invoca el sync **después** del insert exitoso (no bloquea el 201 ni el correo de verificación).
  - **Timing verificado (fix 2026-09-04, bug reportado por el usuario)**: el CMS solo ve `subscribed` con email verificado. Signup email → el sync se **difiere** a `VerifyEmailUseCase` (al verificar, si `newsletterOptIn && !newsletterSyncedAt` → `syncSubscribe` source `signup` + audita); cuentas Google (`isEmailVerified=true` en creación) sincronizan en el acto; `UpdateUserUseCase` no toca el CMS si `!isEmailVerified`. Sin esto, el CMS mostraba `subscribed` antes de `/verify-email`.
  - `UpdateUserUseCase` (onboarding/settings): si el PATCH trae `newsletterOptIn: true` y el usuario estaba `false` → sync con `source: 'onboarding'|'settings'`; si trae `false` y estaba `true` → `POST /api/newsletter/unsubscribe-by-email` privado (mismo auth API key, body `{ email }`) — el CMS resuelve por email (origen confiable) y da de baja. Ambos best-effort.

**Bloque D — Formulario público + página de baja (`qr-app`)**

- **RF-9 (componente reutilizable `NewsletterSubscribe` — suscripción sin cuenta, `qr-app`)**. Componente client autocontenido para captar **personas sin cuenta**, pensado para reutilizarse en cualquier punto de la app con una sola línea (`<NewsletterSection source="home" />`). **NO se usa en el footer** (decisión usuario 2026-09-03: fuera del footer). Patrón visual/lógico = `ContactForm.tsx` (`useState` + `isValidEmail` + `useToast` + `Button/Input/Label` de `@/components/ui`). Estructura `qr-app/src/components/NewsletterSubscribe/`: `index.tsx` (wrapper + variantes), `useNewsletterSubscribe.ts` (estado + POST al proxy), `NewsletterSubscribe.spec.tsx`.
  - Props (`NewsletterSubscribe`): `{ source: 'blog'|'home'|'precios'|'contacto'|'newsletter-page', variant?: 'compact'|'full', showName?: boolean, title?: string, description?: string, className?: string }`. `variant: 'compact'` (solo email + botón, reservada sin uso inicial) vs `'full'` (email + `name?` + checkbox + textos legales). Wrapper `NewsletterSection` (`qr-app/src/components/NewsletterSection/`: `index.tsx` + spec): tarjeta estándar (`max-w-xl rounded-2xl border bg-card p-6`) con `NewsletterSubscribe full + showName`; props `{ source, title?, description?, className? }`. `source` viaja al CMS tal cual (auditoría `source`); valores fuera del enum → el proxy lo rechaza (400).
  - Campos: `email` (required, max 254, validación `isValidEmail` en cliente + servidor), `name?` (opcional, max 100, solo `full` con `showName`, strip HTML), checkbox consentimiento **obligatorio y no premarcado** ("Acepto recibir la newsletter de Porta QR. Puedo darme de baja cuando quiera. Ver [privacidad](/privacidad#newsletter)." — sin él no hay submit), honeypot oculto (`tabIndex={-1}`, `aria-hidden`, autocomplete off; si lleno → éxito falso local sin llamar a la API).
  - Servicio `qr-app/src/services/newsletter.service.ts`: `subscribe({ email, name?, source, consent, honeypot }) → POST /api/newsletter/subscribe` (proxy qr-app → CMS; el navegador nunca ve `CMS_BASE_URL` ni API key). Timeout 10s; error de red → mensaje genérico "No pudimos procesar tu suscripción. Inténtalo de nuevo." (anti-enumeración: nunca revela si el email existía).
  - Estados: `idle|sending|pending-confirmation|error` con `role="status"`/`aria-live`; éxito → mensaje "Revisa tu correo para confirmar la suscripción." + limpia el form (flujo doble opt-in RF-3); conserva `source` para analytics.
  - A11y/i18n: `Label` real por campo, foco visible, botón `aria-label="Suscribirme a la newsletter"`, mensajes en español, compatible dark mode único (SPEC-025).
  - Throttle del proxy: reutiliza `SENSITIVE_ENDPOINT_THROTTLE` (SPEC-006).
  - Puntos de uso (todos con `<NewsletterSection source="..." />`, solo cambia `source`): home (`HomePageClient`, entre `Features` y `CtaSection`) + final de `app/blog/[slug]/page.tsx` (`source="blog"`) + página `/newsletter` (`source="newsletter-page"` + explicación + link a baja). Extensión futura sin cambios: `precios` (bajo planes), `contacto` (lateral del form) — solo importar y montar con su `source`.
- **RF-10 (página `/newsletter/baja`)**. Pública, `metadata robots: noindex`. Lee `?token=`: sin token → formulario para pegar email (flujo alterno: `POST /api/newsletter/request-unsubscribe { email }` → el CMS envía email con link tokenizado si existe, mensaje genérico siempre); con token → auto-`POST` unsubscribe + confirmación visual + motivo opcional (`reason` select) + link "volver a suscribirme". Soporta `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (el POST del proveedor de correo llega sin JS — el Route Handler lo procesa igual).

**Bloque E — Correos newsletter (plantillas + headers)**

- **RF-11 (correo de aceptación/confirmación — EN ALCANCE Fase 1, `qr-cms`)**. Es el correo que **acepta y verifica** la suscripción pública (doble opt-in). Sin este correo la protección anti-terceros (RN-10) no existe, por eso **se implementa en esta spec** (no en Fase 2).
  - Archivo `qr-cms/src/emails/newsletter-confirm.ejs` (EJS). **Base de copia exacta: `welcomeEmail.ejs`** (el más nuevo: con logo PNG + solo modo claro — ver auditoría abajo). Estructura idéntica: `<!DOCTYPE html lang="es">` + `table[role=presentation]` max 600px + `.container` + `.header` (logo + `h1`) + `.content` + `.button` + `.footer`. **NO copiar `registerEmail.ejs`** (antiguo: sin logo y con `@media dark` — descartado por decisión usuario 2026-08-17).
  - Auditoría línea gráfica (verificada 2026-09-03 en `backend-portaqr/src/templateEmail/` — `registerEmail.ejs` + `welcomeEmail.ejs` + `passwordReset.ejs` + `qrActivated.ejs`): font `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` 1.6; body `color #4B5563` / `bg #E5E7EB`; links `#1E3A8A` (hover underline); `.container` `#F9FAFB` padding 20px radius 8px shadow `0 2px 4px rgba(0,0,0,0.1)`; `.header` centrado padding `20px 0`, `img.logo max-width 200px`, `h1 24px #1E3A8A margin 16px 0 0`; `.content` padding 20px centrado, `p 16px #4B5563 margin 10px 0`; `.button` inline-block padding `12px 24px`, `bg #1E3A8A`, `color #F9FAFB !important`, radius 5px, 16px bold, margin `20px 0`, hover `#1E40AF`; `.footer` centrado 12px `#9CA3AF` padding 20px `border-top 1px solid #D1D5DB`, links `#9CA3AF`; responsive `@media 600px` (container 15px, h1 20px, p 14px, button `10px 20px`/14px); **solo modo claro: SIN `@media (prefers-color-scheme: dark)`** (como `welcomeEmail.ejs`/`qrActivated.ejs`); logo `<a href="<%= baseUrl %>"><img src="https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png" alt="Porta QR" width="200" class="logo"></a>` (PNG remoto linkeado, NO SVG — SPEC-019 ADR-019.7); footer base `"¿Necesitas ayuda? Contacta a soporte@portaqr.cl" + "Porta QR © 2025"` al que se **agrega** el bloque de baja (RF-11c).
  - Contenido: logo Porta QR (PNG remoto, patrón SPEC-019 RF-1.2) + título "Confirma tu suscripción" + saludo (`Hola {{name}}!` si hay `name`, si no genérico — nunca "Hola  !") + texto "Recibimos una solicitud para suscribir {{email}} a la newsletter de Porta QR desde {{sourceLabel}}. Si fuiste tú, confirma con el botón (vence en 48h). Si no fuiste tú, ignora este correo — no quedará suscrito." + **CTA "Confirmar suscripción" → `{{confirmUrl}}`** (botón + URL en texto plano por si el botón no renderiza) + aviso expiración + footer de baja (RF-11c).
  - Variables: `{ name?, email, sourceLabel, confirmUrl, expiresAt, baseUrl }`. `confirmUrl = {NEWSLETTER_PUBLIC_URL}/api/newsletter/confirm?token={confirmToken}` (el click lo resuelve el CMS; la página de éxito es `qr-app /newsletter/confirmada`).
  - Envío `sendNewsletterConfirmEmail({ to, name?, confirmUrl, expiresAt })` en `qr-cms/src/lib/newsletter-mail.ts`: `subject: 'Confirma tu suscripción a la newsletter | Porta QR'`, `from: EMAIL_FROM`, `to`, `html` renderizado, **sin attachments**, con headers RF-12. Llamado solo desde `POST /subscribe` y `POST /resend-confirm` (ambos con throttle RN-10c). Fallo SMTP → 502 genérico al cliente + log `newsletter_confirm_failed { emailHash }` (no filtrar email en logs públicos; hash sha256 corto). Reintento solo vía `resend-confirm` (no auto-retry).
  - Tests: render contiene `confirmUrl` + `email` enmascarado + aviso 48h; `sendMail` llamado 1 vez por solicitud; token reutilizado → 404; expirado → 410.
- **RF-11b (correo de bienvenida — EN ALCANCE Fase 1)**. `qr-cms/src/emails/newsletter-welcome.ejs` (misma línea gráfica): se envía al pasar a `subscribed` (click confirm público, sync `signup/onboarding/settings`, o alta manual admin). Contenido: "¡Suscripción confirmada!" + qué esperar (novedades, tips QR, frecuencia estimada mensual) + CTA "Visitar el blog" → `{baseUrl}/blog` + footer de baja (RF-11c). `subject: '¡Bienvenido(a) a la newsletter de Porta QR!'`. Un solo envío por suscripción (flag `welcomeSentAt`; re-suscripción tras baja sí re-envía con nuevo `consentAt`).
- **RF-11c (footer + datos obligatorios en ambos correos)**. Bloque final: "Recibes este correo porque {{email}} se suscribió a la newsletter de Porta QR (origen: {{sourceLabel}}, fecha: {{consentAt|confirmAt}}). [Darme de baja]({{unsubscribeUrl}})" + dirección postal (entregabilidad) + `soporte@portaqr.cl`. En el correo de confirmación el link de baja resuelve igual (si aún es `pending`, la baja lo marca `unsubscribed` directo — el dueño de una bandeja ajena puede cortar el flujo sin confirmar).
- **RF-12 (headers de baja)**. Todo `sendMail` newsletter incluye: `List-Unsubscribe: <{{unsubscribeUrl}}>, <mailto:newsletter-baja@portaqr.cl?subject=unsubscribe>` y `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 2369/8058 — baja en 1 clic desde Gmail/Apple Mail). `unsubscribeUrl = {NEWSLETTER_PUBLIC_URL}/newsletter/baja?token={unsubscribeToken}` (token por suscriptor). CA-06 lo verifica con mock.
- **RF-13 (variables de entorno)**. CMS: `NEWSLETTER_API_KEY` (requerida, generada `randomBytes(32).hex`), `NEWSLETTER_PUBLIC_URL` (default `http://localhost:3000`), `NEWSLETTER_DOUBLE_OPT_IN` (default `true` — solo `'false'` lo desactiva), `SMTP_*` + `EMAIL_FROM` (reutiliza nombres del backend para operar igual en Railway), `NEWSLETTER_RATE_LIMIT_*`. Backend: `CMS_BASE_URL`, `CMS_NEWSLETTER_API_KEY` (= `NEWSLETTER_API_KEY` del CMS), `NEWSLETTER_SYNC_ENABLED` (default `true`). Frontend: sin vars nuevas (usa proxy). Todas documentadas en `.env.example` de cada proyecto (proceso `rules/common/environment-variables.md`).

### 3.2 Reglas de negocio

- **RN-1**. El CMS es la **única fuente de verdad** de suscripciones. El backend nunca decide estado; solo reporta intents. El admin edita en `/admin` (colección `subscribers`).
- **RN-2**. El sync signup es **best-effort**: un fallo CMS/red **nunca** rompe el 201 de `POST /users` ni el login (log `newsletter_sync_failed`; `newsletterSyncedAt = null` permite reintento).
- **RN-3**. Consentimiento **explícito y no premarcado** en todos los formularios (checkbox `false` por defecto). Sin consentimiento no hay alta (400 en endpoint público; no-op en sync).
- **RN-4**. **Doble opt-in obligatorio para público** (todos los `source` sin cuenta: `blog|home|precios|contacto|newsletter-page` → `pending` + confirmación 48h de un solo uso); **simple opt-in solo para cuentas** (`signup|onboarding|settings` → `subscribed` directo, el email se verifica por el flujo auth de todos modos). Fundamento: la única forma de probar que el email existe y que quien lo ingresó es su dueño es que **alguien con acceso a esa bandeja haga clic**. Sin ese clic no hay suscripción ni envíos.
- **RN-5**. La baja es **inmediata, gratuita, sin login y en 1 clic** (token en URL + headers). Token inválido → 404 genérico (no filtrar existencia).
- **RN-6**. Re-suscripción **rota el `unsubscribeToken`** (los links viejos mueren) y actualiza `consentAt` + `consentTextVersion`.
- **RN-7**. **Nunca 409 por email duplicado** en endpoints públicos (idempotencia + mensajes genéricos anti-enumeración).
- **RN-10 (anti-spam a terceros)**. (a) **Cero contenido sin confirmación**: a un email `pending` solo se le envía el correo de **confirmación** (1 por solicitud, con throttle); la bienvenida y cualquier futuro bulk exigen `status: subscribed`. (b) El token de confirmación es **de un solo uso y expira en 48h**; expirado → 410 + reenvío throttled. (c) Throttle doble: por email (máx 3 confirmaciones/24h) y por IP/origen (SPEC-006) — un atacante no puede spamear la misma bandeja ajena ni enumerar. (d) Validación previa: sintaxis RFC, longitud ≤254, normalización trim+lowercase, chequeo **MX del dominio** (si el dominio no recibe correo → 400 genérico) y bloque de dominios desechables conocidos. (e) Limpieza: job/diario archiva `pending` expirados >30 días (no crecen indefinidamente).
- **RN-8**. Minimización: no se guarda IP; la prueba de consentimiento es `consentAt + consentTextVersion + source (+ userId si es cuenta)`.
- **RN-9**. El remitente bulk futuro será subdominio/ESP dedicado (no `EMAIL_FROM` transaccional de Gmail) — Fase 2.

### 3.3 Criterios de aceptación (CA)

- **CA-01**: `POST /api/newsletter/subscribe { email nuevo, consent: true, source: home }` → `201 pending-confirmation`, doc `pending` con `confirmToken`, **1 correo de confirmación** con botón (token válido 48h, un solo uso). Sin clic → jamás recibe bienvenida ni bulk (RN-10a). Email de un tercero ingresado por un atacante → el dueño lo ignora y expira; el atacante no obtiene nada (respuesta genérica) y el throttle frena reintentos.
- **CA-02**: `GET /api/newsletter/confirm?token=` válido → `subscribed`, `confirmToken` limpio, correo bienvenida con footer de baja.
- **CA-03**: signup `qr-app` con `newsletterOptIn: true` → `201` cuenta + doc `subscribed` en CMS con `source: signup` y `userId` del nuevo usuario (mock del sync en unit test; verificación real con `mongosh` en CMS).
- **CA-04**: signup con `newsletterOptIn: false/ausente` → cuenta creada, **cero** llamadas al CMS.
- **CA-05**: Google → onboarding con checkbox marcado → `PATCH` sincroniza (`source: onboarding`); toggle off en settings → baja en CMS.
- **CA-06**: todo `sendMail` newsletter contiene header `List-Unsubscribe` con `unsubscribeUrl` del suscriptor + footer HTML con link de baja (verificado con mock `sendMail`).
- **CA-07**: `POST /api/newsletter/unsubscribe { token válido }` → `unsubscribed` + `unsubscribedAt`; segunda llamada mismo token → mismo `200` (idempotente); token inválido → `404` genérico.
- **CA-08**: no-usuario se suscribe desde la sección del blog → aparece en admin CMS (`source: blog`, `consentTextVersion: v1-2026-09`); se da de baja desde el link del correo sin login → estado visible en admin.
- **CA-09**: CMS caído durante signup con opt-in → cuenta `201` igual, warn `newsletter_sync_failed`, `newsletterSyncedAt = null`.
- **CA-10**: honeypot lleno o `consent !== true` → sin alta (`200` falso / `400` respectivamente); throttle público no bloquea el flujo cuenta (orígenes distintos).
- **CA-11**: `tsc --noEmit` + suites jest/vitest verdes en los 3 proyectos (sin regresión SPEC-006/019/020/023).
- **CA-12** (manual): suscribirse → confirmar → recibir bienvenida → abrir en Gmail → "Darse de baja" one-click funciona → re-suscribirse rota el token (el link viejo da 404).

---

## 4. Diseño Técnico

### 4.1 Flujo de datos — signup con newsletter (cuenta)

```
[qr-app] /signup (email + password + newsletterOptIn checkbox, default false)
  │ POST /api/auth/signup { email, password, newsletterOptIn }   (proxy whitelist)
  ▼
[backend-portaqr] POST /users { email, password, newsletterOptIn }
  1. validateForCreate + hash + insert (201 aunque el CMS esté caído)
  2. si newsletterOptIn === true:
       NewsletterSyncService.syncOnSignup(...) → POST {CMS}/api/newsletter/sync
       { email, userId, source: 'signup', consentAt } + x-newsletter-api-key
       (timeout 5s, kill-switch NEWSLETTER_SYNC_ENABLED, try/catch → warn, no re-throw)
  ▼
[qr-cms] POST /api/newsletter/sync (auth API key)
  upsert por email normalizado → subscribed + consentAt + userId + token
  → sendWelcome (footer + List-Unsubscribe)
```

### 4.2 Flujo de datos — suscripción pública (doble opt-in)

```
[qr-app] NewsletterSection (home/blog/landing) { email, name?, consent: true, honeypot }
  │ POST /api/newsletter/subscribe (proxy qr-app → CMS, throttle sensible)
  ▼
[qr-cms] POST /api/newsletter/subscribe
  1. honeypot/consent/email/source/throttle
  2. existe subscribed → 200 already-subscribed (genérico)
     nuevo/existe pending → upsert pending + confirmToken (48h) → sendConfirm
  ▼ (usuario hace clic)
GET /api/newsletter/confirm?token= → subscribed → sendWelcome
```

### 4.3 Flujo de datos — baja en 1 clic

```
[Email newsletter] footer link + headers List-Unsubscribe(-Post)
  │ click "Darme de baja" → GET /newsletter/baja?token= (qr-app, noindex)
  ▼ POST /api/newsletter/unsubscribe { token } (proxy → CMS)
[qr-cms] token válido → unsubscribed + unsubscribedAt (+ reason?)
  │ token inválido → 404 genérico · repetida → 200 idempotente
```

### 4.4 Contratos de API

```
# qr-cms (nuevos Route Handlers)
POST /api/newsletter/subscribe        público, throttle estricto
  req:  { email, name?, source: blog|home|precios|contacto|newsletter-page|signup|onboarding|settings, consent: true, honeypot? }
  res:  201 { ok, status: 'pending-confirmation'|'subscribed' } | 200 { ok, status: 'already-subscribed' }
GET  /api/newsletter/confirm?token=   público → 302 página éxito | 404 | 410 expirado
POST /api/newsletter/resend-confirm   público { email } → 200 genérico (throttle estricto)
POST /api/newsletter/unsubscribe      público { token, reason? } | GET ?token= → 200 { ok } | 404
POST /api/newsletter/request-unsubscribe público { email } → 200 genérico (envía link si existe)
POST /api/newsletter/sync             PRIVADO (x-newsletter-api-key)
  req:  { email, name?, userId?, source: signup|onboarding|settings, consentAt }
POST /api/newsletter/unsubscribe-by-email PRIVADO { email, reason? } (toggle off settings)

# backend-portaqr (sin cambios de contrato público)
POST /users   acepta opcional newsletterOptIn?: boolean (backward compatible)
PATCH /users/:id acepta opcional newsletterOptIn?: boolean (dispara sync/baja best-effort)

# qr-app (proxies + páginas)
POST /api/newsletter/subscribe|unsubscribe|request-unsubscribe  (proxy → CMS, throttle)
GET  /newsletter/baja?token=   página pública (noindex)
```

```ts
// qr-cms/src/collections/Subscribers.ts (esqueleto)
export const Subscribers = {
  slug: 'subscribers',
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'status', 'source', 'consentAt'] },
  access: { create: () => false, read: ({ req }) => !!req.user, update: ({ req }) => !!req.user, delete: ({ req }) => !!req.user },
  hooks: { beforeChange: [normalizeEmail, ensureTokens] },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text', maxLength: 100 },
    { name: 'status', type: 'select', required: true, defaultValue: 'subscribed',
      options: ['pending', 'subscribed', 'unsubscribed', 'bounced'] },
    { name: 'source', type: 'select', required: true,
      options: ['signup', 'onboarding', 'footer', 'blog', 'settings', 'manual', 'import'] },
    { name: 'userId', type: 'text', index: true },
    { name: 'consentAt', type: 'date', required: true },
    { name: 'consentTextVersion', type: 'text', required: true, defaultValue: 'v1-2026-09' },
    { name: 'unsubscribeToken', type: 'text', required: true, unique: true, admin: { hidden: true } },
    { name: 'confirmToken', type: 'text', admin: { hidden: true } },
    { name: 'confirmExpiresAt', type: 'date', admin: { hidden: true } },
    { name: 'unsubscribedAt', type: 'date' },
    { name: 'unsubscribeReason', type: 'select', options: ['too-many-emails', 'not-relevant', 'never-signed-up', 'other'] },
  ],
}
```

### 4.5 Cambios por archivo

| Proyecto / Archivo | Cambio |
| --- | --- |
| `qr-cms/src/collections/Subscribers.ts` (nuevo) | Colección RF-1 + hooks normalización/tokens + transiciones RF-2 |
| `qr-cms/src/collections/Subscribers.spec.ts` (nuevo) | Tests transiciones/idempotencia/rotación token |
| `qr-cms/src/payload.config.ts` | Registrar `Subscribers` en `collections` (sin exponer en `mcpPlugin`) |
| `qr-cms/src/app/api/newsletter/subscribe/route.ts` (nuevo) | RF-3 (honeypot+throttle+upsert+sendConfirm) |
| `qr-cms/src/app/api/newsletter/confirm/route.ts` (nuevo) | RF-5 doble opt-in 48h |
| `qr-cms/src/app/api/newsletter/unsubscribe/route.ts` (nuevo) | RF-4 GET+POST token, idempotente |
| `qr-cms/src/app/api/newsletter/sync/route.ts` (nuevo) | RF-6 privado API key |
| `qr-cms/src/emails/newsletter-confirm.ejs` (nuevo) | RF-11 correo aceptación: CTA confirma 48h, URL texto plano, footer baja, solo modo claro |
| `qr-cms/src/emails/newsletter-welcome.ejs` (nuevo) | RF-11b bienvenida (un envío por suscripción, flag `welcomeSentAt`) |
| `qr-cms/src/lib/newsletter-mail.ts` (nuevo) | `sendNewsletterConfirmEmail` + `sendNewsletterWelcomeEmail` (nodemailer mínimo + headers RF-12) + specs con mock |
| `qr-cms/.env.example` | `NEWSLETTER_API_KEY`, `NEWSLETTER_PUBLIC_URL`, `NEWSLETTER_DOUBLE_OPT_IN`, `SMTP_*`, `EMAIL_FROM` |
| `backend-portaqr/src/modules/users/.../create-user.dto.ts` | `newsletterOptIn?: boolean` (`@IsOptional() @IsBoolean()`) |
| `backend-portaqr/.../user.schema.ts` + entidad + mapper | `newsletterOptIn` (default false) + `newsletterSyncedAt?` |
| `backend-portaqr/src/modules/users/application/services/newsletter-sync.service.ts` (nuevo) | RF-8 (POST CMS, timeout 5s, kill-switch, best-effort) + spec con mock fetch |
| `.../create-user.usecase.ts` + `update-user.usecase.ts` | Invocar sync/baja post-persistencia (try/catch, no re-throw) |
| `backend-portaqr/.env.example` | `CMS_BASE_URL`, `CMS_NEWSLETTER_API_KEY`, `NEWSLETTER_SYNC_ENABLED=true` |
| `qr-app/src/components/SignUpForm/{state,helpers,index}.tsx` | RF-7 checkbox + payload |
| `qr-app/src/app/api/auth/signup/route.ts` + `services/auth.service.ts` | whitelist + tipo `newsletterOptIn` |
| `qr-app/src/app/onboarding/OnboardingPageClient.tsx` | Checkbox newsletter → PATCH `newsletterOptIn` |
| `qr-app/src/components/NewsletterSubscribe/` (nuevo: `index.tsx` + `useNewsletterSubscribe.ts` + spec) | RF-9 reutilizable sin cuenta (`compact`/`full`, `source` por punto de uso) + spec |
| `qr-app/src/components/home/HomePageClient.tsx` | Montar `<NewsletterSection source="home" />` entre `Features` y `CtaSection` |
| `qr-app/src/components/NewsletterSection/` (nuevo: `index.tsx` + spec) | Wrapper tarjeta reutilizable (`full` + `showName`, sin footer) + spec |
| `qr-app/src/app/blog/[slug]/page.tsx` | Montar `<NewsletterSection source="blog" />` al final del artículo |
| `qr-app/src/app/newsletter/page.tsx` + `/newsletter/baja/page.tsx` (nuevas) | Landing + baja por token (noindex) + specs |
| `qr-app/src/app/api/newsletter/*/route.ts` (nuevos proxies) | Forward al CMS con throttle (SPEC-006) |
| `qr-app/src/app/privacidad/*` + `/terminos` | Cláusula `#newsletter` (texto v1-2026-09) |

### 4.6 ADRs

> [!info] ADR-030.1 — ¿Dónde vive la fuente de verdad: CMS o backend?
> **Decisión**: **`qr-cms`** (requerimiento literal del usuario + bounded contexts).
> - El equipo de contenido administra suscriptores, importa/exporta CSV y (Fase 2) redacta envíos sin tocar el backend ni pedir deploy. El backend de cuentas no debe acoplar su dominio `users` a marketing.
> - Contra-punto: dos Mongo distintas (sin FK real; `userId` es texto informativo). Aceptado: la consistencia es eventual y best-effort (RN-1/RN-2); la baja nunca depende del backend.

> [!info] ADR-030.2 — ¿Quién inicia el sync del signup: frontend dual-write o backend server-to-server?
> **Decisión**: **backend server-to-server** (`NewsletterSyncService` → `POST /api/newsletter/sync` con API key).
> - Garantiza el registro aunque el usuario cierre la pestaña tras el 201, centraliza el secreto (el navegador nunca ve `NEWSLETTER_API_KEY`), y permite reintento (`newsletterSyncedAt`). El dual-write desde el navegador duplicaría llamadas, expondría el endpoint y fallaría silenciosamente.
> - El frontend igual envía el intent (`newsletterOptIn`) en el DTO; el backend decide y reporta.

> [!info] ADR-030.3 — ¿Doble opt-in para todos o mixto?
> **Decisión**: **mixto (RN-4)**: doble opt-in para público (`footer|blog` → `pending` 48h), simple para cuentas (`signup|onboarding|settings` → `subscribed`).
> - El formulario público acepta cualquier email (riesgo de suscribir a terceros → exige confirmación). La cuenta en cambio ya verifica su email por el flujo auth (SPEC-009/020); pedirle otro clic degradaría la conversión sin ganar seguridad.
> - `NEWSLETTER_DOUBLE_OPT_IN=false` permite degradar a simple global en staging/tests.

> [!info] ADR-030.4 — ¿Quién envía los correos newsletter: backend o CMS?
> **Decisión**: **`qr-cms` con nodemailer mínimo propio** (Fase 1: solo confirmación/bienvenida, bajo volumen).
> - Evita acoplar el ciclo de vida de marketing al monolito de cuentas y deja los templates junto a la colección que los usa. Duplica ~50 líneas de transporte SMTP (costo menor, mismo `.env`).
> - Los bulk (Fase 2) NO irán por este transporte: será ESP con webhooks de bounce (RN-9).

> [!info] ADR-030.5 — ¿Token de baja: JWT o random opaco?
> **Decisión**: **random opaco 32 hex por suscriptor** (CSPRNG, único, roteable).
> - El JWT exigiría secreto compartido qr-app↔CMS y expiración; la baja debe funcionar años después desde un email viejo. El token opaco es un bearer de un solo propósito, invalidable por rotación (RN-6), sin PII decodificable.

### 4.7 Fase 2 (diseñada, no implementada)

- Colección `newsletter-issues` (`subject`, `preheader`, `html`, `status: draft|scheduled|sending|sent`, `scheduledAt`, `stats`) + job por lotes contra ESP (Resend recomendado: `RESEND_API_KEY`, dominio `news.portaqr.cl` con SPF/DKIM, webhooks `bounced/complained` → `status: bounced`).
- Remitente bulk dedicado (`newsletter@news.portaqr.cl`), nunca el `EMAIL_FROM` transaccional.
- Segmentación mínima (`status=subscribed` + `source`) y export CSV desde admin.
- Criterio de entrada: Fase 1 en producción + dominio verificado en el ESP.

---

## 5. Mockups / Referencias

- **Signup**: bajo `TermsCheckbox`, nuevo `NewsletterCheckbox` (unchecked): "Quiero recibir la newsletter de Porta QR con novedades y tips (puedo darme de baja cuando quiera). Ver [política de privacidad](/privacidad#newsletter)." — no bloquea "Crear Cuenta".
- **Sección** (`NewsletterSection`, home/blog/`/newsletter`): tarjeta con título + descripción + email (+ nombre) + checkbox + botón "Suscribirme" + microcopy "Baja en 1 clic" → éxito: "Revisa tu correo para confirmar." (sin presencia en el footer).
- **Blog**: tarjeta al final del artículo: título "Recibe tips de QR en tu correo", `name?` + email + checkbox + botón.
- **Baja**: `/newsletter/baja?token=...` → "Te diste de baja correctamente. [Volver a suscribirme]" + motivo opcional; sin token → input email + "Enviarme el link de baja".
- **Emails**: header logo Porta QR (PNG, patrón SPEC-019 RF-1.2) + botón CTA azul `#1E3A8A` + footer con baja (RF-11) + headers RF-12.
- **Referencias**: `backend-portaqr/src/templateEmail/registerEmail.ejs` (línea gráfica), `shared/email/email.service.ts` (patrón best-effort + kill-switch), SPEC-006 (honeypot+throttle contacto), SPEC-020 §4.3 (proxy auth + whitelist), `qr-cms/src/collections/*` (patrón colección+hooks+specs).

---

## 6. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| Fuente de verdad CMS vs backend | Equipo contenido autónomo; admin listo | 2 BDs, consistencia eventual | ✅ CMS (ADR-030.1) |
| Sync backend vs dual-write frontend | Robusto, secreto en servidor, reintentable | 1 servicio + 2 env vars nuevas | ✅ Backend (ADR-030.2) |
| Doble opt-in global vs mixto | Máxima prueba de consentimiento | Fricción extra en signup (email ya verificado) | ✅ Mixto (ADR-030.3) |
| Envío confirmación desde CMS vs backend | Cohesión con el dominio newsletter | Duplica ~50 líneas SMTP | ✅ CMS (ADR-030.4) |
| Token baja opaco vs JWT | Sin expiración, revocable, simple | Bearer irreversible si se filtra (mitigado con rotación) | ✅ Opaco (ADR-030.5) |
| SMTP Gmail para bulk vs ESP | Cero costo hoy | Límites, spam, sin bounces | ❌ ESP en Fase 2 (RN-9) |
| Guardar IP como prueba vs minimización | Prueba forense fuerte | PII extra, retención, riesgo | ❌ Minimización (RN-8) |
| Checkbox premarcado vs explícito | +conversión | Ilegal (consentimiento no libre) + mala entregabilidad | ❌ Explícito (RN-3) |

---

## 7. Producción (variables y verificación)

1. **Railway `qr-cms`**: `NEWSLETTER_API_KEY=<32 hex>`, `NEWSLETTER_PUBLIC_URL=https://portaqr.cl`, `NEWSLETTER_DOUBLE_OPT_IN=true`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` (transaccional CMS, ej. `hola@portaqr.cl`), `DATABASE_URL` sin cambios. **Railway `backend-portaqr`**: `CMS_BASE_URL=https://cms.portaqr.cl`, `CMS_NEWSLETTER_API_KEY=<mismo valor>`, `NEWSLETTER_SYNC_ENABLED=true`. **Vercel/Railway `qr-app`**: sin vars nuevas (proxy).
2. **Secretos**: generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; nunca commitear `.env`.
3. Verificación post-deploy: signup con opt-in → doc en CMS (`source: signup`); subscribe footer → `pending` → confirm → `subscribed`; link baja del correo → `unsubscribed`; Gmail muestra "Darse de baja"; CMS caído → signup `201` + warn.

> [!note] Verificación post-despliegue
> 1. Signup con checkbox → suscriptor `subscribed` en admin CMS con `userId`.
> 2. Formulario footer con email nuevo → `pending` + correo confirmación.
> 3. Confirm → `subscribed` + bienvenida con footer de baja.
> 4. Clic baja (link + one-click de Gmail) → `unsubscribed` sin login.
> 5. Re-suscripción → token nuevo (link viejo 404).
> 6. Signup con CMS apagado → cuenta OK + `newsletter_sync_failed` en logs.

---

## 8. Criterios de calidad

- **qr-cms**: vitest colección (transiciones, normalización, unicidad, rotación) + routes (honeypot, consent, idempotencia, auth sync, token inválido) + mail (headers + footer). `tsc --noEmit` + `lint` limpios.
- **backend**: jest `newsletter-sync.service` (no-op sin opt-in, POST con key, timeout, kill-switch, no-throw) + `create/update-user` (CA-03/04/05/09). Sin regresión suites `users/auth/email`.
- **qr-app**: jest `NewsletterSubscribe`/`NewsletterSection` (consent requerido, honeypot, estados, sources), `SignUpForm` (opt-in en payload), página baja (token/no-token), proxies (forward + throttle). `tsc` + `lint` limpios.
- **E2E** (`e2e-tests-portaqr`, Playwright): alta en sección home/landing → confirmación (bandeja fake) → baja por token; signup con opt-in → visible en CMS (stub API key en entorno E2E).
- **Accesibilidad/legal**: checkbox con label real, foco visible, mensajes `role=status`; cláusula `/privacidad#newsletter` publicada antes del deploy.

## 9. Tareas

- [ ] Tareas registradas en `docs/tareas/SPEC-030-tareas.json` (formato Taskmaster).
- [ ] Ramas `feat/spec-030-newsletter-*` (una por repo afectado: `qr-cms`, `backend-portaqr`, `qr-app`).

## 10. Referencias

- [[SPEC-006]] — anti-spam contacto (honeypot + throttle reutilizados en endpoints públicos).
- [[SPEC-019]] — patrón EmailService best-effort + kill-switch + línea gráfica + `cid` (base de RF-11/RF-12).
- [[SPEC-020]] — signup simplificado + proxy auth + whitelist + onboarding (punto de enganche RF-7).
- [[SPEC-023-blog-payload-cms-isr]] — colecciones, hooks y admin Payload (base de RF-1).
- `qr-cms/src/payload.config.ts` — colecciones actuales (brecha verificada).
- `qr-app/src/components/SignUpForm/index.tsx` + `app/api/auth/signup/route.ts` — ausencia de opt-in (brecha verificada).
- RFC 2369 / 8058 (`List-Unsubscribe(-Post)`) + buenas prácticas entregabilidad (SPF/DKIM/DMARC para Fase 2).
- Ley 19.628 (datos personales) y 19.496 art. 28 B (comunicaciones no solicitadas) — fundamento de RN-3/RN-5/RN-8.

---

## 11. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-09-03 | **SPEC creada** (borrador). Investigación verificada: grep `newsletter\|suscrib\|...` = 0 resultados en `desarrollo-qr`; `payload.config.ts` sin colección; `SignUpForm`/proxy/DTO sin opt-in; `modules/users` sin campo marketing; `Footer` sin formulario; emails sin `List-Unsubscribe`. Diseño: CMS fuente de verdad + sync backend best-effort + doble opt-in público + baja 1-clic + Fase 2 ESP. |
| 2026-09-03 | **Ajuste usuario**: suscripción fuera del footer. Nueva `NewsletterSection` reutilizable (home entre `Features`/`CtaSection`, blog, `/newsletter`); eliminado el origen `footer` del enum (CMS+qr-app+spec+E2E). Commits: qr-cms `83d258b`, qr-app `fa4954c`, e2e `b564a96`. Suites verdes (cms 113/113, qr-app 77/77). |
| 2026-09-03 | **Implementada** en ramas `feat/spec-030-newsletter` (qr-cms: `568f41b` colección+helpers, `266f727` endpoints+aceptación, `9321e91` baja+sync; backend: `20a4715` sync best-effort, `bd1a018` fixtures; qr-app: `502e598` opt-in signup/onboarding, `2a7bb0c` NewsletterSubscribe+proxies+landing, `ed1377f` baja, `f9515a6` legal; e2e: `79e27c8` POM+3 specs). Validación: qr-cms vitest 113/113, backend jest 159 suites/1343 tests, qr-app jest 76 suites/556 tests, e2e tsc limpio. Pre-existentes no tocados: `scripts/fix-demo-layouts.ts` (TS1117), lint en `forgot-password.usecase.spec.ts`/`users.controller.ts`. E2E browser pendiente de stack con ramas spec (CI/staging). |
| 2026-09-03 | **Auditoría línea gráfica** (requerimiento usuario): leídos `registerEmail.ejs` + `welcomeEmail.ejs` + `passwordReset.ejs` + `qrActivated.ejs` en `backend-portaqr/src/templateEmail/`. Base de copia fijada en **`welcomeEmail.ejs`** (logo PNG remoto linkeado + solo modo claro); prohibido copiar `registerEmail.ejs` (sin logo + con dark mode). Tokens exactos volcados en RF-11 (paleta, botón, footer, responsive, estructura `table[role=presentation]`). |
| 2026-09-04 | **Fix timing verificado** (bug usuario: CMS mostraba `subscribed` antes de `/verify-email`): backend `feat/spec-030-sync-on-verify` — create difiere sync salvo Google verificado, `VerifyEmailUseCase` sincroniza al verificar (opt-in pendiente), update no toca CMS sin email verificado. Jest 159 suites/1348 tests. |
| 2026-09-04 | **Fix honeypot autofill** (bug usuario: éxito falso sin correo ni doc): el input text trampa lo rellenaba el autofill de Chrome → `fix/honeypot-checkbox` lo cambia por checkbox oculto (ningún autofill/humano lo marca) + CMS acepta `honeypot` boolean. |
