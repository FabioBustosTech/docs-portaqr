---
title: "SPEC-006: Anti-spam y protección anti-bot del formulario de contacto"
date: 2026-08-09
tags:
  - spec
  - seguridad
  - frontend
  - formulario-contacto
  - captcha
  - cloudflare
  - rate-limiting
  - anti-spam
status: borrador
aliases:
  - SPEC-006
  - Anti-spam contacto
---

# SPEC-006: Anti-spam y protección anti-bot del formulario de contacto (`qr-app`)

> [!abstract] Decisión clave
> Proteger el envío del formulario de contacto (hoy conectado a `MailService` y con sanitización) contra **bots que envían correos en masa**, con una **defensa en capas** que NO depende del rate-limit por IP en la app (porque detrás de Cloudflare el servidor ve la IP de CF, no la del visitante). Se prioriza: **honeypot + tiempo mínimo de llenado** (sin terceros) → **Cloudflare Turnstile** (token-based, sin IP) → **rate-limit en el borde (WAF de Cloudflare)**.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-09
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Relacionado:** [[SPEC-004]] (react-doctor, donde se reconectó el envío)

---

## 1. Objetivo

Evitar que un bot envíe mensajes de contacto en masa (spam de correos) al endpoint `POST /api/mail/contact`, sin degradar la experiencia del usuario legítimo y **sin riesgo de auto-bloqueo** por leer la IP equivocada detrás de Cloudflare.

## 2. Contexto

### 2.1 Estado actual (2026-08-09)

- `ContactForm.tsx` era un **simulacro** (timeout + toast falso); se conectó a `MailService.sendContactForm()` → `POST /api/mail/contact` → BFF `:3001/mail/contact`.
- El route handler ya **sanitiza** (campos requeridos, longitudes máx 100/254/200/5000, email válido, `trim`) y rechaza **contenido peligroso** (`containsDangerousContent()` en `lib/validators.ts`): XSS (`<script>`, `onerror=`, `javascript:`), NoSQL (`$ne`, `$gt`, `$regex`…) y SQL (`' OR '1'='1`, `; DROP`, comentarios).
- Falta la capa **anti-bot**: hoy un script puede hacer `POST /api/mail/contact` en loop infinito.

### 2.2 El problema de la IP detrás de Cloudflare

```
Visitante (IP real 1.2.3.4) → Cloudflare (104.x.x.x) → Servidor ve 104.x.x.x
```

- Un rate-limit por IP **en la app** bloquearía la IP de Cloudflare → **auto-bloqueo de todos los usuarios** (incidente conocido).
- Si se necesita la IP real, se lee `CF-Connecting-IP` (cabecera que Cloudflare inyecta y sobreescribe — no falsificable desde afuera), con fallback a `X-Forwarded-For` (primer valor) y a la IP de socket en dev.
- El rate-limit por IP **en memoria** (Map) no es persistente entre instancias serverless → para producción robusta se requiere Redis o el rate-limit del borde.

## 3. Amenazas

| Amenaza | Impacto | Capa que la frena |
|---|---|---|
| Bot con loop de POSTs (misma IP) | Quema el correo / colapsa el BFF | Rate-limit WAF + Turnstile |
| Bot distribuido (IPs rotativas) | Idem | Turnstile (token-based) |
| Bot que llena el form al instante | Spam | Tiempo mínimo + honeypot |
| Bot que llena todos los campos | Spam | Honeypot + Turnstile |
| Payloads maliciosos (XSS/NoSQL/SQL) | Inyección | ✅ YA RESUELTO (sanitización) |

## 4. Solución propuesta — defensa en capas

### Capa 1 — Sin terceros (implementable ya, sin keys)

**a) Honeypot** — campo oculto en el formulario (`<input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true">`). Los bots lo rellenan; los humanos no lo ven. Si viene con valor → rechazo silencioso (200 falso, sin gastar BFF).

**b) Tiempo mínimo de llenado** — el frontend envía `formStartedAt` (timestamp del montaje del form); si el POST llega en < 3 segundos → 400/428. Los bots envían al instante.

