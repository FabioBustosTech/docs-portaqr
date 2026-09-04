---
title: "SPEC-034: Pixel de Meta (Facebook) con consentimiento en qr-app"
date: 2026-09-04
tags:
  - spec
  - qr-app
  - nextjs
  - analytics
  - meta
  - facebook-pixel
  - privacidad
  - cookies
status: implementado
aliases:
  - SPEC-034
  - Facebook Pixel qr-app
---

# SPEC-034: Pixel de Meta (Facebook) con consentimiento en qr-app

> [!abstract] Decisión clave
> `qr-app` no medía Meta. Se integra el **Pixel de Meta (fbq)** con un componente propio `FacebookPixelGate` (`next/script` + `fbevents.js`) en el `RootLayout` (cubre todas las rutas incluido `/blog` ISR), **gateado por la misma triple condición de SPEC-028**: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID` válido + **consentimiento explícito** (`localStorage['portaqr-consent'] === 'accepted'`, mismo banner, sin cambios). **V1 = solo `PageView`** (automático en cada cambio de ruta); eventos de funnel (`Lead`, `Purchase`, etc.) quedan para V2. **Pixel ID del usuario: `24015369744738274`** (entregado 2026-09-04); la activación en prod es solo setear las env vars + redeploy.

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-04)
> - **Fecha:** 2026-09-04
> - **Componente destino:** `desarrollo-qr/qr-app/` (`src/app/layout.tsx`, `src/app/ClientLayout.tsx`, `src/lib/analytics.ts`, `src/lib/facebook-pixel.ts`, `src/components/analytics/FacebookPixelGate.tsx`)
> - **Relacionado:** [[SPEC-028-google-analytics-ga4]] (patrón triple-gate + banner que se reutiliza sin cambios), [[SPEC-026-rediseno-checkout-pago-qr]] (futura V2 `Purchase` en Webpay), [[SPEC-020-registro-simplificado-google-oauth]] (futura V2 `CompleteRegistration`), `/privacidad`, `/cookies`
> - **Decisiones usuario (2026-09-04):** Pixel ID 24015369744738274 (snippet oficial entregado), V1 solo `PageView`, mismo banner de SPEC-028, script directo `fbq` (no vía GTM, no librería externa).

---

## 1. Objetivo

Medir tráfico y preparar audiencias/retargeting de Meta en `qr-app` (landing, auth, dashboard, `/blog`) sin romper privacidad ni lo ya construido.

| Hoy | Con SPEC-034 |
|---|---|
| Solo GTM/GA4 (SPEC-028); Meta Ads sin medición | Pixel `fbq` activo solo si flag + Pixel ID + consent `accepted` |
| `FacebookSDKProvider` solo para compartir (App ID, sin `fbq`) | Pixel convive con el SDK sin conflictos (IDs distintos, propósitos distintos) |
| Sin base para eventos Meta | `PageView` automático en cada ruta + helper `trackPageView` listo para V2 (`Lead`, `Purchase`…) |
| Riesgo de cargar tracking sin permiso | Por defecto `NEXT_PUBLIC_FB_PIXEL_ID` vacío → Pixel nunca carga, cero requests a Meta |

**No es login con Facebook ni el SDK de compartir.** Solo medición `fbevents.js` + `fbq('track', 'PageView')`. Sin Conversions API (server-side) en V1.

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Triple-gate compartido).** `FacebookPixelGate` solo inyecta `fbevents.js` e inicializa `fbq` si:
  1. `NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'` (mismo master switch de SPEC-028), **y**
  2. `NEXT_PUBLIC_FB_PIXEL_ID` es válido (`isFbPixelIdValid`), **y**
  3. consentimiento en `localStorage['portaqr-consent'] === 'accepted'` (misma clave de SPEC-028).
  - Si cualquiera falla → no se inyecta ningún script de Meta. La app funciona idéntico.
