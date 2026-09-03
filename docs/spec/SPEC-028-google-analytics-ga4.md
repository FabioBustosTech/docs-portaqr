---
title: "SPEC-028: Google Tag Manager con banner de consentimiento en qr-app"
date: 2026-09-03
tags:
  - spec
  - qr-app
  - nextjs
  - analytics
  - gtm
  - privacidad
  - cookies
status: implementado
aliases:
  - SPEC-028
  - GTM qr-app
---

# SPEC-028: Google Tag Manager con banner de consentimiento en qr-app

> [!abstract] Decisión clave
> `qr-app` no tenía medición. Se integra el container **GTM-NLJXTZG4** con el componente oficial `@next/third-parties/google` (`GoogleTagManager`, equivale al snippet `gtm.js` + `dataLayer`) en el `RootLayout` (cubre todas las rutas incluido `/blog` ISR), **gateado por triple condición**: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID` válido + **consentimiento explícito** (banner acepta/rechaza persistente). El snippet `<noscript>` del manual **no** se inyecta: sin JS el banner no puede pedir consentimiento. **Pivot 2026-09-03:** la SPEC nació como GA4-directo y el usuario pidió su snippet GTM → se migró a `GoogleTagManager` manteniendo gate, banner y env flag.

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-03)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-app/` (`src/app/layout.tsx`, `src/app/ClientLayout.tsx`, `src/lib/analytics.ts`, `src/components/analytics/`)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (rutas `/blog` cubiertas por el mismo layout), `/privacidad`, `/cookies`
> - **Decisión usuario (2026-09-03):** container GTM-NLJXTZG4 (snippet aportado), con banner de consentimiento, alcance `qr-app + blog`. `NEXT_PUBLIC_GTM_ID` es variable de entorno (el ID solo aparece literal en tests y comentarios).

---

## 1. Objetivo

Medir tráfico y comportamiento en `qr-app` (landing, auth, dashboard, `/blog`) con GA4, respetando privacidad (Ley 19.628): **nada de tracking sin consentimiento**, y **nada roto cuando GA está desactivado**.

| Hoy | Con SPEC-028 |
|---|---|
| Sin medición; placeholders sin uso | GTM activo solo si flag + container ID + consent `accepted` |
| Sin banner de cookies funcional (`/cookies` menciona "panel de primera visita" que no existe) | Banner real acepta/rechaza, enlaza a `/cookies` y `/privacidad`, persistente y re-abrible |
| Riesgo de cargar tracking sin permiso | Por defecto `NEXT_PUBLIC_ENABLE_ANALYTICS=false` + `NEXT_PUBLIC_GTM_ID` vacío → GTM nunca carga |

**No es login con Google (SPEC-020) ni Facebook SDK.** Solo medición vía el container GTM (las etiquetas GA4/ads viven dentro del container).

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Gate triple).** `<GoogleTagManager>` solo se renderiza si:
  1. `NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'`, **y**
  2. `NEXT_PUBLIC_GTM_ID` matchea `/^GTM-[A-Z0-9]{4,}$/`, **y**
  3. consentimiento en `localStorage['portaqr-consent'] === 'accepted'`.
  - Si cualquiera falla → no se inyecta ningún script de Google. La app funciona idéntico.
- **RF-2 (Banner).** En primera visita (sin decisión guardada) se muestra banner fijo inferior:
  - Texto breve + links a `/cookies` y `/privacidad`.
  - Botones `Aceptar` y `Rechazar` (ambos cierran y persisten; `Aceptar` habilita GTM en caliente sin reload).
  - Accesible: `role="dialog"`, `aria-label`, respeta `prefers-reduced-motion`.
  - No bloquea navegación; z-index bajo header/modal.
