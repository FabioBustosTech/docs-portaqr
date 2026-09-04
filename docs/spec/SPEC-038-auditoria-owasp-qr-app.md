---
title: "SPEC-038: Auditoría OWASP qr-app (frontend Next.js BFF)"
date: 2026-09-04
tags:
  - spec
  - seguridad
  - frontend
  - owasp
  - nextjs
  - bff
status: borrador
aliases:
  - SPEC-038
  - Auditoría OWASP qr-app
---

# SPEC-038: Auditoría OWASP `qr-app`

> [!abstract] Decisión clave
> Primera auditoría OWASP (2026-09-04) sobre `qr-app` (Next.js App Router como BFF proxy hacia `backend-portaqr`, puerto 3000). La base está sólida (JWT en cookies `httpOnly + SameSite=Lax`, tokens nunca en body/query/`localStorage`, `signup` con whitelist de 3 campos, `POST /api/users` y `admin/*` con `adminGuard`, errores genéricos, `youtube-nocookie` + `sandbox`, renderer Lexical sin `dangerouslySetInnerHTML` en blog). Quedan **6 altos + 7 medios + 5 bajos** por decidir caso por caso. Fuente: revisión estática de `src/app/api/**/route.ts`, `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/jwt.ts`, `next.config.js`, componentes del blog.

> [!info] Metadatos
> - **Estado:** Borrador (revisión caso por caso)
> - **Fecha:** 2026-09-04
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Relacionado:** [[SPEC-036-auditoria-owasp-ronda-2]], [[SPEC-037-auditoria-owasp-qr-cms]], [[SPEC-020-registro-simplificado-google-oauth]], [[SPEC-011-reintentos-rate-limiting-validacion-qr]]
> - **Metodología:** revisión estática (sin ejecución, sin `pnpm audit`). Referencia OWASP Top 10 2021.

## 1. Objetivo

Decidir caso por caso qué hallazgos se corrigen, cuáles se aceptan como riesgo y cuáles van a backlog. Cada caso tiene `Estado: por revisar` y `Decisión: pendiente` hasta que lo cerremos juntos.

## 2. Modelo de amenaza (acordado)

- **El navegador nunca habla con el backend.** Habla con `/api/*` (route handlers server-side), que reenvían a `NEXT_PUBLIC_BFF_URL` con el JWT de la cookie httpOnly (`access_token`/`refresh_token`, `SameSite=Lax`). Verificación con `jose` + RS256 (`lib/auth.ts`, `lib/jwt.ts`). `proxy.ts`: protege páginas, **excluye `api`** del matcher → toda la protección API recae en checks por-route.
- **Consecuencia:** cada `route.ts` sin `getAuthUser()`/`adminGuard` es un bypass real en capa BFF (aunque el backend re-valide, se pierde defensa en profundidad y el BFF expone oráculos/errores).
- **Confianza actual:** `x-forwarded-for` se acepta sin proxy confiable; `NEXT_PUBLIC_*` se embebe en el bundle cliente; throttle invocable solo si el backend lo aplica (el BFF no throttlea propio).

## 3. Casos

### H1 — `x-request-info` refleja cookies/Authorization al cliente (A05 + A01) 🔴

- **Evidencia:** `src/proxy.ts:152-154` (`request.headers.forEach` copia **todos** los headers, incluidos `cookie`/`authorization`) + `src/proxy.ts:170` (`response.headers.set('x-request-info', JSON.stringify(requestInfo))` con `headers`, `queryParams`, `url`, `userId/userEmail/userRole`).
- **Impacto:** fuga de credenciales + PII en cada navegación (logs de CDN/proxy lo persisten), bloat de headers, viola minimización.
- **Propuesta:** eliminar el header o reducir a campos no sensibles (nunca `cookie`/`authorization`, allowlist de headers); test: navegar autenticado → respuesta sin `x-request-info` o sin claves sensibles.
- **Estado:** por revisar
- **Decisión:** pendiente

### H2 — Bypass de admin por `&&` en vez de `||` (A01) 🔴

- **Evidencia:** `src/app/api/statistics/system/route.ts:21` y `src/app/api/plan/route.ts:69`: `if (!auth?.id && auth?.role !== 'admin') return 401`. Si `auth.id` existe la condición es `false` aunque `role !== 'admin'`.
- **Impacto:** cualquier usuario autenticado lee `/statistics/system` (métricas globales) y crea planes (`POST /plan`) — integridad de catálogo comprometida.
- **Propuesta:** `if (!auth?.id || auth?.role !== 'admin')`; test de regresión: usuario no-admin → 401/403 en ambos.
- **Estado:** por revisar
- **Decisión:** pendiente

