---
title: "Nota: Paso a producción — SPEC-011 (Reintentos y rate limiting de la validación de QR)"
date: 2026-08-13
tags:
  - despliegue
  - produccion
  - variables
  - env
  - seguridad
  - rate-limiting
  - reintentos
  - throttler
  - spec-011
status: activo
aliases:
  - Despliegue producción SPEC-011
  - Paso a producción rate limiting QR
  - Variables SPEC-011
---

# Nota de despliegue a producción — SPEC-011 (Reintentos y rate limiting de la validación de QR)

> [!important] Resumen
> La SPEC-011 agrega **rate limiting en 3 capas** (route handler de Next → BFF → Cloudflare WAF) y **política de reintentos** al flujo público de validación de QR. Para producción: **14 variables nuevas** (9 en `qr-app`, 5 en `backend-portaqr`), **1 corrección de variable existente** (`THROTTLE_TTL` ahora en milisegundos), **0 variables eliminadas**, y **1 decisión operativa importante**: el throttler del BFF hoy está **inerte en producción** (sin `THROTTLE_*` definidos en el panel de Railway) — hay que definirlos en el MISMO deploy para que los límites de la Capa B actúen.
>
> **Orden de despliegue recomendado: 2 fases** (ver §5) para no mezclar el cambio de red privada de Railway con el rate limiting nuevo.

---

## 🔴 CRÍTICO — El throttler del BFF está INERTE en producción HOY

> [!warning] Antes de este deploy
> El código del throttler global de SPEC-008 **ya está desplegado**, pero **sin `THROTTLE_TTL`/`THROTTLE_LIMIT` definidos en el panel de Railway** corre con los defaults del código: `ttl=60` (¡milisegundos en v6!) y `limit=10` → la ventana expira al instante → **el throttler no bloquea nada**. Verificado empíricamente el 2026-08-13: 25 requests a `/api/qr/seo-idqr` en prod → 25× 200, cero 429.

**Acción obligatoria en el panel de Railway (servicio `backend-portaqr`), ANTES o junto con este deploy:**

| Variable | Valor recomendado | Efecto |
| --- | --- | --- |
| `THROTTLE_TTL` | `60000` (ms) | Ventana del guard global (60s) |
| `THROTTLE_LIMIT` | `1000` (dev) / `10`-`60` (prod) | Guard global por IP interna. ⚠️ OJO: en el BFF la IP es la de `qr-app` (red privada) → un límite bajo limita a TODOS los visitantes juntos. En prod se recomienda alto (`1000`) porque la protección real del visitante vive en la Capa A |
| `THROTTLE_SENSITIVE_LIMIT` | `5` (prod) / `1000` (dev/CI) | Endpoints sensibles (login/refresh/contacto) — ya existía |

---

## 🟢 BACKEND (`backend-portaqr`) — Variables NUEVAS (todas con default seguro en código)

| Variable nueva | Descripción | Default | Dónde se lee |
| --- | --- | --- | --- |
| `THROTTLE_QR_TTL_MS` | Ventana del rate limit del flujo público QR (en **ms**) | `60000` | `throttle.config.ts` |
| `THROTTLE_QR_PUBLIC_IDQR_MAX` | `GET /qr/public/:id` — máx req/min **por idQr** (un QR viral / bot enfocado) | `60` | `throttle.config.ts` → `qr.controller.ts` |
| `THROTTLE_QR_SCAN_IDQR_MAX` | `POST /scan/stats` — máx req/min **por idQr** (anti-inflado de stats) | `120` | `throttle.config.ts` → `scan.controller.ts` |
| `THROTTLE_QR_SEO_MAX` | `GET /qr/seo-idqr` — máx req/min por IP interna (solo crawlers/sitemap) | `10` | `throttle.config.ts` → `qr.controller.ts` |
| `THROTTLE_QR_OVERLOAD_MAX` | **Sobrecarga global del BFF**: límite del throttler `idqr` declarado en el módulo, procesado por el guard global con la IP interna de `qr-app` (todos los visitantes comparten este bucket — no alcanzable por uso legítimo) | `1000` | `app.module.ts` (ThrottlerModule.forRootAsync) |

> [!note] Detalle de implementación (por qué existe `THROTTLE_QR_OVERLOAD_MAX`)
> En @nestjs/throttler v6, `@Throttle({ idqr: {...} })` solo **sobreescribe** un throttler ya **declarado en el módulo** con ese nombre (no lo crea). Sin la declaración, las rutas QR públicas quedaban sin límite (el guard global estaba skippeado con `@SkipThrottle({ default: true })`). Por eso `idqr` se declara en `app.module.ts` con un límite alto que las rutas sobreescriben por idQr.