- **RF-2 (PageView automático).** Con gate OK:
  - Inicializa `fbq('init', pixelId)` una sola vez.
  - Dispara `fbq('track', 'PageView')` en el montaje y en **cada cambio de ruta** (App Router: `usePathname()` + `useSearchParams()` en el gate).
  - Sin `noscript` con `<img>` fallback: sin JS el banner no puede pedir consentimiento (misma razón que SPEC-028 §5).
- **RF-3 (Banner sin cambios).** Se reutiliza `CookieConsentBanner` tal cual: primera visita muestra banner; `Aceptar` habilita el Pixel en caliente sin reload (vía evento `portaqr:consent-changed`); `Rechazar` lo bloquea. Sin cambios visuales ni de textos en V1 (solo se documenta Meta en `/cookies` — ver RF-5).
- **RF-4 (Cobertura total).** Wiring en `RootLayout`/`ClientLayout` → cubre `/`, `/blog`, `/blog/[slug]`, dashboard y auth sin tocar cada página. Convive con `GoogleTagManagerGate` (ambos escuchan el mismo consentimiento, decisiones independientes por ID).
- **RF-5 (Transparencia).** Actualizar `/cookies` (y `/privacidad` si menciona proveedores) para listar a Meta como proveedor de medición sujeto al mismo consentimiento.
- **RF-6 (Sin ID = sin tracking).** Con valores por defecto (`false` + vacío): `npm run build` OK, home renderiza, banner aparece en primera visita, **cero** requests a `connect.facebook.net` / `facebook.com/tr`.

### 2.2 Reglas de negocio

- **RN-1 (Pixel ID es env var).** Fuente de verdad: `NEXT_PUBLIC_ENABLE_ANALYTICS` + `NEXT_PUBLIC_FB_PIXEL_ID` (leídas en server `layout.tsx`, pasadas como props al gate). El ID nunca va hardcodeado en código productivo (solo aparece en tests como fixture y en comentarios). Formato: solo dígitos, 8–20 caracteres (`/^\d{8,20}$/`); se rechazan placeholders (`1234567890`, `your_pixel_id_here`, `PIXEL_ID`).
- **RN-2 (NEXT_PUBLIC_\* = build time).** Cambiar flag/ID requiere rebuild (documentado en `.env.example`). En Railway se setean como variables del servicio `qr-app`.
- **RN-3 (SSR-safe).** Todo acceso a `window`/`document`/`localStorage` con guard `typeof window !== 'undefined'` o vía `safeLocalStorage` (`src/utils/browser.ts`). Nunca crashear en prerender. El snippet usa `next/script` (`strategy="afterInteractive"`), no `<script>` crudo en head.
- **RN-4 (Sin PII ni Advanced Matching en V1).** No enviar email, teléfono, nombre, `userId` ni IDs internos a Meta. Solo `PageView` estándar. Advanced Matching (`fbq('init', id, {em, ph})`) y Conversions API quedan explícitamente fuera de V1.
- **RN-5 (Independencia de IDs).** `NEXT_PUBLIC_FACEBOOK_APP_ID` (SDK de compartir, `ShareModal`) y `NEXT_PUBLIC_FB_PIXEL_ID` (este Pixel) son **distintos** y no se mezclan: el SDK carga siempre (funcionalidad compartir), el Pixel solo con gate. No se toca `FacebookSDKProvider` en V1.
- **RN-6 (V1 = PageView).** No se implementan `Lead`, `CompleteRegistration`, `InitiateCheckout`, `Purchase` ni `Contact` en V1; el helper `trackEvent` puede existir pero **no se llama** desde ningún flujo (se deja como API lista para V2).

### 2.3 Criterios de aceptación

