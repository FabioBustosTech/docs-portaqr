---
title: "SPEC-011: Reintentos y rate limiting de la validación de QR (qr-app + backend-portaqr)"
date: 2026-08-09
tags:
  - spec
  - seguridad
  - backend
  - frontend
  - rate-limiting
  - reintentos
  - validacion-qr
  - throttler
status: borrador
aliases:
  - SPEC-011
  - Reintentos rate limiting QR
---

# SPEC-011: Reintentos y rate limiting de la validación de QR (`qr-app` + `backend-portaqr`)

> [!abstract] Decisión clave
> Establecer una **política de reintentos** (frontend) y de **rate limiting en 3 capas** (route handler de Next → BFF → Cloudflare WAF) para el flujo público de validación de QR (`GET /qr/public/:id`, `POST /scan/stats`, `GET /qr/seo-idqr`), hoy **sin ninguna protección**: un bot puede consultar el estado de QRs en masa (con IDs filtrados por `seo-idqr`), inflar estadísticas de cualquier QR y el botón "Intentar de nuevo" permite reintentos infinitos con `window.location.reload()`. Los límites deben ser **generosos** (el escaneo legítimo de QR es alta frecuencia por naturaleza) y **configurables por env**, usando la IP real del visitante (`CF-Connecting-IP`) y no la del servidor Next que ve el BFF.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-09
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-app/` (reintentos + rate limit route handler) y `desarrollo-qr/backend-portaqr/` (rate limit BFF)
> - **Relacionado:** [[SPEC-008]] (Capa 4 throttler — prerrequisito), [[SPEC-009]] (CA-09 throttler pet-tag activate), [[SPEC-006]] (lección: IP real detrás de Cloudflare), [[SPEC-002]] (límite subidas list-image)

---

## 1. Objetivo

Definir:

1. **Cantidad de reintentos** que el frontend puede hacer al validar un QR (automáticos y manuales), con backoff exponencial y bloqueo temporal al agotarlos.
2. **Rate limiting** de los endpoints públicos de validación de QR en las 3 capas donde puede aplicarse, sin degradar la experiencia del escaneo legítimo.

## 2. Contexto

### 2.1 Flujo actual de validación de QR (2026-08-09, verificado en código)

```
Visitante escanea QR físico
   │  abre https://portaqr.cl/qr/{idQr}
   ▼
qr-app/src/app/qr/[id]/page.tsx            (server component)
   │  generateMetadata() → qrService.getPublicRedirectUrl()  ← llamada 1
   │  QrRedirectPage()    → qrService.getPublicRedirectUrl() ← llamada 2
   │  (2 llamadas por vista; Next llama generateMetadata + page por separado)
   ▼
qr-app/src/app/api/qr/[id]/redirect/route.ts  (route handler Next, SIN validación de formato)
   │  fetch → {NEXT_PUBLIC_BFF_URL}/qr/public/{id}
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

### 2.2 Hallazgos de la revisión

| # | Hallazgo | Severidad | Ubicación |
|---|---|---|---|
| V1 | **Cero rate limiting** en backend-portaqr: sin `@nestjs/throttler` (planificado en SPEC-008 Capa 4, **sin implementar**), sin middleware propio; solo `TrackingIdMiddleware` + `RequestLoggerEntryMiddleware` | 🔴 Alta | `app.module.ts`, `main.ts` |
| V2 | **Cero rate limiting** en qr-app: sin `middleware.ts`, route handlers sin límites | 🔴 Alta | `qr-app` (raíz), `api/qr/[id]/redirect/route.ts` |
| V3 | **Reintentos manuales ilimitados**: `ErrorScreen` → `window.location.reload()`; cada reload = 2 nuevas llamadas al BFF | 🟠 Media | `QrRedirectClient.tsx:27-38,205,213` |
| V4 | **Sin reintentos automáticos** (ni backoff): 1 solo intento por carga server-side; un 5xx transitorio del BFF = 404/error definitivo para el visitante | 🟡 Media | `qr/[id]/page.tsx:72-105`, `qr.service.ts:421-448` |
| V5 | **`GET /qr/seo-idqr` público sin límite**: expone los 500 últimos IDs activos → la enumeración de QRs válidos es trivial (el brute-force de UUID v4 solo no lo es) | 🟠 Media | `qr.controller.ts:232-253` |
| V6 | **`POST /scan/stats` público sin límite**: acepta `idQr`/`userId` arbitrarios (ya reportado en SPEC-009) → un bot puede inflar estadísticas de cualquier QR | 🟠 Media | `scan.controller.ts:44-56` |
| V7 | **Doble llamada por vista**: `generateMetadata` + `page` = 2× `GET /qr/public/:id` por escaneo; los límites deben contemplarlo | ℹ️ Info | `qr/[id]/page.tsx:15-20,72-77` |
| V8 | **Route handler sin validación de formato**: acepta cualquier string en `:id` → queries de costo variable; el BFF valida UUID solo en creación, no en lectura | 🟡 Baja | `api/qr/[id]/redirect/route.ts:6-12` |
| V9 | **Topología de red**: el BFF ve la IP de `qr-app` (llamada server-side), NO la del visitante. Un rate limit por IP en el BFF **no protege** el flujo visitante→qr-app→BFF; la protección del visitante debe vivir en el route handler de Next o en el borde (Cloudflare) | 🔴 Crítica | `api/qr/[id]/redirect/route.ts:19-25` |