> [!warning] Corrección a la SPEC-008 (V13): `THROTTLE_TTL` ahora es en **milisegundos**
> `.env.example` documentaba `THROTTLE_TTL=60` (pensado en segundos). En throttler v6 el TTL es en **ms** → `60` = ventana de 60ms = throttler inerte. El `.env.example` quedó corregido a `60000`. **Revisar cualquier entorno que tenga `THROTTLE_TTL` en segundos.**

---

## 🔵 FRONTEND (`qr-app`) — Variables NUEVAS

| Variable | Default | Build-time? | Descripción |
| --- | --- | --- | --- |
| `QR_VALIDATION_RETRY_COUNT` | `2` | No (server) | Reintentos automáticos del route handler hacia el BFF (solo 5xx/timeout; 4xx y 429 nunca) |
| `QR_VALIDATION_RETRY_BASE_MS` | `500` | No (server) | Backoff base (exponencial: 500ms, 1000ms) |
| `NEXT_PUBLIC_QR_MANUAL_RETRY_MAX` | `3` | **SÍ (build)** | Usos máximos del botón "Intentar de nuevo" por ventana (por idQr) |
| `NEXT_PUBLIC_QR_MANUAL_RETRY_WINDOW_MS` | `300000` (5 min) | **SÍ (build)** | Ventana de reintentos manuales |
| `NEXT_PUBLIC_QR_MANUAL_RETRY_BLOCK_MS` | `60000` (60s) | **SÍ (build)** | Bloqueo temporal al agotar intentos (countdown visible) |
| `QR_PUBLIC_RATE_MAX` | `30` | No (server) | Capa A: máx req/min por IP real del visitante en `/api/qr/[id]/redirect` (1 vista = 2 requests → ~15 vistas/min) |
| `QR_SCAN_STATS_RATE_MAX` | `20` | No (server) | Capa A: máx req/min por IP en `/api/scan/stats` |
| `QR_SEO_RATE_MAX` | `10` | No (server) | Capa A: máx req/min por IP en `/api/qr/seo-idqr` |
| `QR_RATE_WINDOW_MS` | `60000` | No (server) | Ventana del rate limit de la Capa A |

> [!critical] `NEXT_PUBLIC_*` son build-time → **rebuild + redeploy** obligatorio
> Las 3 variables `NEXT_PUBLIC_QR_MANUAL_RETRY_*` se embeben en el bundle del cliente al **compilar**. Cambiarlas en el panel de Railway y hacer solo redeploy **no las aplica** — hay que forzar rebuild (o un commit vacío/`git push` que dispare build). Las 6 restantes son server-side (se leen en runtime del route handler — bastan redeploy y reinicio del proceso).

> [!note] `NEXT_PUBLIC_BFF_URL` (preexistente) — valor objetivo
> En producción debe apuntar a la **red privada** de Railway: `http://backend-portaqr.railway.internal:3004` (hostname verificado no resolvible desde internet). Es build-time → requiere rebuild. Ver §5 (Fase 1).

---

## ⚠️ Comportamientos nuevos a tener presentes en producción

| Comportamiento | Detalle |
| --- | --- |
| **429 en la Capa A** (30/20/10 req/min por IP real) | Respuesta `429` + header `Retry-After` + body `{"error":"Demasiadas solicitudes. Intenta nuevamente en Xs."}`. La IP se toma de `cf-connecting-ip` (Cloudflare al frente, verificado en prod) → **no falsificable** |
| **429 en la Capa B** (60/120/10 por idQr) | El route handler **normaliza** el 429 del BFF al mensaje es-ES y propaga el `Retry-After` (el de v6 viaja como `Retry-After-idqr` en ms) |
| **Pantalla "Demasiadas solicitudes"** | El visitante limitado ve la pantalla de espera con el mensaje — **NUNCA un 404** (fix V11; incluye el flujo "QR inactivo" que antes caía a 404 genérico por un desajuste de propiedades `error` vs `message`, fix `848e2f6`) |
| **Reintentos automáticos** | Solo para 5xx/timeout del BFF (2 reintentos, 500/1000ms). Los 404 (QR inexistente/inactivo) y 429 **nunca** se reintentan |
| **Botón "Intentar de nuevo"** | Máx **3 usos por QR cada 5 min** (contador en `sessionStorage` por idQr — un reload NO lo resetea). Al agotar: botón deshabilitado + cuenta regresiva 60s + sugerencia. Es por pestaña (limpieza al cerrar) |
| **UUID inválido → 400** | `/api/qr/[id]/redirect` valida UUID v4 estricto → 400 sin llamar al BFF (seguro: BD real 1615/1615 UUID v4 + `@IsUUID('4')` en creación) |
| **`POST /scan/stats`** | Ya no acepta `userId` del body (SPEC-009) + 404 si el QR no existe + límites nuevos (20/min por IP + 120/min por idQr). El cliente **no reintenta** (evita dobles conteos) |

---

## 📋 CHECKLIST de despliegue (orden recomendado — 2 fases)