### H3 — Mutaciones y rutas admin sin sesión en capa BFF (A01) 🔴

- **Evidencia:** `POST/PATCH/DELETE src/app/api/qr/route.ts:69,103,132` sin `getAuthUser` (solo `GET` lo exige); `PATCH src/app/api/qr/[id]/route.ts:68` sin sesión ni owner-check; `POST src/app/api/pet-tag/admin/generate/route.ts:19` y `GET .../admin/reserved/route.ts:15` sin `adminGuard`; `POST src/app/api/chat/route.ts:5` sin auth ni rate-limit (body arbitrario a webhook externo); `POST src/app/api/webpay/refund/route.ts:22` solo sesión, body íntegro, sin rol/owner; `qr-activate` (`route.ts:23,70`, `[id]/route.ts:24,57,94`), `webpay/create|status|transaction|return`, `scan/[id]/stats`, `statistics/user/[id]` solo sesión sin atar recurso a `auth.id`.
- **Impacto:** escritura de QR anónima, priv-esc admin, spam al webhook pagado, refunds ajenos, IDOR en activaciones/stats/transacciones si el backend no re-valida.
- **Propuesta:** `getAuthUser()` + `adminGuardError()` donde toca + atar `buyOrder/token_ws/idQr` a `auth.id` o delegación explícita documentada; `chat` con auth o captcha + rate-limit + schema; test: anónimo → 401 en cada mutación/admin.
- **Estado:** por revisar
- **Decisión:** pendiente

### H4 — Mass-assignment: bodies reenviados íntegros sin schema (A03 + A01) 🔴

- **Evidencia:** `PATCH src/app/api/users/[id]/route.ts:60-74` y `POST src/app/api/users/route.ts:63-72` (`JSON.stringify(body)` crudo, sin `zod`/whitelist — el `GET/PATCH` sí chequea owner/admin pero el cuerpo pasa `role/isEmailVerified/passwordHash/provider`); `POST/PATCH src/app/api/qr/route.ts:56-99` sin schema (`page/limit/search` sin coerción, `?id=` sin formato ObjectId).
- **Impacto:** escalada a admin / pre-hijack si el backend no tiene `forbidNonWhitelisted`; persistencia de `type/urlList` malformado; DoS lógico.
- **Propuesta:** whitelist por route (patrón `signup` que sí filtra 3 campos) + `zod` en BFF como defensa en profundidad; test: `PATCH /users/:id {role:'admin'}` → 400/ignorado.
- **Estado:** por revisar
- **Decisión:** pendiente

### H5 — Secretos reales commiteados (A02) 🔴

- **Evidencia:** `desarrollo-qr/qr-app/.env:21`, `qrApp.env`, `.env copy*`: `REVALIDATE_SECRET=df7a...`, `NEXTAUTH_SECRET=c9a0...`, `JWT_PUBLIC_KEY="-----BEGIN..."` en repo.
- **Impacto:** si el repo es/será público: bypass de `POST /api/revalidate` (defacement SEO, envenenamiento de caché ISR).
- **Propuesta:** rotar `REVALIDATE_SECRET` (+ `NEXTAUTH_SECRET` si se usa), purgar del historial, verificar `.gitignore` cubre `.env*`/`qrApp.env`; test: boot sin env falla claro, con env nuevo el viejo → 401.
- **Estado:** por revisar
- **Decisión:** pendiente

### H6 — `Set-Cookie` fusionado con `join(',')` rompe `oauth_state` (A01) 🔴

- **Evidencia:** `src/app/api/auth/google/route.ts:40-42` (`getSetCookie() ?? []` → `set('set-cookie', join(','))`; la coma de `Expires=Wed, ...` corrompe el parseo, fusiona `oauth_state`+`oauth_mode`).
- **Impacto:** cookie anti-CSRF del flujo OAuth intermitente → login Google roto o fallback inseguro (DoS funcional / CSRF).
- **Propuesta:** reenviar cada `Set-Cookie` por separado (múltiples `append`); test: flujo OAuth conserva ambas cookies íntegras.
- **Estado:** por revisar
- **Decisión:** pendiente

### M1 — Sin security headers (A05) 🟡

- **Evidencia:** `next.config.js:1-8` sin `headers()` ni `poweredByHeader:false`; `src/proxy.ts:162-174` solo setea `x-request-info`/`x-client-ip`, ningún `CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy`.
- **Propuesta:** `poweredByHeader:false` + `headers()` con `CSP/HSTS/SAMEORIGIN/nosniff/referrer/Permissions-Policy`; verificar build y que el blog/CMS embebido no rompa; test: respuesta incluye headers.
- **Estado:** por revisar
- **Decisión:** pendiente