- **RF-3 (Persistencia y cambio de opinión).** `localStorage['portaqr-consent'] = 'accepted' | 'rejected'`. Desde `/cookies` hay botón "Gestionar preferencias" que re-abre el banner (evento `portaqr:open-consent` o prop dedicada).
- **RF-4 (Cobertura total).** Wiring en `RootLayout`/`ClientLayout` → cubre `/`, `/blog`, `/blog/[slug]`, `/blog/categoria/[slug]`, dashboard y auth sin tocar cada página.
- **RF-5 (Sin ID = sin tracking).** Con valores por defecto (`false` + vacío): `npm run build` OK, home renderiza, banner aparece en primera visita, **cero** requests a Google.

### 2.2 Reglas de negocio

- **RN-1 (GTM_ID es env var).** Fuente de verdad: `NEXT_PUBLIC_ENABLE_ANALYTICS` + `NEXT_PUBLIC_GTM_ID` (leídas en server `layout.tsx`, pasadas como props al gate). El ID nunca va hardcodeado en código productivo (solo aparece en tests como fixture y en comentarios). Legacy `NEXT_PUBLIC_GA_TRACKING_ID` / `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID`: **no se leen** (el Measurement ID vive dentro del container GTM).
- **RN-2 (NEXT_PUBLIC_* = build time).** Cambiar flag/ID requiere rebuild (documentado en `.env.example`). En Railway se setean como variables del servicio `qr-app`.
- **RN-3 (SSR-safe).** Todo acceso a `localStorage`/`window` via `safeLocalStorage` (`src/utils/browser.ts`) o guard `typeof window !== 'undefined'`. Nunca crashear en prerender.
- **RN-4 (Sin PII).** No enviar `userId`, email ni IDs internos a GA. Solo pageviews/eventos genéricos del componente oficial. Anonimización IP es default de GA4.
- **RN-5 (V1 = gate binario).** No se implementa Google Consent Mode v2 avanzado (`gtag('consent', ...)`) en V1; el gate es cargar/no-cargar el componente. Se deja como trabajo futuro documentado.

### 2.3 Criterios de aceptación

- [ ] **CA-01 (Desactivado por defecto).** Con valores por defecto (`false` + vacío): `npm run build` OK, home renderiza, banner aparece en primera visita, **cero** requests a Google (verificable en DevTools Network y en E2E interceptando `googletagmanager`).
- [ ] **CA-02 (Aceptar habilita).** Con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4`: tras clic `Aceptar`, `localStorage['portaqr-consent']==='accepted'` y `gtm.js?id=GTM-NLJXTZG4` se inyecta sin reload.
- [ ] **CA-03 (Rechazar bloquea).** Tras clic `Rechazar`: `localStorage==='rejected'`, banner se oculta y GTM **no** se inyecta aunque flag+ID sean válidos. Recargar mantiene decisión (banner no reaparece).
- [ ] **CA-04 (ID inválido bloquea).** Con flag `true` pero ID vacío/placeholder: ni siquiera con consent `accepted` se inyecta GTM.
- [ ] **CA-05 (Blog cubierto).** `/blog` y `/blog/[slug]` montan el mismo layout → banner y gate aplican igual (E2E visita `/blog` en primera visita y ve banner).
- [ ] **CA-06 (Calidad).** `tsc --noEmit`, `eslint`, `jest` verdes; `.env.example` documenta las 2 vars (qué hace, valores, build-time, ejemplo `G-XXXXXXXXXX`); E2E Playwright del flujo banner en `e2e-tests-portaqr`.

## 3. Diseño Técnico

### 3.1 Arquitectura

```
src/app/layout.tsx (server)
 └─ <ClientLayout gtmId enabled>
     ├─ <AuthProvider>…</AuthProvider>
     ├─ <GoogleTagManagerGate gtmId enabled /> ← client, lee consent, renderiza <GoogleTagManager> si triple-gate OK
     ├─ <CookieConsentBanner />                ← client, lee/escribe localStorage, emite cambio
     └─ {children} (incluye /blog ISR)