> [!tip] Por qué 2 fases
> El contenedor actual de `qr-app` en producción **aún no tiene** la URL privada del BFF (cambio reciente, requiere rebuild) y el BFF tiene el throttler inerte. Separar en 2 fases permite aislar fallas: si algo se rompe tras la Fase 1 → es la red privada; tras la Fase 2 → es el rate limiting.

### Fase 1 — Red privada + throttler base (sin SPEC-011)
1. **Panel Railway → `backend-portaqr` → Variables**: definir `THROTTLE_TTL=60000`, `THROTTLE_LIMIT=1000`, `THROTTLE_SENSITIVE_LIMIT=5` (si no existen).
2. **Panel Railway → `backend-portaqr` → Networking**: **desregistrar el dominio público residual `backend-portaqr.up.railway.app`** (existe en DNS con fallback 404; si se activara public networking, el BFF quedaría expuesto sin Cloudflare y con límites bajos). Dejar solo el hostname privado.
3. **Panel Railway → `qr-app` → Variables**: confirmar `NEXT_PUBLIC_BFF_URL=http://backend-portaqr.railway.internal:3004` (build-time → **rebuild**).
4. Deploy de los últimos merges (SPEC-009/012) con rebuild.
5. **Smoke test Fase 1**: escanear un QR real → 200 con contenido; registrar un scan → 200.

### Fase 2 — SPEC-011 (esta rama)
6. **Panel Railway → `backend-portaqr`**: definir `THROTTLE_QR_TTL_MS=60000`, `THROTTLE_QR_PUBLIC_IDQR_MAX=60`, `THROTTLE_QR_SCAN_IDQR_MAX=120`, `THROTTLE_QR_SEO_MAX=10`, `THROTTLE_QR_OVERLOAD_MAX=1000` (opcional — los defaults del código son estos).
7. **Merge + deploy ATÓMICO**: backend-portaqr y qr-app **juntos** (el frontend viejo no rompe con el backend nuevo — los límites son aditivos — pero el fix V11 necesita el frontend nuevo para mostrar la pantalla en vez de 404).
8. **Smoke test Fase 2**:
   - Escanear un QR real → 200 y contenido (2 requests por vista dentro de los límites)
   - 31+ requests al mismo `/api/qr/{id}/redirect` desde una IP → `429` + `Retry-After` + mensaje es-ES
   - 61+ requests al BFF directo al mismo idQr (o via route handler) → `429`
   - UUID inválido (`/api/qr/no-es-uuid/redirect`) → `400`
   - QR inexistente → `404` (no reintenta)
   - Botón "Intentar de nuevo": 4 usos seguidos → deshabilitado con cuenta regresiva
   - Navegar a un QR con el límite agotado → **pantalla "Demasiadas solicitudes"** (no 404)

### Después de la Fase 2
9. **Cloudflare WAF (panel, ~10 min, sin código)**: regla de rate limiting para `/qr/*` y `/api/qr/*` — 100 req/min por IP de visitante, respuesta: challenge o 429 (Capa C, red de seguridad).
10. **Revisar `sitemap.ts`**: el sitemap de prod solo lista la home (los QRs no se indexan) pese a `seo-idqr` — decidir si los QRs deben entrar al sitemap (afecta quién consume el endpoint).

---

## ⚠️ Post-despliegue / monitoreo

- **429 rate**: los 429 deben ser raros (solo bots/abusos). Un aumento de "Demasiadas solicitudes" en logs del route handler = posible bot (revisar la IP en `x-request-info`). 429 del BFF con `idqr:` en la clave = bot enfocado en un QR.
- **Cambiar límites después**: todas las variables se leen en runtime del proceso (basta redeploy sin rebuild — salvo las `NEXT_PUBLIC_*` del frontend que exigen rebuild).
- **Escala**: la Capa A usa un `Map` en memoria **por instancia** (N instancias = límite × N). Con 1 instancia en Railway hoy es correcto; si se escala horizontalmente, evaluar un store compartido (Redis) — ver SPEC-011 §9.
- **OneDrive (dev)**: el proyecto está en `OneDrive\Escritorio` — OneDrive puede revertir archivos editados y romper el watcher de Docker/Next. Si desarrollas con docker local, considera mover el repo fuera de OneDrive o pausar la sincronización.

---

## Referencias

- [[SPEC-011-reintentos-rate-limiting-validacion-qr]] — spec completa (hallazgos V1-V13 con estado final, capas A/B/C, changelog v3.0-v3.3)
- [[NOTA-despliegue-produccion-SPEC-009]] — nota anterior (patrón de esta nota; JWT obligatorias, refresh_tokens)
- [[NOTA-despliegue-produccion-SPEC-003]] — variables de auth RS256
- [[SPEC-008-hardening-sanitizacion-backend-portaqr]] — Capa 4 throttler (origen del guard global)