### M2 — Enumeración + path-injection en checks (A07 + A03) 🟡

- **Evidencia:** `GET src/app/api/auth/check-email/[email]/route.ts:10` y `check-username/[username]/route.ts:10` públicos sin sesión/rate-limit, `params.*` interpolado **sin `encodeURIComponent`**; `forgot-password/route.ts:11-28` propaga `message/status` del backend; `google/callback/route.ts:40-41` distingue `401 → /signup?error=google-no-account`.
- **Impacto:** oráculo de existencia (cosecha para stuffing/phishing); `email=a/b?x=` rompe path/query hacia el backend.
- **Propuesta:** `encodeURIComponent` + rate-limit en BFF; respuesta genérica (patrón SPEC-036 M1a) o checks solo-autenticados; test: email existente/inexistente indistinguibles + `a/b` no altera path.
- **Estado:** por revisar
- **Decisión:** pendiente

### M3 — XSS almacenado vía CMS (href/avatar sin whitelist) (A03) 🟡

- **Evidencia:** `src/components/blog/BlogRichText.tsx:107-115` (`href` de Lexical sin whitelist `http(s):/mailto:/tel:`, sin bloqueo `javascript:/data:/vbscript:`); mismo patrón en `BlogCta.tsx:13,19`, `author.url` en `PostMeta.tsx`/`AuthorCard.tsx`; `authorAvatar → <img src>` sin validar protocolo/host; `BlogImage.tsx` (`<img>` nativo con URL CMS, sin allowlist de host/`referrerPolicy`).
- **Impacto:** editor/import comprometido inserta `javascript:` → XSS/phishing con marca; tracking exfiltration.
- **Propuesta:** `sanitizeIssueUrl`-like (solo `http(s)://`, `mailto:`, `tel:`, paths internos); sin enlace/imagen si inválido; test: `javascript:alert(1)` → sin `<a>`.
- **Estado:** por revisar
- **Decisión:** pendiente

### M4 — Query-injection / SSRF condicional (A03 + A10) 🟡

- **Evidencia:** interpolación sin `encodeURIComponent` ni validación: `users/[id]/route.ts:31`, `qr/[id]/route.ts:44`, `scan/[id]/stats/route.ts:29`, `pet-tag/[idQr]/image/route.ts:39`, `qr-free-generation/[id]/route.ts:16`, `webpay/return/route.ts:30` (`token_ws`), `qr-activate/route.ts:38`, `plan/route.ts:44`, `reverse-geocode/route.ts:32` (`lat/lon` sin regex/rango hacia Geoapify); `chat/route.ts:14-28` (`fetch(externalWebhookUrl)` sin schema/límite/timeout/allowlist); `qr-free-generation` y `reverse-geocode` públicos sin rate-limit en BFF.
- **Impacto:** `token_ws=abc&amount=1` / `search=&role=admin`, abuso de cuota Geoapify/webhook, DoS por body gigante.
- **Propuesta:** `encodeURIComponent` + validación (`lat/lon` numérico con rango, `token_ws` charset, `id` ObjectId/UUID) + `AbortSignal.timeout` + límite de tamaño + throttle BFF en públicos; test: `&`/`?` en params no contamina query.
- **Estado:** por revisar
- **Decisión:** pendiente

### M5 — Claves y topología expuestas + logs con PII (A02 + A09) 🟡

- **Evidencia:** `src/services/qr.service.ts:340` (`NEXT_PUBLIC_ABSTRACT_API_KEY` inlineada en bundle → cuota robable en DevTools); `NEXT_PUBLIC_BFF_URL/CMS_HOST/CMS_PORT/R2_HOST/APP_URL` en ~30 routes embeben `http://backend-portaqr:3004`, `localhost` en cliente (usar `BFF_URL`/`CMS_URL` server-only como `blog.service.ts:44`); sin `sanitizeForLog` (0 resultados) con 100+ `console.log`: `webpay/create/route.ts:22,37` (body con `amount/buyOrder/sessionId`), `reverse-geocode/route.ts:14-15,33,37-39` (coords + `error.message` al cliente), `chat/route.ts:7,15,26` (conversaciones + webhook URL), `pet-tag.service.ts:35-45`.
- **Propuesta:** mover Abstract a route server-side; renombrar a env server-only; quitar logs PII/financieros/ubicación, errores genéricos; test: bundle sin `api_key`, respuesta de error sin `error.message`.
- **Estado:** por revisar
- **Decisión:** pendiente

### M6 — Sesión/JWT sin defensa en profundidad (A07 + A02) 🟡