- [ ] **CA-01 (Desactivado por defecto).** Con valores por defecto (`false` + vacío): `pnpm build` OK, home renderiza, banner aparece en primera visita, **cero** requests a Meta (verificable en DevTools Network y en E2E interceptando `connect.facebook.net` / `fbevents.js`).
- [ ] **CA-02 (Aceptar habilita).** Con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID=<ID-valido>`: tras clic `Aceptar`, `localStorage['portaqr-consent']==='accepted'` y `fbevents.js` se inyecta + `fbq('init', ID)` + `fbq('track', 'PageView')` sin reload.
- [ ] **CA-03 (Rechazar bloquea).** Tras clic `Rechazar`: `localStorage==='rejected'`, banner se oculta y el Pixel **no** se inyecta aunque flag+ID sean válidos. Recargar mantiene decisión (banner no reaparece).
- [ ] **CA-04 (ID inválido bloquea).** Con flag `true` pero ID vacío/placeholder/no-numérico: ni siquiera con consent `accepted` se inyecta el Pixel (GTM de SPEC-028 no se ve afectado: decisiones independientes).
- [ ] **CA-05 (Navegación SPA).** Con gate OK, navegar de `/` a `/precios` (o `/blog` → `/blog/[slug]`) dispara un `PageView` por ruta (E2E lee la cola del stub `window.fbq` — con `fbevents.js` abortado no hay requests `facebook.com/tr` observables; el PageView del efecto se verifica en unit con `fbq` mockeado).
- [ ] **CA-06 (Blog cubierto).** `/blog` y `/blog/[slug]` montan el mismo layout → gate aplica igual.
- [ ] **CA-07 (Calidad).** `pnpm exec tsc --noEmit`, `pnpm exec eslint`, `pnpm test` verdes; `.env.example` documenta la var nueva; E2E Playwright del flujo en `e2e-tests-portaqr`; `/cookies` menciona a Meta.

## 3. Diseño Técnico

### 3.1 Arquitectura

```
src/app/layout.tsx (server)
 └─ <ClientLayout gtmId enabled fbPixelId>
     ├─ <AuthProvider><FacebookSDKProvider>…</FacebookSDKProvider></AuthProvider>  ← sin cambios (App ID compartir)
     ├─ <GoogleTagManagerGate gtmId enabled />   ← SPEC-028, sin cambios
     ├─ <FacebookPixelGate pixelId enabled />    ← NUEVO client, lee consent, inyecta fbq si triple-gate OK
     ├─ <CookieConsentBanner />                  ← SPEC-028, sin cambios
     └─ {children} (incluye /blog ISR)
```

- **`src/lib/analytics.ts`** (extender, patrón SPEC-028):
  - `isFbPixelIdValid(id?: string): boolean` → `/^\d{8,20}$/` (+ rechazo de `1234567890`, `your_pixel_id_here`, `PIXEL_ID`, strings vacíos/entrecomillados).
  - `shouldLoadFbPixel({enabled, pixelId, consent}): boolean` → triple-gate (misma firma que `shouldLoadGtm`).
- **`src/lib/facebook-pixel.ts`** (nuevo, puro + tipos):
  - `declare global { interface Window { fbq?: (...args: unknown[]) => void; _fbq?: unknown } }` (tipado mínimo para `tsc` estricto).
  - `trackPageView(): void` → `window.fbq?.('track', 'PageView')` con guard SSR.
  - `trackEvent(name: string, params?: Record<string, unknown>): void` → API lista para V2 (**sin llamadores en V1**).
- **`src/components/analytics/FacebookPixelGate.tsx`** (`'use client'`, nuevo):
  - Props `{ pixelId: string; enabled: boolean }` (leídas en server layout desde `process.env`).
  - `useState consent` + `useEffect` suscribe `portaqr:consent-changed` + `storage` (multi-tab) — idéntico a `GoogleTagManagerGate`.
  - `if (!shouldLoadFbPixel(...)) return null`, si no:
    - `<Script id="fb-pixel" strategy="afterInteractive">` con el snippet estándar (`fbq` stub + `fbq('init', pixelId)` + `PageView` inicial).
    - `useEffect` sobre `pathname + searchParams` → `trackPageView()` en cada cambio de ruta.
- **`layout.tsx`**: lee `process.env.NEXT_PUBLIC_FB_PIXEL_ID ?? ''` y lo pasa a `ClientLayout` → `FacebookPixelGate`. Sin cambios en cada página.
- **`/cookies` (+ `/privacidad` si aplica)**: agregar fila "Meta (Facebook Pixel) — medición publicitaria, sujeta a este consentimiento".

### 3.2 Contratos / env vars

| Variable | Valores | Efecto |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `true`/`false` (default `false`) | Master switch **compartido** GTM + Pixel. `false` → ninguno carga |
| `NEXT_PUBLIC_FB_PIXEL_ID` | dígitos 8–20 o vacío (default vacío) | Pixel ID de Meta (Events Manager → pixel). Prod: se setea cuando el usuario lo cree |
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` o vacío | SPEC-028, sin cambios |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | App ID existente | SDK compartir, **no** se usa para el Pixel |