### 2.3 El problema de la IP detrás de Cloudflare (lección de SPEC-006)

- Rate limit por IP **en el BFF** bloquea la IP de `qr-app`/Cloudflare → **auto-bloqueo de todos los usuarios** (incidente conocido, ver [[SPEC-006]] §2.2).
- Si se necesita la IP real del visitante: `CF-Connecting-IP` (inyectada por Cloudflare, no falsificable) → fallback `X-Forwarded-For` (primer valor) → IP de socket en dev.

## 3. Amenazas

| Amenaza | Impacto | Capa que la frena |
|---|---|---|
| Bot consulta estado de N QRs en loop (IDs de `seo-idqr`) | Carga al BFF/Mongo, scraping del negocio | Rate limit route handler (IP) + BFF (idQr) + WAF |
| Bot infla estadísticas de escaneo de un QR ajeno | Métricas falsas, decisión de negocio errónea | Rate limit `POST /scan/stats` (IP + idQr) |
| Usuario humano en loop de "Intentar de nuevo" (QR físico dañado/imagen corrupta) | Carga innecesaria, experiencia de bucle infinito | Límite de reintentos manuales + bloqueo temporal |
| Caída transitoria del BFF (5xx) | Visitante ve error definitivo sin poder recuperarse | Reintentos automáticos con backoff (solo transitorios) |
| Accesso directo al BFF (bypass de qr-app) | Sin protección del visitante | Throttler BFF por idQr/IP |
| Brute-force de UUID v4 | Inviable (122 bits) — NO requiere mitigación | — (documentar por qué) |

## 4. Solución propuesta

### 4.1 Reintentos — `qr-app` (frontend)

#### a) Reintentos automáticos del fetch server-side (`qr.service.ts` → route handler)

- **Solo para errores transitorios**: timeout de red, `5xx` del BFF. **Nunca** para `4xx` (404 QR no existe/inactivo, 400, 429).
- **Cantidad**: `QR_VALIDATION_RETRY_COUNT` = **2 reintentos** (3 intentos totales) con **backoff exponencial** `500ms`, `1000ms`.
- **Ubicación**: en `QrRedirectPage`/`generateMetadata` (server) — un helper `fetchWithRetry(fn, { retries, baseDelay })` en `src/lib/`.
- Un `404` (no encontrado o inactivo) **no se reintenta nunca** (no cambiará en 1 segundo) y fluye directo a la página 404 / "inactivo" actual.

#### b) Reintentos manuales del botón "Intentar de nuevo" (`QrRedirectClient.tsx`)

- **Cantidad**: `QR_MANUAL_RETRY_MAX` = **3 usos** por ventana de `QR_MANUAL_RETRY_WINDOW_MS` = **5 minutos**.
- **Persistencia**: contador + timestamp en `sessionStorage` (clave `qr-retry-counter`) — un reload NO debe resetear el contador (el reload ES el intento).
- **Al agotar**: el botón se deshabilita y muestra cuenta regresiva (`QR_MANUAL_RETRY_BLOCK_MS` = 60s) con el mensaje *"Has alcanzado el límite de intentos. Verifica la URL o escanea el código QR nuevamente."*
- El mismo contador aplica al `ErrorScreen` de "Tipo de contenido no renderizable" (`QrRedirectClient.tsx:205`).

#### c) `POST /scan/stats`

- **No reintentar** (mantener `console.error` actual): el reintento duplicaría estadísticas. La idempotencia por `userIdScan` se documenta como mejora futura (§9), no entra en alcance.

### 4.2 Rate limiting — 3 capas

#### Capa A — Route handler de Next (`/api/qr/[id]/redirect`) ← protección del visitante