- **Evidencia:** `src/lib/jwt.ts:37-45` (`jwtVerify` solo `RS256`, sin `issuer/audience/clockTolerance`, `catch → null`, `getAuthUser` solo `payload?.sub`, sin `tokenVersion/jti`); `src/lib/jwt-public-key.ts:21-29` (fallback PEM hardcodeado); `src/lib/auth.ts:59-72` (`secure: isProd` → HTTP en dev, sin prefijo `__Host-`); `clearAuthCookies:76-80` sin repetir `path/secure/sameSite`; `refresh/route.ts:11,28` + `logout/route.ts:11-30` (logout local aunque el backend falle); `proxy.ts:178-187` (matcher excluye `api`); `proxy.ts:114-116` (IP de `x-forwarded-for` sin validar ni proxies confiables).
- **Propuesta:** `issuer/audience` + `tokenVersion` local, `__Host-` + `Secure` siempre en prod, `clear` simétrico, logout best-effort documentado, validar IP con formato + lista de proxies; test: token de otro emisor → null, logout limpia en todos los paths.
- **Estado:** por revisar
- **Decisión:** pendiente

### M7 — CSRF: solo `SameSite=Lax`, sin `Origin` check (A01) 🟡

- **Evidencia:** `src/lib/auth.ts:53-70` (cookies `httpOnly + Lax`, sin token anti-CSRF ni `Origin/Referer` en `POST/PATCH/DELETE`: `auth/*`, `qr/*`, `users/*`, `webpay/create`, `pet-tag/*`, `qr-activate/*`); `secure=false` en dev.
- **Impacto:** `Lax` bloquea POST cross-site modernos, pero quedan top-level `GET` mutacionales (`/api/auth/google`, `/api/qr/[id]/redirect`), navegadores viejos, subdominio comprometido.
- **Propuesta:** check `Origin/Referer` en mutaciones sensibles (`webpay/create`, `users PATCH`, `qr DELETE`); test: POST cross-origin sin `Origin` válido → 403.
- **Estado:** por revisar
- **Decisión:** pendiente

### B1 — Open redirect post-logout / OAuth / Webpay-config 🟢

- **Evidencia:** `src/contexts/AuthContext.tsx:136-144` (`signOut(callbackUrl='/login')` → `window.location.href = callbackUrl` sin validar); `google/route.ts:39` (`redirect(location)` sin allowlist, depende del backend); `webpay/create/route.ts:35-38` (`normalizedAppUrl` con downgrade a `http://`, `returnPath` concatenado sin exigir prefijo `/`; positivo: `returnUrl` no viene del body).
- **Propuesta:** allowlist de paths internos (`/…`) para `callbackUrl`, validar `location` con mismo origen, exigir `returnPath` con prefijo `/` y `https` en prod; resto (`proxy.ts:97-109`, callbacks con paths fijos) queda como patrón sano.
- **Estado:** por revisar
- **Decisión:** pendiente (endurecer helpers, sin cambiar flujos)

### B2 — `revalidate` con secreto simple 🟢

- **Evidencia:** `src/app/api/revalidate/route.ts:20-23` (`secret !== process.env.REVALIDATE_SECRET → 401` correcto, pero comparación no timing-safe y sin longitud mínima; si ambos vacíos `"" === ""` haría bypass).
- **Propuesta:** fail-fast si falta el env + exigir entropía mínima documentada en `.env.example`; test: sin env → 500 claro, secreto viejo → 401.
- **Estado:** por revisar
- **Decisión:** pendiente

### B3 — `dangerouslySetInnerHTML` acotado + YouTube 🟢

- **Evidencia:** único en runtime `src/app/blog/[slug]/page.tsx:181` (`buildJsonLd` con `replace(/</g,'\\u003c')`, pero `structuredData` crudo del CMS); `YouTubeEmbed.tsx:14-18` (`youtube-nocookie` + `sandbox` correctos, verificar `extractYouTubeId` con `^[A-Za-z0-9_-]{11}$`).
- **Propuesta:** mantener mitigación + test con `</script>` en `structuredData`; fijar regex de `videoId`; test: payload no rompe el JSON-LD.
- **Estado:** por revisar
- **Decisión:** pendiente

### B4 — Carrito en cookies sin flags + dependencias sin audit 🟢