### 3.3 Tests

- **Unit (Jest):** extender `src/lib/analytics.spec.ts` — `isFbPixelIdValid` (válidos/inválidos/placeholders) + `shouldLoadFbPixel` (tabla 8 combinaciones, espejo de `shouldLoadGtm`); `src/lib/facebook-pixel.spec.ts` — `trackPageView`/`trackEvent` con `window.fbq` mockeado + no-crash sin `window`.
- **Componente (jsdom):** `FacebookPixelGate.spec.tsx` (mock `next/script`): no render sin gate; render + `fbq('init')` con gate; reacciona a `portaqr:consent-changed`; `PageView` en cambio de `pathname`.
- **E2E (Playwright, `e2e-tests-portaqr/tests/analytics/spec-034-fb-pixel-consent.spec.ts`, ~5 tests espejo SPEC-028):** banner en `/` y `/blog`; aceptar inyecta `fbevents.js` sin reload; rechazar = 0 requests a Meta + persistencia; ID vacío = 0 requests aunque consent `accepted`. Servidor con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID=<fixture>`, requests Meta abortadas.

## 4. Mockups / Referencias

- [Meta — Configurar el píxel en tu sitio web (snippet `fbevents.js` + `fbq('init'/'track'))](https://www.facebook.com/business/help/952192354843755) — el gate inyecta el equivalente vía `next/script`
- [Next.js — `next/script` (`afterInteractive` para third-party)](https://nextjs.org/docs/app/api-reference/components/script) — por qué no `<script>` crudo en App Router
- [Next.js — `usePathname` + `useSearchParams` (track PageView en SPA)](https://nextjs.org/docs/app/api-reference/functions/use-pathname) — PageView por cambio de ruta
- Código tocado: `desarrollo-qr/qr-app/src/app/layout.tsx`, `src/app/ClientLayout.tsx`, `src/lib/analytics.ts` (extender), nuevo `src/lib/facebook-pixel.ts`, nuevo `src/components/analytics/FacebookPixelGate.tsx`, `desarrollo-qr/qr-app/.env.example`, `src/app/cookies/page.tsx` (+ `privacidad` si aplica)
- Verificación manual (cuando haya ID real): [Meta Events Manager](https://business.facebook.com/events_manager2) + extensión [Meta Pixel Helper](https://chromewebstore.google.com/detail/meta-pixel-helper/) (PageView en cada ruta, sin PII)

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **A. `FacebookPixelGate` propio (`next/script` + `fbq`, gateado por consent) (elegida)** | Reutiliza banner/triple-gate de SPEC-028, `PageView` SPA correcto, 0 deps nuevas, testeable, respeta App Router | Snippet propio a mantener (estable desde hace años, riesgo bajo) | ✅ **Elegida** — coherente con SPEC-028, V1 mínima |
| B. Etiqueta Custom HTML en GTM (`GTM-NLJXTZG4`) sin código | Cero código en `qr-app` | La etiqueta dispararía fuera del gate de consentimiento del código (el consent vive en `localStorage` del banner, GTM no lo conoce sin Consent Mode); auditoría partida en dos lugares | ❌ Rechazada en V1 — rompe la garantía de privacidad del banner |
| C. Librería `react-facebook-pixel` | API cómoda | Dependencia de terceros para ~20 líneas, última actividad irregular, menos control del gate/SSR | ❌ Rechazada — innecesaria |
| D. Híbrido (gate en código + eventos vía GTM) | Flexibilidad marketer | Dos fuentes de verdad, debugging difícil | 🔜 Posible V2 si marketing lo pide (el helper `trackEvent` ya deja la puerta abierta) |
| E. Sin gate (cargar siempre) | Más simple | Viola Ley 19.628 y la promesa de `/cookies` | ❌ Rechazada por usuario (mismo banner que GTM) |

> [!note] Consideraciones
> - **Rendimiento:** con gate off el costo es 0 bytes de Meta. Con gate on: `fbevents.js` (~70KB, `afterInteractive`, no bloquea LCP). Banner sin cambios (~2KB).
> - **SEO:** el Pixel no afecta crawl; `layout.tsx` sigue server puro salvo islas cliente.
> - **Toolchain (post-SPEC-033):** cero dependencias nuevas (`next/script` es built-in de Next) → no se toca `pnpm-lock.yaml`, `Dockerfile` ni `pnpm-workspace.yaml` (sin entradas nuevas en `allowBuilds`). Comandos con pnpm (`pnpm build`, `pnpm test`, `pnpm exec …`).
> - **Ad-blockers:** pueden bloquear `connect.facebook.net` aunque haya consent — esperado, no es bug (E2E no depende de respuesta real de Meta, solo de inyección/no-inyección del script).
> - **Activación prod (cuando haya ID):** crear pixel en Events Manager → setear `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID=<ID>` en Railway `qr-app` → redeploy (rebuild inlinea `NEXT_PUBLIC_*`) → verificar con Pixel Helper.
> - **V2 futura (no esta SPEC):** `Lead` (contacto), `CompleteRegistration` (SPEC-020), `InitiateCheckout` + `Purchase` con `value/currency` (SPEC-026 Webpay), `Contact`; evaluar Conversions API si el bloqueo por ad-blockers degrada la medición.

---

## 6. Plan de implementación

| # | Paso | Rama |
|---|---|---|
| 1 | Crear rama `feat/spec-034-facebook-pixel` en `qr-app` (desde `main` post-SPEC-033) + baseline (`pnpm exec tsc --noEmit` / `pnpm exec eslint` / `pnpm test` verdes) | `qr-app@feat/spec-034-facebook-pixel` |
| 2 | `isFbPixelIdValid` + `shouldLoadFbPixel` en `src/lib/analytics.ts` + tests unit | misma rama |
| 3 | `src/lib/facebook-pixel.ts` (`fbq` tipado + `trackPageView`/`trackEvent`) + tests | misma rama |
| 4 | `FacebookPixelGate.tsx` + wiring `ClientLayout`/`layout` + spec jsdom | misma rama |
| 5 | `.env.example` documentado + mención Meta en `/cookies` (y `/privacidad` si aplica) | misma rama |
| 6 | E2E `spec-034-fb-pixel-consent.spec.ts` (banner + bloqueo/inyección + PageView SPA, correr con `pnpm exec playwright`) | `e2e-tests-portaqr@feat/spec-034-facebook-pixel` |
| 7 | QA: `pnpm exec tsc --noEmit` + `pnpm exec eslint` + `pnpm test` + `pnpm build` + E2E + actualizar SPEC a `implementado` | — |

## 7. Estado de implementación

| Área | Estado | Notas |
|---|---|---|
| SPEC | ✅ Implementado (2026-09-04) | Decisiones usuario: Pixel ID 24015369744738274, V1 PageView, mismo banner, `fbq` directo. Validada post-SPEC-033 sin conflictos |
| `qr-app` gate + env | ✅ Implementado | Rama `feat/spec-034-facebook-pixel` (commits `5cf1cc7`, `f18e210`, `efa27cb`, `2d7bccd`, `984dba5`): tsc 0, lint 0 errores, jest 83 suites/626 tests, `next build` exit 0 |
| E2E consent | ✅ 5/5 verde | Rama `feat/spec-034-facebook-pixel` en `e2e-tests-portaqr` (commit `9caeab1`): dev temporal :3010 (el :3000 lo ocupa el contenedor Docker viejo) |
| Activación prod | 🔲 Pendiente usuario | Setear en Railway `qr-app`: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID=24015369744738274` y redeploy; verificar con Pixel Helper |