- **Qué limita**: `GET /api/qr/[id]/redirect` por **IP real del visitante** (`CF-Connecting-IP` → `X-Forwarded-For[0]` → socket).
- **Límite**: `QR_PUBLIC_RATE_MAX` = **30 req/min** por IP (una vista = 2 requests → permite ~15 escaneos/min, generoso para uso humano).
- **Implementación**: helper `src/lib/rate-limit.ts` — `Map<ip, { count, windowStart }>` en memoria, sin dependencias (~40 líneas). Limpieza perezosa de entradas vencidas.
- **Respuesta**: `429` + header `Retry-After: <segundos restantes>` + body JSON `{ error: "Demasiadas solicitudes. Intenta nuevamente en Xs." }`.
- **Aplicar también** a `POST /scan/stats` route handler si existe (`scan.service.ts` → ¿`/api/scan/stats`? verificar) con límite propio de `QR_SCAN_STATS_RATE_MAX` = 20 req/min.

#### Capa B — BFF (`backend-portaqr`) ← protección contra acceso directo y abuso por idQr

- **Prerrequisito**: implementar Capa 4 de [[SPEC-008]] (`@nestjs/throttler`). Esta spec define las **reglas específicas** para rutas públicas QR (el guard global de 10 req/min de SPEC-008 **rompería** el escaneo legítimo si se aplica a estas rutas — se debe configurar con `@Throttle()` por ruta):

| Ruta | Límite | Clave | Racional |
|---|---|---|---|
| `GET /qr/public/:id` | **60 req/min** | por `idQr` | un QR viral puede escanearse mucho; 60/min por QR es seguro |
| `GET /qr/public/:id` | **30 req/min** | por IP (CF-Connecting-IP) | protege contra acceso directo al BFF |
| `POST /scan/stats` | **120 req/min** | por `idQr` | escaneos legítimos de un QR |
| `POST /scan/stats` | **20 req/min** | por IP | evita inflar stats |
| `GET /qr/seo-idqr` | **10 req/min** | por IP | solo lo usan crawlers/sitemap; 500 filas por call |

- **Key personalizada**: usar `CF-Connecting-IP` como IP (fallback `X-Forwarded-For[0]`, luego socket). El `ThrottlerModule` de Nest permite `getTracker` custom.
- **Excepción global**: las rutas `@Public()` de QR quedan excluidas del guard global default y se regulan SOLO por estas reglas específicas.
- **Respuesta**: 429 estándar del throttler + `Retry-After`.

#### Capa C — Cloudflare WAF (borde, recomendación sin código)

- Regla de rate limiting en el panel de Cloudflare para `/qr/*` y `/api/qr/*`: **100 req/min** por IP de visitante (CF sí ve la IP real), respuesta: challenge o 429.
- Complementa a la Capa A como red de seguridad; no depende de la app.

### 4.3 Validación de formato en el route handler (fix V8, barato)

- En `/api/qr/[id]/redirect/route.ts`: si `:id` no matchea `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (UUID v4) → `400` sin llamar al BFF. Corta el costo de queries con payloads basura.

## 5. Flujo de integración (estado objetivo)

```
Visitante escanea QR
   ▼
qr-app/qr/[id]/page.tsx  (server)
   │  getPublicRedirectUrl() con fetchWithRetry (2 reintentos, backoff 500/1000ms)
   │  - 404 → página no encontrado / inactivo (sin reintento)
   │  - 5xx/timeout → reintenta → si persiste → 404 genérico
   ▼
route handler /api/qr/[id]/redirect
   │  1. Validar formato UUID v4 → si no → 400
   │  2. rate-limit IP (30/min) → si excede → 429 + Retry-After
   ▼
BFF GET /qr/public/:id
   │  ThrottlerGuard (SPEC-008) con reglas específicas:
   │  - 60/min por idQr, 30/min por IP → 429 + Retry-After
   │  GetPublicQrUseCase (existente, sin cambios)
   ▼
QrRedirectClient
   │  prompt geo → POST /scan/stats (rate-limited 120/min por idQr)
   │  error → ErrorScreen con contador (máx 3 usos / 5 min, sessionStorage)
   │         → agotado → botón deshabilitado + cuenta regresiva 60s
   ▼