```

- **`src/lib/analytics.ts`** (puro, testeable sin DOM):
  - `ANALYTICS_CONSENT_KEY = 'portaqr-consent'`
  - `isGtmIdValid(id?: string): boolean` → `/^GTM-[A-Z0-9]{4,}$/` (+ rechazo de placeholders)
  - `isAnalyticsEnabledFlag(flag?: string): boolean` → `flag === 'true'`
  - `shouldLoadGtm({enabled, gtmId, consent}): boolean` → triple-gate
  - `getConsent()/setConsent()/clearConsent()` sobre `safeLocalStorage`
  - (`isGaIdValid`/`shouldLoadGa` quedan `@deprecated` por el pivot, con tests.)
- **`src/components/analytics/CookieConsentBanner.tsx`** (`'use client'`): sin cambios (ver §2.1 RF-2).
- **`src/components/analytics/GoogleTagManagerGate.tsx`** (`'use client'`):
  - Props `{ gtmId: string; enabled: boolean }` (leídas en server layout desde `process.env`).
  - `useState consent` + `useEffect` suscribe `portaqr:consent-changed` + `storage` event (multi-tab).
  - `if (!shouldLoadGtm(...)) return null` else `<GoogleTagManager gtmId={gtmId} />` (inyecta `dataLayer` + `gtm.js?id=`; el `<noscript>` del manual se omite por RN-privacidad).
- **`layout.tsx`**: lee `process.env.NEXT_PUBLIC_GTM_ID ?? ''` y `process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'`, los pasa a `ClientLayout` → `GoogleTagManagerGate`. Sin cambios en cada página.
- **`/cookies`**: botón `CookiePreferencesButton` ("Gestionar preferencias de cookies") → `window.dispatchEvent(new Event('portaqr:open-consent'))`.

### 3.2 Contratos / env vars

| Variable | Valores | Efecto |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `true`/`false` (default `false`) | Master switch. `false` → GTM jamás carga |
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` o vacío (default vacío) | Container ID. Debe matchear `/^GTM-[A-Z0-9]{4,}$/`; prod: `GTM-NLJXTZG4` |
| `NEXT_PUBLIC_GA_TRACKING_ID` / `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID` | legacy | **No se leen** (el Measurement ID vive dentro del container GTM) |

### 3.3 Tests

- **Unit (Jest):** `src/lib/analytics.spec.ts` — `isGtmIdValid`, `shouldLoadGtm` (8 combinaciones), consent get/set; legacy GA-rate como deprecated.
- **Componente (jsdom, `@jest-environment jsdom`):** `CookieConsentBanner.spec.tsx` (6), `GoogleTagManagerGate.spec.tsx` (6, mock `@next/third-parties/google`), `CookiePreferencesButton.spec.tsx` (1).
- **E2E (Playwright, `e2e-tests-portaqr/tests/analytics/spec-028-ga-consent.spec.ts`, 5 tests):** banner en `/` y `/blog`; aceptar inyecta `gtm.js?id=GTM-NLJXTZG4` sin reload; rechazar = 0 requests + persistencia; `/cookies` re-abre. Servidor con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4`, requests Google abortadas.

## 4. Mockups / Referencias