**c) Límite por email** — máx. N envíos por dirección de correo en X minutos (Map en memoria; suficiente para esta capa).

### Capa 2 — Cloudflare Turnstile (token-based, sin IP)

- Widget invisible/managed en `ContactForm`.
- El frontend envía `cf-turnstile-token` en el POST.
- El route handler verifica el token contra `https://challenges.cloudflare.com/turnstile/v0/siteverify` (secret key del servidor).
- **Configurable por env vars** — si no hay keys, la app funciona sin CAPTCHA (dev):
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública, frontend)
  - `TURNSTILE_SECRET_KEY` (secreta, servidor)

### Capa 3 — Rate-limit en el borde (Cloudflare WAF)

- **No en la app.** En el panel de Cloudflare: regla de rate-limiting para `POST /api/mail/contact` (ej. 5 req/hora por IP del visitante — CF sí ve la IP real).
- Respuesta sugerida de CF: challenge (Turnstile) o bloqueo 429.

## 5. Flujo de integración (estado objetivo)

```
ContactForm (humano)
   │  monta form → formStartedAt
   │  Turnstile widget → token (si keys configuradas)
   ▼
POST /api/mail/contact  { nombre, email, asunto, mensaje, website?, formStartedAt?, cf-turnstile-token? }
   │
   ▼  Route handler (orden de validación):
   1. Honeypot: website con valor → 200 falso (sin procesar)
   2. Tiempo mínimo: <3s → 400
   3. Turnstile: token inválido/faltante (si keys) → 400
   4. Sanitización (YA existente): requeridos, longitudes, email, peligrosos → 400
   5. Rate-limit ligero por email (Map) → 429
   6. Enviar al BFF (timeout 10s)
```

## 6. Configuración

```env
# .env.local (qr-app)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=   # opcional — si vacío, sin CAPTCHA
TURNSTILE_SECRET_KEY=             # opcional — si vacío, sin verificación
```

| Variable | Dónde | Obligatoria |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Frontend (widget) | No (dev) / Sí (prod con Turnstile) |
| `TURNSTILE_SECRET_KEY` | Servidor (route handler) | No (dev) / Sí (prod con Turnstile) |

## 7. Criterios de aceptación

- [ ] Un POST con el campo honeypot lleno es rechazado silenciosamente (200 falso, sin llamada al BFF)
- [ ] Un POST en < 3 segundos desde el montaje es rechazado (400)
- [ ] Con keys de Turnstile configuradas: un POST sin token o con token inválido es rechazado (400)
- [ ] Sin keys de Turnstile: la app funciona sin CAPTCHA (dev sin fricción)
- [ ] El envío legítimo (humano, >3s, sin honeypot, token válido) llega al BFF
- [ ] La sanitización existente sigue intacta (los 4 payloads de ataque → 400)
- [ ] `tsc --noEmit` sin errores nuevos
- [ ] (Opcional) Regla de rate-limit documentada para el panel de Cloudflare WAF

## 8. No funcionales

- **Privacidad**: Turnstile no trackea al usuario (mejor que reCAPTCHA); honeypot/tiempo no recopilan nada.
- **UX**: ninguna capa debe mostrar captchas visuales en el flujo normal (Turnstile managed).
- **Rendimiento**: verificación de Turnstile + sanitización < 50ms extra.
- **Portabilidad**: si mañana se usa Google reCAPTCHA v3 o hCaptcha, el patrón es el mismo (token en el POST + verify server-side) — la Capa 1 sigue siendo válida sin cambios.

## 9. Trabajo futuro (backlog)

- [ ] Implementar Capa 1 (honeypot + tiempo mínimo + límite por email) — ~1h
- [ ] Crear cuenta/keys de Cloudflare Turnstile y conectar Capa 2 — ~2h (cuando el usuario las genere)
- [ ] Configurar regla de rate-limit en el panel de Cloudflare (Capa 3) — sin código
- [ ] Evaluar reCAPTCHA v3 como alternativa (mismo patrón de integración)
