---
title: "SPEC-011: Reintentos y rate limiting de la validación de QR (qr-app + backend-portaqr)"
date: 2026-08-09
updated: 2026-08-13
tags:
  - spec
  - seguridad
  - backend
  - frontend
  - rate-limiting
  - reintentos
  - validacion-qr
  - throttler
status: implementado
aliases:
  - SPEC-011
  - Reintentos rate limiting QR
---

# SPEC-011: Reintentos y rate limiting de la validación de QR (`qr-app` + `backend-portaqr`)

> [!abstract] Decisión clave
> Establecer una **política de reintentos** (frontend) y de **rate limiting en 3 capas** (route handler de Next → BFF → Cloudflare WAF) para el flujo público de validación de QR (`GET /qr/public/:id`, `POST /scan/stats`, `GET /qr/seo-idqr`). Los límites deben ser **generosos** (el escaneo legítimo de QR es alta frecuencia por naturaleza) y **configurables por env**, usando la IP real del visitante (`CF-Connecting-IP`) y no la del servidor Next que ve el BFF.

> [!info] Metadatos
> - **Estado:** Revisado (2026-08-13) — diagnóstico verificado contra código y producción (ver [[SPEC-011-reintentos-rate-limiting-validacion-qr#10. Changelog|§10 Changelog]])
> - **Fecha:** 2026-08-09 / **Última revisión:** 2026-08-13
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-app/` (reintentos + rate limit route handler) y `desarrollo-qr/backend-portaqr/` (rate limit BFF)
> - **Relacionado:** [[SPEC-008]] (Capa 4 throttler — **YA implementado**, no prerrequisito), [[SPEC-009]] (CA-09 throttler pet-tag activate + mitigación parcial de scan), [[SPEC-006]] (lección: IP real detrás de Cloudflare), [[SPEC-002]] (límite subidas list-image)

---

## 1. Objetivo

Definir:

1. **Cantidad de reintentos** que el frontend puede hacer al validar un QR (automáticos y manuales), con backoff exponencial y bloqueo temporal al agotarlos.
2. **Rate limiting** de los endpoints públicos de validación de QR en las 3 capas donde puede aplicarse, sin degradar la experiencia del escaneo legítimo.

## 2. Contexto

### 2.1 Flujo actual de validación de QR (verificado en código y en producción, 2026-08-13)

```
Visitante escanea QR físico
   │  abre https://portaqr.cl/qr/{idQr}
   ▼
qr-app/src/app/qr/[id]/page.tsx            (server component)
   │  generateMetadata() → qrService.getPublicRedirectUrl()  ← llamada 1
   │  QrRedirectPage()    → qrService.getPublicRedirectUrl() ← llamada 2
   │  (2 llamadas por vista; Next llama generateMetadata + page por separado)
   │  ambas van a siteURL/api/qr/{id}/redirect (route handler, mismo-origin)
   ▼
qr-app/src/app/api/qr/[id]/redirect/route.ts  (route handler Next, SIN validación de formato)
   │  fetch → {NEXT_PUBLIC_BFF_URL}/qr/public/{id}
   │  └─ PRODUCCIÓN: NEXT_PUBLIC_BFF_URL=http://backend-portaqr.railway.internal:3004
   │     (red privada de Railway — el BFF NO es accesible desde internet)
   ▼
backend-portaqr: GET /qr/public/:id  (@Public, JwtAuthGuard global con @Public())
   │  GetPublicQrUseCase: getById → si no existe → 404 "no encontrado"
   │                        si !active → 404 "inactivo"  (ambos 404: correcto anti-enumeración)
   ▼
QrRedirectClient.tsx (cliente)
   │  prompt geolocalización → POST /scan/stats (@Public) → redirige o renderiza contenido
   │  si falla stats → console.error (sin reintento, correcto: evita duplicados)
   │  si error de carga/render → ErrorScreen con botón "Intentar de nuevo"
   │      → window.location.reload()  ← REINTENTO ILIMITADO, sin contador ni bloqueo
```

### 2.2 Topología de producción verificada (2026-08-13, empíricamente)

```
Internet:  Visitante ──► Cloudflare (proxy ACTIVO) ──► portaqr.cl = qr-app (Railway edge mia1)
                                                              │
Red privada Railway:  qr-app ──► http://backend-portaqr.railway.internal:3004  (BFF)
                                                              │
                                                 Mongo (solo dentro de la red)
```

Evidencia recogida (requests reales + navegador + DNS):

| Verificación | Resultado | Fecha |
|---|---|---|
| DNS `portaqr.cl` | IPs 104.21.23.202/172.67.213.60 + NS cloudflare → **proxy Cloudflare activo** | 2026-08-13 |
| Headers `https://portaqr.cl` | `server: cloudflare`, `CF-RAY`, `x-railway-request-id`, `x-powered-by: Next.js`, `cf-cache-status: DYNAMIC` | 2026-08-13 |
| Header `x-request-info` (Railway edge) | **`cf-connecting-ip` y `x-real-ip` con la IP real del visitante llegan a la app** → la Capa A es factible sin trucos | 2026-08-13 |
| DNS `backend-portaqr.railway.internal` | **NO resuelve públicamente** (`Could not resolve host`) → red privada real | 2026-08-13 |
| `https://backend-portaqr.up.railway.app` | 404 `x-railway-fallback: true` → dominio registrado **sin servicio público** (residual, desregistrar) | 2026-08-13 |
| 25 requests a `/api/qr/seo-idqr` (route handler) | **25× 200, cero 429** → el throttler del BFF en prod es **inerte** (sin envs `THROTTLE_*` → default `ttl=60ms` → ventana que expira al instante) | 2026-08-13 |
| QR real vía route handler | 200 con JSON completo del BFF (incluye `listImageUrl` R2) → flujo BFF vivo | 2026-08-13 |
| Navegador en `portaqr.cl/qr/{idReal}` | Página 200 ✓; `POST /api/auth/refresh` **401 en cada visita** (ruido); `GET ipapi.co/json` (IP del visitante sale a tercero); `POST /api/scan/stats` 200 ✓; `POST /cdn-cgi/rum` (CF Web Analytics); consola: **errores Facebook SDK en loop** ("App ID is not configured") | 2026-08-13 |
| Sitemap `https://portaqr.cl/sitemap.xml` | **Solo lista la home** (75 chars) — pese a que `/api/qr/seo-idqr` devuelve 24 IDs reales → los QRs no se indexan por sitemap (revisar `sitemap.ts`) | 2026-08-13 |

### 2.3 Hallazgos de la revisión (actualizado 2026-08-13)

| # | Hallazgo | Severidad | Ubicación |
|---|---|---|---|
| V1 | ~~Cero rate limiting en backend-portaqr~~ → **CORREGIDO**: el throttler global de SPEC-008 H4 **SÍ está implementado** (ThrottlerModule + ThrottlerGuard como APP_GUARD), pero **sin envs `THROTTLE_*` en el panel de Railway corre inerte** (default `ttl=60` ms en v6 → ventana que expira al instante) → **hoy no hay protección efectiva** | 🔴 Alta | `app.module.ts:30-41,65` |
| V2 | **Cero rate limiting** en qr-app: sin `middleware.ts`, route handlers sin límites | 🔴 Alta | `qr-app` (raíz), `api/qr/[id]/redirect/route.ts` |
| V3 | **Reintentos manuales ilimitados**: `ErrorScreen` → `window.location.reload()`; cada reload = 2 nuevas llamadas al BFF | 🟠 Media | `QrRedirectClient.tsx:205,213` |
| V4 | **Sin reintentos automáticos** (ni backoff): 1 solo intento por carga server-side; un 5xx transitorio del BFF = 404/error definitivo para el visitante | 🟡 Media | `qr/[id]/page.tsx:72-105`, route handler |
| V5 | **`GET /qr/seo-idqr` público sin límite**: expone los últimos 500 IDs activos (24 en prod hoy) → enumeración trivial de QRs válidos. Además **el sitemap no lo consume** (ver §2.2) → revisar quién lo llama | 🟠 Media | `qr.controller.ts:379-400`, `api/qr/seo-idqr/route.ts`, `sitemap.ts` |
| V6 | **`POST /scan/stats`**: **parcialmente mitigado por SPEC-009 A9** — el usecase valida que el QR exista (404, no crea doc) e **ignora `userId` del body** (toma el dueño real del QR). Queda: inflar stats de un QR **existente** con idQr conocido → falta rate limit | 🟠 Media | `create-scan.usecase.ts:20-46` |
| V7 | **Doble llamada por vista**: `generateMetadata` + `page` = 2× route handler = 2× `GET /qr/public/:id` por escaneo; los límites deben contemplarlo | ℹ️ Info | `qr/[id]/page.tsx:15-20,72-77` |
| V8 | **Route handler sin validación de formato**: acepta cualquier string en `:id` → queries de costo variable. **Verificado: seguro exigir UUID v4 estricto** — la BD real tiene 1615/1615 idQr UUID v4 (query 2026-08-13) y `CreateQrDto` ya valida `@IsUUID('4')` | 🟡 Baja | `api/qr/[id]/redirect/route.ts:6-12`, `create-qr.dto.ts:311` |
| V9 | **Topología de red**: el BFF ve la IP de `qr-app` (llamada server-side), NO la del visitante → **la protección del visitante debe vivir en el route handler de Next (Capa A) o en Cloudflare (Capa C)**. El BFF no puede rate-limitar por IP real en el flujo normal | 🔴 Crítica | `api/qr/[id]/redirect/route.ts:19-25` |
| V10 | **NUEVO — El BFF no está expuesto a internet** (red privada Railway `backend-portaqr.railway.internal:3004`, DNS no resuelve públicamente) → la amenaza "acceso directo al BFF" está **mitigada por red**. Riesgo residual: dominio público `backend-portaqr.up.railway.app` quedó registrado (fallback 404) → **desregistrarlo** | 🟢 Info | Railway panel → Networking |
| V11 | **NUEVO — 429 hoy se traduce en 404 para el visitante**: cualquier error != 'inactivo' en `page.tsx:88-105` → `notFound()`. Cuando se activen los límites, hay que distinguir 429 (espera + `Retry-After`) de 404 | 🟠 Media | `qr/[id]/page.tsx:88-105` |
| V12 | **NUEVO — Ruido por visita pública**: `POST /api/auth/refresh` 401 en cada escaneo (sin sesión) + errores Facebook SDK en loop (App ID no configurado) + `ipapi.co` recibe la IP del visitante | 🟡 Baja | `AuthContext`, `FacebookSDKProvider`, `scan.service.ts` |
| V13 | **NUEVO — `backendPortaqr.env` de dev usa `THROTTLE_LIMIT=1000`** (cosmético) y `.env.example` documenta `THROTTLE_TTL=60` (en v6 el TTL es en **ms** → 60ms = throttler inerte). Unificar criterio: TTL siempre en ms, valores por entorno | 🟡 Baja | `backendPortaqr.env:69-70`, `.env.example:76-77` |

### 2.4 La IP detrás de Cloudflare (lección de SPEC-006, ahora con evidencia)

- Rate limit por IP **en el BFF** solo ve la IP interna de `qr-app` (red privada) → bloquea a TODOS los visitantes a la vez (auto-bloqueo). **La Capa B NO debe rate-limitar por IP real del visitante — le es imposible**.
- En el route handler de Next, la IP real del visitante **SÍ está disponible** (verificado: `cf-connecting-ip` y `x-real-ip` llegan al edge/app): `request.headers.get('cf-connecting-ip')` → fallback `x-forwarded-for[0]` → socket.

## 3. Amenazas

| Amenaza | Impacto | Capa que la frena |
|---|---|---|
| Bot consulta estado de N QRs en loop (IDs de `seo-idqr`) | Carga al BFF/Mongo, scraping del negocio | **Capa A** (route handler por IP real) + **Capa C** (WAF) |
| Bot infla estadísticas de escaneo de un QR ajeno | Métricas falsas, decisión de negocio errónea | **Capa B** por `idQr` (120/min) + Capa A en route handler de scan |
| Usuario humano en loop de "Intentar de nuevo" (QR físico dañado/imagen corrupta) | Carga innecesaria, experiencia de bucle infinito | Límite de reintentos manuales + bloqueo temporal |
| Caída transitoria del BFF (5xx) | Visitante ve error definitivo sin poder recuperarse | Reintentos automáticos con backoff (solo transitorios) |
| Acceso directo al BFF (bypass de qr-app) | ~~Sin protección del visitante~~ → **MITIGADO por red privada Railway** (hostname no resolvible públicamente). Vigilar que no se registre/active un dominio público | — (verificación de red) |
| Brute-force de UUID v4 | Inviable (122 bits) — NO requiere mitigación | — (documentar por qué) |

## 4. Solución propuesta

### 4.1 Reintentos — `qr-app` (frontend)

#### a) Reintentos automáticos del fetch al BFF — **en el route handler** (no en el server component)

- **Ubicación**: `/api/qr/[id]/redirect/route.ts` — punto único por el que pasan TODAS las llamadas (generateMetadata + page + futuros callers). Un GET es idempotente → reintentar es seguro.
- **Solo para errores transitorios**: timeout de red, `5xx` del BFF. **Nunca** para `4xx` (404 QR no existe/inactivo, 400) ni `429` (ya limitado — no es transitorio).
- **Cantidad**: `QR_VALIDATION_RETRY_COUNT` = **2 reintentos** (3 intentos totales) con **backoff exponencial** `QR_VALIDATION_RETRY_BASE_MS` = 500ms, 1000ms.
- **Implementación**: helper `fetchWithRetry(fn, { retries, baseDelay })` en `src/lib/`.
- **Por qué no en `generateMetadata`/`QrRedirectPage`**: (1) bloquea el TTFB de metadatos no críticos (500+1000ms); (2) duplica la carga (hasta 6 llamadas por escaneo si ambos reintentan); (3) los metadatos ya tienen fallback genérico (`page.tsx:47-68`). Peor caso con retry en route handler: metadata (1, sin retry) + page (3) = **4 llamadas al handler**.
- Un `404` (no encontrado o inactivo) **no se reintenta nunca** (no cambiará en 1 segundo) y fluye directo con su status.

#### b) Reintentos manuales del botón "Intentar de nuevo" (`QrRedirectClient.tsx`)

- **Cantidad**: `QR_MANUAL_RETRY_MAX` = **3 usos** por ventana de `QR_MANUAL_RETRY_WINDOW_MS` = **5 minutos**.
- **Granularidad**: **por idQr** — clave `qr-retry-counter-{idQr}` en `sessionStorage` (un QR dañado no castiga a otros QRs). Un reload NO resetea el contador (el reload ES el intento).
- **Limitación documentada**: `sessionStorage` es por pestaña — abrir en pestaña nueva resetea el contador (aceptable: el abuso es por reload en la misma pestaña).
- **Al agotar**: el botón se deshabilita y muestra cuenta regresiva (`QR_MANUAL_RETRY_BLOCK_MS` = 60s) con el mensaje *"Has alcanzado el límite de intentos. Verifica la URL o escanea el código QR nuevamente."*
- El mismo contador aplica al `ErrorScreen` de "Tipo de contenido no renderizable" (`QrRedirectClient.tsx:205`).

#### c) `POST /scan/stats`

- **No reintentar** (mantener `console.error` actual): el reintento duplicaría estadísticas. La idempotencia por `userIdScan` se documenta como mejora futura (§9), no entra en alcance.

### 4.2 Rate limiting — 3 capas

#### Capa A — Route handler de Next (`/api/qr/[id]/redirect`) ← protección del visitante (protagonista)

- **Qué limita**: por **IP real del visitante** (`cf-connecting-ip` → `x-forwarded-for[0]` → socket) — **verificado disponible en prod** (§2.2). No falsificable: para llegar a qr-app hay que pasar por Cloudflare.
- **Límites**: `QR_PUBLIC_RATE_MAX` = **30 req/min** (una vista = 2 requests → ~15 escaneos/min); `QR_SCAN_STATS_RATE_MAX` = **20 req/min** para `POST /scan/stats`; `QR_SEO_RATE_MAX` = **10 req/min** para `/api/qr/seo-idqr` (nuevo respecto al borrador — es la fuente de IDs para el abuso).
- **Implementación**: helper `src/lib/rate-limit.ts` — `Map<key, { count, windowStart }>` en memoria, sin dependencias. Limpieza perezosa de entradas vencidas.
- **Respuesta**: `429` + header `Retry-After: <segundos restantes>` + body JSON `{ error: "Demasiadas solicitudes. Intenta nuevamente en Xs." }`.
- **Limitación**: Map en memoria es por instancia (N instancias = límite × N). OK para 1 instancia; a escala → store compartido (Redis) — ver §9.

#### Capa B — BFF (`backend-portaqr`) ← protección por `idQr` (anti-inflado y anti-scraping por QR)

- **Contexto**: SPEC-008 H4 **ya implementado** (guard global 10/min por IP interna). Las reglas específicas se agregan sobre él.
- **Diseño** (recalibrado 2026-08-13 con la topología de red privada): el BFF **solo ve la IP interna de qr-app** → la clave por IP real es imposible e inútil. **La clave correcta es `idQr`**:

| Ruta | Límite | Clave | Racional |
|---|---|---|---|
| `GET /qr/public/:id` | **60 req/min** | `idQr` | un QR viral puede escanearse mucho; 60/min por QR es seguro |
| `POST /scan/stats` | **120 req/min** | `idQr` | escaneos legítimos de un QR; anti-inflado |
| `GET /qr/seo-idqr` | **10 req/min** | IP interna (fallback) | solo lo usan crawlers/sitemap; 500 filas por call |
| Resto de rutas | 10 req/min (SPEC-008) | IP interna | sin cambios |

- **Implementación**: guard custom `QrPublicThrottlerGuard extends ThrottlerGuard` con `getTracker` = `params.idQr ?? body.idQr ?? IP` (así `seo-idqr`, sin idQr, cae a IP interna). Se aplica con `@UseGuards(QrPublicThrottlerGuard)` + `@Throttle({ idqr: {...} })` + `@SkipThrottle({ default: true })` en las 3 rutas públicas QR (el guard global 10/min no aplica a ellas).
- **Reglas configurables**: `THROTTLE_QR_PUBLIC_IDQR_MAX`, `THROTTLE_QR_SCAN_IDQR_MAX`, `THROTTLE_QR_SEO_MAX`, `THROTTLE_QR_TTL_MS` (60000).
- **Respuesta**: 429 estándar del throttler + `Retry-After` (v6 lo incluye).
- **El 429 del BFF se propaga**: route handler → server component. El server component debe distinguir 429 (V11) — ver §4.4.

#### Capa C — Cloudflare WAF (borde, sin código)

- Regla de rate limiting en el panel de Cloudflare para `/qr/*` y `/api/qr/*`: **100 req/min** por IP de visitante (CF sí ve la IP real), respuesta: challenge o 429.
- Complementa a la Capa A como red de seguridad; no depende de la app.

### 4.3 Validación de formato en el route handler (fix V8 — verificado seguro)

- En `/api/qr/[id]/redirect/route.ts`: si `:id` no matchea `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (UUID v4) → `400` sin llamar al BFF. Corta el costo de queries con payloads basura.
- **Evidencia de seguridad**: BD real = 1615/1615 UUID v4 (query 2026-08-13); `CreateQrDto.idQr` ya exige `@IsUUID('4')`. Vigilar a futuro si algún día se crean QRs con otro formato.

### 4.4 UX del 429 en el server component (fix V11)

- `qr/[id]/page.tsx`: distinguir el error **429** (del route handler o del BFF propagado) del 404 real. El 429 **no se reintenta** y muestra pantalla de espera con el `Retry-After` del header ("Demasiadas solicitudes. Intenta nuevamente en Xs.").
- El `fetchWithRetry` recibe el status y lo propaga sin reintentar.

## 5. Flujo de integración (estado objetivo)

```
Visitante escanea QR
   ▼
route handler /api/qr/[id]/redirect   ← punto único (metadata + page pasan por acá)
   │  1. Validar formato UUID v4 → si no → 400 (sin llamar al BFF)
   │  2. rate-limit IP real (30/min, cf-connecting-ip) → si excede → 429 + Retry-After
   │  3. fetchWithRetry al BFF (2 reintentos, backoff 500/1000ms, solo 5xx/timeout)
   │     - 404 → propaga 404 (no reintenta)  |  - 429 → propaga 429 (no reintenta)
   ▼
BFF GET /qr/public/:id   (red privada Railway)
   │  QrPublicThrottlerGuard + @Throttle idqr:
   │  - 60/min por idQr → 429 + Retry-After
   │  GetPublicQrUseCase (existente, sin cambios)
   ▼
qr/[id]/page.tsx (server)
   │  - 404 → página no encontrado / inactivo (sin reintento)
   │  - 429 → pantalla "Demasiadas solicitudes" con Retry-After (NO notFound)
   ▼
QrRedirectClient
   │  prompt geo → POST /scan/stats (rate-limited: route handler 20/min por IP + BFF 120/min por idQr)
   │  error → ErrorScreen con contador por idQr (máx 3 usos / 5 min, sessionStorage)
   │         → agotado → botón deshabilitado + cuenta regresiva 60s
   ▼
Redirección / contenido
```

## 6. Configuración

### `qr-app/.env.local` (y `.env.example`)

| Variable | Default | Descripción |
|---|---|---|
| `QR_VALIDATION_RETRY_COUNT` | `2` | Reintentos automáticos server-side (transitorios) |
| `QR_VALIDATION_RETRY_BASE_MS` | `500` | Backoff base (se duplica por intento) |
| `QR_MANUAL_RETRY_MAX` | `3` | Usos máximos de "Intentar de nuevo" por ventana |
| `QR_MANUAL_RETRY_WINDOW_MS` | `300000` | Ventana de reintentos manuales (5 min) |
| `QR_MANUAL_RETRY_BLOCK_MS` | `60000` | Bloqueo tras agotar intentos (60s) |
| `QR_PUBLIC_RATE_MAX` | `30` | Máx req/min por IP real en route handler de redirect |
| `QR_SCAN_STATS_RATE_MAX` | `20` | Máx req/min por IP real para POST scan stats |
| `QR_SEO_RATE_MAX` | `10` | Máx req/min por IP real para /api/qr/seo-idqr |
| `QR_RATE_WINDOW_MS` | `60000` | Ventana del rate limit (60s) |

### `backend-portaqr/.env` (y `.env.example`)

| Variable | Default | Descripción |
|---|---|---|
| `THROTTLE_QR_PUBLIC_IDQR_MAX` | `60` | GET /qr/public/:id por idQr |
| `THROTTLE_QR_SCAN_IDQR_MAX` | `120` | POST /scan/stats por idQr |
| `THROTTLE_QR_SEO_MAX` | `10` | GET /qr/seo-idqr por IP (interna) |
| `THROTTLE_QR_TTL_MS` | `60000` | Ventana (60s) — **en ms** (v6) |

> [!warning] Corregir también (V13)
> `.env.example` del backend documenta `THROTTLE_TTL=60` — en throttler v6 el TTL es en **ms** → `60000`. Corregir para no propagar un throttler inerte en entornos nuevos.

## 7. Criterios de aceptación

**Reintentos (frontend):**
- [ ] 31+ `GET /api/qr/[id]/redirect` en 60s desde la misma IP → `429` con `Retry-After` (route handler, Capa A)
- [ ] Un QR inexistente/inactivo (404) NO dispara reintentos automáticos ni cuenta como intento manual
- [ ] Un 5xx del BFF dispara exactamente 2 reintentos (500ms, 1000ms) y luego devuelve el error
- [ ] Un 429 (del BFF o propio) NO se reintenta nunca
- [ ] El botón "Intentar de nuevo" se deshabilita tras 3 usos en 5 min y muestra cuenta regresiva de 60s
- [ ] Recargar la página NO resetea el contador de reintentos manuales (sessionStorage)
- [ ] El contador es **por idQr** (escanear otro QR no hereda el bloqueo)
- [ ] El error de "Tipo de contenido no renderizable" usa el mismo contador

**Rate limiting (backend):**
- [ ] 61+ `GET /qr/public/:id` al mismo `idQr` en 60s → `429` + `Retry-After` (QrPublicThrottlerGuard)
- [ ] 121+ `POST /scan/stats` al mismo `idQr` en 60s → `429`
- [ ] 11+ `GET /qr/seo-idqr` en 60s → `429` (clave IP interna)
- [ ] El guard usa `params.idQr ?? body.idQr ?? IP` como tracker (tests con mocks)
- [ ] El guard global de SPEC-008 (10 req/min) NO aplica a las rutas públicas QR (`@SkipThrottle({ default: true })`)
- [ ] `:id` no-UUID v4 en el route handler → `400` sin llamada al BFF

**Generales:**
- [ ] Escaneo legítimo (2 calls por vista, ≤15 vistas/min) jamás recibe 429
- [ ] 429 llega al visitante como pantalla de espera (NUNCA como 404) — fix V11
- [ ] `tsc --noEmit` sin errores en `qr-app` y `backend-portaqr`
- [ ] Tests unitarios: `rate-limit.ts` (ventana, expiración, Retry-After), `fetchWithRetry` (4xx/429 no reintenta, 5xx reintenta), contador de reintentos manuales, `QrPublicThrottlerGuard` (getTracker mockeado)

## 8. No funcionales

- **Rendimiento**: `Map` en memoria < 1ms por request; backoff suma máx ~1.5s en el peor caso transitorio (solo 5xx).
- **Privacidad**: solo IP con TTL corto (60s), sin persistencia, sin datos personales.
- **Escalabilidad**: Map en memoria OK para 1 instancia; si se escala a N instancias → Redis (mismo patrón de SPEC-006 §2.2). Documentado en §9.
- **Compatibilidad**: los reintentos automáticos respetan el `cache: 'no-store'` actual; el 404 diferenciado de "inactivo" se mantiene intacto.
- **UX**: el bloqueo de reintentos muestra cuenta regresiva y sugerencias (nunca una pantalla en blanco); ningún límite alcanzable por uso humano normal.

## 9. Trabajo futuro (backlog)

- [ ] Implementar Capa A: `rate-limit.ts` + validación UUID v4 + `fetchWithRetry` en route handlers (~1h)
- [ ] Implementar contador de reintentos manuales en `QrRedirectClient` por idQr (~0.5h)
- [ ] Implementar `QrPublicThrottlerGuard` + reglas `@Throttle` en `qr.controller`/`scan.controller` (~1h)
- [ ] Fix V11: distinguir 429 de 404 en `qr/[id]/page.tsx` (~0.5h)
- [ ] Corregir `.env.example` del backend (`THROTTLE_TTL` en ms) (5 min)
- [ ] **Operativo**: desregistrar dominio público `backend-portaqr.up.railway.app` (panel Railway, 2 min)
- [ ] **Operativo**: definir `THROTTLE_*` explícitos en el panel de Railway del BFF antes del deploy (hoy inerte) (2 min)
- [ ] Regla WAF en Cloudflare para `/qr/*` (sin código, ~10min panel)
- [ ] Revisar `sitemap.ts` (los QRs no están en el sitemap de prod pese a `seo-idqr`) y decidir el rol del endpoint
- [ ] Eliminar ruido por visita pública: `POST /api/auth/refresh` 401 sin sesión + errores Facebook SDK (App ID) + alternativas a `ipapi.co` para privacidad
- [ ] Idempotencia de `POST /scan/stats` por `userIdScan` (evita dobles conteos; también cubre reintentos del cliente)
- [ ] Evaluar Redis como store del rate limit si la app escala a múltiples instancias

## 10. Changelog

> [!note] Historial de la especificación
> Convención: cada revisión que cambie decisiones o hallazgos agrega una entrada. Las entradas más recientes van primero.

| Fecha | Versión | Cambios |
|---|---|---|
| 2026-08-13 | 3.1 (fixes validación local) | **Validación en docker local reveló 2 fixes** (commits `0251def` backend, `167aba0` qr-app): (1) **throttler `idqr` debe declararse en `ThrottlerModule.forRoot`** — en @nestjs/throttler v6 `@Throttle({ idqr: {...} })` solo SOBREESCRIBE un throttler ya declarado en el módulo con ese nombre (no lo crea); sin la declaración las rutas QR quedaban sin límite. Se declara con límite de sobrecarga global `THROTTLE_QR_OVERLOAD_MAX=1000` (por IP interna; las rutas lo sobreescriben por idQr). (2) **Fix V11 reforzado**: el 429 del BFF llega como `ThrottlerException: Too Many Requests` (inglés) y rompía la detección en `page.tsx` → el route handler normaliza el 429 al mensaje es-ES y propaga `Retry-After` (el de v6 viaja como `Retry-After-idqr` en ms); `page.tsx` además reconoce `too many requests` por robustez. **Pruebas locales verificadas**: UUID inválido → 400 sin BFF; Capa A 429 en request 30 con `Retry-After`; Capa B 429 en request 11 (seo, IP) y request 61 (public, idQr); `POST /scan/stats` 200; rutas normales sin cambios (login 400/401, health 200); página QR activo completa (title, prompt geo, scan registrado, contenido renderizado); consola limpia |
| 2026-08-13 | 3.0 (implementado) | **Implementación completa en ramas feature** (`feature/SPEC-011-reintentos-rate-limiting` en `backend-portaqr` commit `5de0038` y `qr-app` commit `9ac96f0`). Backend: `QrPublicThrottlerGuard` (getTracker idQr ?? IP), reglas `THROTTLE_QR_*` (60/min public, 120/min scan, 10/min seo, TTL 60000ms), `@SkipThrottle({default:true})` en las 3 rutas públicas. Frontend: `rate-limit.ts` (Map por IP real cf-connecting-ip, 30/20/10 req/min + Retry-After), `fetch-with-retry.ts` (2 reintentos backoff 500/1000ms solo 5xx/timeout), `manual-retry.ts` (contador por idQr, sessionStorage, 3 usos/5min, bloqueo 60s), validación UUID v4 en redirect (400 sin BFF), fix V11 (429 ≠ 404 en `page.tsx`), infra jest nueva en qr-app. Validación: backend 151 suites/1188 tests ✓ + tsc 0; qr-app 21/21 tests ✓ + tsc 0 + eslint 0. Pendientes operativos (no bloqueantes, §9): desregistrar dominio público Railway, definir `THROTTLE_*` en panel, regla WAF Cloudflare, deploy en 2 fases con test de humo |
| 2026-08-13 | 2.0 (revisado) | **Revisión integral con verificación empírica en producción.** Cambios: (1) V1 corregido — el throttler de SPEC-008 SÍ está implementado pero inerte en prod sin envs; (2) topología verificada — Cloudflare proxy → qr-app → BFF por red privada `backend-portaqr.railway.internal:3004`, BFF no alcanzable desde internet; (3) `cf-connecting-ip` verificado disponible en el route handler → Capa A factible; (4) Capa B rediseñada — solo clave `idQr` (la IP real es imposible/inútil en el BFF); (5) V6 actualizado — mitigación parcial por SPEC-009 A9; (6) V8 confirmado seguro con muestreo de BD (1615/1615 UUID v4); (7) retry automático movido al route handler (no a generateMetadata); (8) nuevos hallazgos V10-V13 (red privada, UX 429→404, ruido por visita, envs inconsistentes); (9) Capa A ampliada a `/api/qr/seo-idqr`; (10) configuración y criterios de aceptación actualizados |
| 2026-08-09 | 1.0 (borrador) | Creación del documento: hallazgos V1-V9 originales, propuesta de 3 capas, configuración y backlog inicial |