- [Next.js — Third Party Libraries: Google Tag Manager](https://nextjs.org/docs/app/guides/third-party-libraries) — patrón `<GoogleTagManager gtmId>` en RootLayout (inyecta `dataLayer` + `gtm.js?id=`; equivale al snippet manual del container)
- Snippet aportado por usuario (container `GTM-NLJXTZG4`): implementado vía el componente oficial + gate de consentimiento; el `<noscript>` no se inyecta (sin JS no hay consentimiento posible)
- [`@next/third-parties` — `sendGTMEvent`](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx) (futuro: eventos custom, fuera de V1)
- Código tocado: `desarrollo-qr/qr-app/src/app/layout.tsx`, `src/app/ClientLayout.tsx`, nuevo `src/lib/analytics.ts`, nuevo `src/components/analytics/` (Banner + Gate + PreferencesButton), `desarrollo-qr/qr-app/.env.example`, `desarrollo-qr/qr-app/src/app/cookies/page.tsx` (botón gestionar)
- Páginas legales existentes: `/privacidad`, `/cookies` (el banner enlaza ahí)

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **A. `@next/third-parties/google` `GoogleTagManager` + gate + banner (elegida)** | Oficial Vercel, equivale al snippet del container, 1 línea de script, soporta Next 16, testeable, respeta App Router/hidratación | Eventos custom requieren `sendGTMEvent` aparte (V2) | ✅ **Elegida** — estándar, mínimo mantenimiento |
| B. Pegar el snippet manual (`<script>` en head + `<noscript>` en body) | Literal a la doc de Google | En App Router el `<script>` crudo rompe optimizaciones/hidratación; el `<noscript>` cargaría GTM sin consentimiento (viola privacidad) | ❌ Rechazada — el componente oficial hace lo mismo bien |
| C. GA4-directo (`GoogleAnalytics` + `G-XXX`) | Sin container intermedio | El usuario pidió su container GTM; doble instrumentación si conviven | 🔄 Foi spike inicial, pivotado a A por petición del usuario |
| D. Sin banner (cargar siempre) | Más simple | Incumple expectativa de `/cookies` ("panel de primera visita") y Ley 19.628 | ❌ Rechazada por usuario |
| E. Consent Mode v2 (`gtag consent default denied/update granted`) | Granularidad por tipo (analytics/ads) | Complejidad V1 sin necesidad; gate binario ya cumple (se configura dentro del container GTM si se requiere) | 🔜 V2 futura |

> [!note] Consideraciones
> - **Rendimiento:** `GoogleTagManager` usa estrategia optimizada; con gate off el costo es 0 bytes de Google. Banner es ~2KB cliente.
> - **SEO:** scripts GTM no afectan crawl; `layout.tsx` sigue server puro salvo islas cliente.
> - **Activación prod:** setear `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4` en Railway `qr-app` y redeploy (rebuild inlinea `NEXT_PUBLIC_*`).
> - **Ad-blockers:** pueden bloquear GTM aunque haya consent — esperado, no es bug (E2E no depende de respuesta real de Google, solo de inyección/no-inyección del script).

---

## 6. Plan de implementación

| # | Paso | Rama |
|---|---|---|
| 1 | Instalar `@next/third-parties` en `qr-app` + crear rama `feat/spec-028-google-analytics` | `qr-app@feat/spec-028-google-analytics` |
| 2 | `src/lib/analytics.ts` + `analytics.spec.ts` (gate puro) | misma rama |
| 3 | `CookieConsentBanner.tsx` + spec jsdom | misma rama |
| 4 | `GoogleTagManagerGate.tsx` + wiring `ClientLayout`/`layout` + spec | misma rama |
| 5 | `.env.example` documentado + botón re-apertura en `/cookies` | misma rama |
| 6 | E2E `spec-028-ga-consent.spec.ts` (banner + bloqueo/inyección) | `e2e-tests-portaqr@feat/spec-028-google-analytics` |
| 7 | QA: `tsc/lint/jest/build` + E2E + actualizar SPEC a `implementado` | — |

## 7. Estado de implementación

| Área | Estado | Notas |
|---|---|---|
| SPEC | ✅ Implementado (2026-09-03) | Pivot GA4→GTM por snippet del usuario |
| `qr-app` gate + banner + env | ✅ Implementado | Rama `feat/spec-028-google-analytics` (commits `8a7b1e9`, `94f2f96`, `2d4b06d`, `efafc29`, `7dcd353`, `de5a985`): tsc 0, lint 0 errores, jest 71 suites/535 tests, `next build` exit 0 |
| E2E consent | ✅ 5/5 verde | Rama `feat/spec-028-google-analytics` en `e2e-tests-portaqr` (commit `4e8439e`) |
| Activación prod | 🔲 Pendiente usuario | Setear en Railway `qr-app`: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4` y redeploy |