Redirección / contenido
```

## 6. Configuración

### `qr-app/.env.local`

| Variable | Default | Descripción |
|---|---|---|
| `QR_VALIDATION_RETRY_COUNT` | `2` | Reintentos automáticos server-side (transitorios) |
| `QR_VALIDATION_RETRY_BASE_MS` | `500` | Backoff base (se duplica por intento) |
| `QR_MANUAL_RETRY_MAX` | `3` | Usos máximos de "Intentar de nuevo" por ventana |
| `QR_MANUAL_RETRY_WINDOW_MS` | `300000` | Ventana de reintentos manuales (5 min) |
| `QR_MANUAL_RETRY_BLOCK_MS` | `60000` | Bloqueo tras agotar intentos (60s) |
| `QR_PUBLIC_RATE_MAX` | `30` | Máx req/min por IP en route handler |
| `QR_SCAN_STATS_RATE_MAX` | `20` | Máx req/min por IP para POST scan stats |

### `backend-portaqr/.env`

| Variable | Default | Descripción |
|---|---|---|
| `THROTTLE_QR_PUBLIC_IDQR_MAX` | `60` | GET /qr/public/:id por idQr |
| `THROTTLE_QR_PUBLIC_IP_MAX` | `30` | GET /qr/public/:id por IP |
| `THROTTLE_QR_SCAN_IDQR_MAX` | `120` | POST /scan/stats por idQr |
| `THROTTLE_QR_SCAN_IP_MAX` | `20` | POST /scan/stats por IP |
| `THROTTLE_QR_SEO_MAX` | `10` | GET /qr/seo-idqr por IP |
| `THROTTLE_TTL_MS` | `60000` | Ventana (60s) |

## 7. Criterios de aceptación

**Reintentos (frontend):**
- [ ] 30+ `GET /api/qr/[id]/redirect` en 60s desde la misma IP → `429` con `Retry-After` (route handler)
- [ ] Un QR inexistente/inactivo (404) NO dispara reintentos automáticos ni cuenta como intento manual
- [ ] Un 5xx del BFF dispara exactamente 2 reintentos (500ms, 1000ms) y luego muestra error
- [ ] El botón "Intentar de nuevo" se deshabilita tras 3 usos en 5 min y muestra cuenta regresiva de 60s
- [ ] Recargar la página NO resetea el contador de reintentos manuales (sessionStorage)
- [ ] El error de "Tipo de contenido no renderizable" usa el mismo contador

**Rate limiting (backend):**
- [ ] 61+ `GET /qr/public/:id` al mismo `idQr` en 60s → `429` + `Retry-After`
- [ ] 121+ `POST /scan/stats` al mismo `idQr` en 60s → `429`
- [ ] 11+ `GET /qr/seo-idqr` en 60s → `429`
- [ ] El throttler usa `CF-Connecting-IP` (verificado en logs/test con header simulado)
- [ ] El guard global de SPEC-008 (10 req/min) NO aplica a las rutas públicas QR (reglas específicas activas)
- [ ] `:id` no-UUID en el route handler → `400` sin llamada al BFF

**Generales:**
- [ ] Escaneo legítimo (2 calls por vista, ≤15 vistas/min) jamás recibe 429
- [ ] `tsc --noEmit` sin errores en `qr-app` y `backend-portaqr`
- [ ] Tests unitarios: `rate-limit.ts` (ventana, expiración, Retry-After), `fetchWithRetry` (4xx no reintenta, 5xx reintenta), contador de reintentos manuales
- [ ] Tests del throttler BFF con `getTracker` mockeado

## 8. No funcionales

- **Rendimiento**: `Map` en memoria < 1ms por request; backoff suma máx ~1.5s en el peor caso transitorio.
- **Privacidad**: solo IP con TTL corto (60s), sin persistencia, sin datos personales.
- **Escalabilidad**: Map en memoria OK para 1 instancia; si se escala a N instancias → Redis (mismo patrón de SPEC-006 §2.2). Documentado en §9.
- **Compatibilidad**: los reintentos automáticos respetan el `cache: 'no-store'` actual; el 404 diferenciado de "inactivo" se mantiene intacto.
- **UX**: el bloqueo de reintentos muestra cuenta regresiva y sugerencias (nunca una pantalla en blanco); ningún límite alcanzable por uso humano normal.

## 9. Trabajo futuro (backlog)

- [ ] Implementar Capa 4 de SPEC-008 (helmet + CORS + throttler) — prerrequisito de la Capa B (~1h)
- [ ] Implementar reintentos automáticos + helper `fetchWithRetry` (~0.5h)
- [ ] Implementar contador de reintentos manuales en `QrRedirectClient` (~0.5h)
- [ ] Implementar `rate-limit.ts` en route handler + validación UUID v4 (~0.5h)
- [ ] Implementar reglas throttler específicas en `qr.controller`/`scan.controller` (~0.5h)
- [ ] Regla WAF en Cloudflare para `/qr/*` (sin código, ~10min panel)
- [ ] Idempotencia de `POST /scan/stats` por `userIdScan` (evita dobles conteos; también cubre reintentos del cliente)
- [ ] Evaluar Redis como store del throttler si la app escala a múltiples instancias