- **Evidencia:** `src/app/api/cart/route.ts:9,27,70` (`GET` sin sesión devuelve `[]`; `cookieStore.set(path:'/', maxAge)` sin `httpOnly/secure/sameSite` para `cart_items_<email>`; `cart-admin` exige admin en `POST` pero `PATCH/DELETE/GET` solo `email`); `package.json:18-30` (`next ^16.3.0`, `react ^19.2.8`, `jose ^6.2.8`, `sharp ^0.34.2`, `html2canvas ^1.4.1` con `^`, sin `pnpm audit` en scripts).
- **Propuesta:** `httpOnly + Secure + SameSite=Lax` en carrito (o mover a server), unificar gates de `cart-admin`, `pnpm audit --prod` + fijar `sharp` + revisar `html2canvas`; test: cookie de carrito no legible por JS, audit sin altos.
- **Estado:** por revisar
- **Decisión:** pendiente

### B5 — Controles positivos (no tocar) 🟢

- JWT en `httpOnly + SameSite=Lax`, nunca en body/`localStorage` (`login/route.ts:72`, `auth.ts:53-70`, `google/callback:52`); `signup` con whitelist (`signup/route.ts:10-15`); `POST /api/users` + `admin/qr` con `adminGuard`; `users/[id]` owner-or-admin en `PATCH/DELETE`; blog sin `dangerouslySetInnerHTML` (renderer Lexical); errores genéricos excepto `reverse-geocode:65` (ver M5).

## 4. Criterios de aceptación por caso

Cada caso cerrado debe terminar con: Decisión (corregir / aceptar riesgo / backlog) + severidad final + tarea en `docs/tareas/SPEC-038-tareas.json` si se corrige + test de regresión si aplica (H1, H2, H3, H4, H6, M2, M3).

## 5. Mapa de superficie (verificado 2026-09-04)

| Ruta / área | Acceso | Estado |
|---|---|---|
| `POST/PATCH/DELETE /api/qr`, `PATCH /api/qr/[id]` | sin sesión en BFF | 🔴 H3: mutaciones abiertas |
| `pet-tag/admin/*`, `POST /api/chat`, `POST /webpay/refund` | sin guard/owner | 🔴 H3: priv-esc / abuso / financiero |
| `GET /statistics/system`, `POST /plan` | sesión cualquiera (`&&`) | 🔴 H2: bypass admin |
| `PATCH /api/users/[id]`, `POST /api/users`, `POST/PATCH /api/qr` | sesión/admin pero body crudo | 🔴 H4: mass-assignment |
| `/.env`, `qrApp.env` | commiteados | 🔴 H5: rotar secretos |
| `GET /api/auth/google` → `callback` | `Set-Cookie join(',')` | 🔴 H6: rompe CSRF OAuth |
| `check-email/check-username`, `forgot-password` | públicos passthrough | 🟡 M2: enumeración + path-injection |
| `BlogRichText/BlogCta/PostMeta/AuthorCard/BlogImage` | contenido CMS | 🟡 M3: XSS almacenado |
| `reverse-geocode`, `chat`, `qr-free-generation`, `webpay/return` | públicos / interpolados | 🟡 M4: query-injection / SSRF / cuota |
| `NEXT_PUBLIC_ABSTRACT_API_KEY`, logs PII | cliente / Railway logs | 🟡 M5: exposición + A09 |
| `proxy.ts` (páginas sí, `api` no), JWT sin `iss/aud` | parcial | 🟡 M6/M7: sesión + CSRF |
| `signOut(callbackUrl)`, `revalidate`, `blog/[slug]` JSON-LD, `cart_*` | cliente / ISR | 🟢 B1–B4: endurecer helpers |

## 6. Changelog de revisión

| Fecha | Caso | Movimiento |
|---|---|---|
| 2026-09-04 | SPEC | Creación de SPEC-038 (borrador) + `docs/tareas/SPEC-038-tareas.json` (12 tareas pendientes). Fuente: revisión estática `src/app/api/**/route.ts`, `proxy.ts`, `lib/auth.ts`, `lib/jwt.ts`, `next.config.js`, blog. |

## 7. Trade-offs

- Checks por-route vs. guard global en `proxy.ts`: el matcher excluye `api` por diseño Next; un guard global obligaría a incluir `api` y clasificar públicos intencionales (`redirect`, `scan/stats`, `qr-free-generation`, `pet-tag public|activate`, `mail/contact`) — más robusto pero toca ~60 routes.
- Validación `zod` en BFF vs. solo backend: duplica schemas pero da defensa en profundidad y errores 400 tempranos sin RTT al backend.
- Quitar `x-request-info` vs. reducirlo: el header ayuda a debug, pero con PII/cookies es fuga; alternativa es log server-side sin reflejar al cliente.
- `SameSite=Lax` + `Origin` check vs. token anti-CSRF: suficiente para la mayoría sin fricción UX; token CSRF es más fuerte pero exige doble-submit en cada mutación.
