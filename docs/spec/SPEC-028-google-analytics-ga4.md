---
title: "SPEC-028: Google Analytics GA4 con banner de consentimiento en qr-app"
date: 2026-09-03
tags:
  - spec
  - qr-app
  - nextjs
  - analytics
  - ga4
  - privacidad
  - cookies
status: borrador
aliases:
  - SPEC-028
  - GA4 qr-app
---

# SPEC-028: Google Analytics GA4 con banner de consentimiento en qr-app

> [!abstract] Decisión clave
> `qr-app` hoy **no tiene Google Analytics**: solo existen placeholders (`NEXT_PUBLIC_ENABLE_ANALYTICS=false`, `NEXT_PUBLIC_GA_TRACKING_ID` vacío) sin ningún uso en `src/`. Se integra **GA4 con `@next/third-parties/google` (`GoogleAnalytics`)** en el `RootLayout` (cubre todas las rutas incluido `/blog` ISR), **gateado por triple condición**: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GA_TRACKING_ID` válido (`G-XXXXXXXXXX`) + **consentimiento explícito del visitante** (banner acepta/rechaza con persistencia en `localStorage`). Sin Measurement ID aún → se implementa desactivado por defecto y se activa solo con env vars en Railway.

> [!info] Metadatos
> - **Estado:** Borrador (2026-09-03)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-app/` (`src/app/layout.tsx`, `src/app/ClientLayout.tsx`, `src/lib/analytics.ts`, `src/components/analytics/`)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (rutas `/blog` cubiertas por el mismo layout), `/privacidad`, `/cookies`
> - **Decisión usuario (2026-09-03):** sin ID aún (placeholder), con banner de consentimiento, alcance `qr-app + blog`

---

## 1. Objetivo

Medir tráfico y comportamiento en `qr-app` (landing, auth, dashboard, `/blog`) con GA4, respetando privacidad (Ley 19.628): **nada de tracking sin consentimiento**, y **nada roto cuando GA está desactivado**.

| Hoy | Con SPEC-028 |
|---|---|
| Sin medición; placeholders sin uso | GA4 activo solo si flag + ID + consent `accepted` |
| Sin banner de cookies funcional (`/cookies` menciona "panel de primera visita" que no existe) | Banner real acepta/rechaza, enlaza a `/cookies` y `/privacidad`, persistente y re-abrible |
| Riesgo de cargar tracking sin permiso | Por defecto `NEXT_PUBLIC_ENABLE_ANALYTICS=false` + ID vacío → GA nunca carga |

**No es login con Google (SPEC-020) ni Facebook SDK.** Solo analytics de navegación.

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Gate triple).** `<GoogleAnalytics>` solo se renderiza si:
  1. `NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'`, **y**
  2. `NEXT_PUBLIC_GA_TRACKING_ID` matchea `/^G-[A-Z0-9]{4,}$/`, **y**
  3. consentimiento en `localStorage['portaqr-consent'] === 'accepted'`.
  - Si cualquiera falla → no se inyecta ningún script de Google. La app funciona idéntico.
- **RF-2 (Banner).** En primera visita (sin decisión guardada) se muestra banner fijo inferior:
  - Texto breve + links a `/cookies` y `/privacidad`.
  - Botones `Aceptar` y `Rechazar` (ambos cierran y persisten; `Aceptar` habilita GA en caliente sin reload).
  - Accesible: `role="dialog"`, `aria-label`, foco en botones, respeta `prefers-reduced-motion`.
  - No bloquea navegación; z-index bajo header/modal.
- **RF-3 (Persistencia y cambio de opinión).** `localStorage['portaqr-consent'] = 'accepted' | 'rejected'`. Desde `/cookies` hay botón "Gestionar preferencias" que re-abre el banner (evento `portaqr:open-consent` o prop dedicada).
- **RF-4 (Cobertura total).** Wiring en `RootLayout`/`ClientLayout` → cubre `/`, `/blog`, `/blog/[slug]`, `/blog/categoria/[slug]`, dashboard y auth sin tocar cada página.
- **RF-5 (Sin ID = sin tracking).** Con valores actuales (`.env`: `false` + vacío) el build y runtime no emiten requests a `googletagmanager.com` / `google-analytics.com`.

### 2.2 Reglas de negocio

- **RN-1 (Reutilizar env vars existentes).** No crear nuevos nombres. Fuente de verdad: `NEXT_PUBLIC_ENABLE_ANALYTICS` + `NEXT_PUBLIC_GA_TRACKING_ID`. El duplicado legacy `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID` se documenta como **deprecado** (no se lee en código).
- **RN-2 (NEXT_PUBLIC_* = build time).** Cambiar flag/ID requiere rebuild (documentado en `.env.example`). En Railway se setean como variables del servicio `qr-app`.
- **RN-3 (SSR-safe).** Todo acceso a `localStorage`/`window` via `safeLocalStorage` (`src/utils/browser.ts`) o guard `typeof window !== 'undefined'`. Nunca crashear en prerender.
- **RN-4 (Sin PII).** No enviar `userId`, email ni IDs internos a GA. Solo pageviews/eventos genéricos del componente oficial. Anonimización IP es default de GA4.
- **RN-5 (V1 = gate binario).** No se implementa Google Consent Mode v2 avanzado (`gtag('consent', ...)`) en V1; el gate es cargar/no-cargar el componente. Se deja como trabajo futuro documentado.

### 2.3 Criterios de aceptación

- [ ] **CA-01 (Desactivado por defecto).** Con `.env` actual (`false` + vacío): `npm run build` OK, home renderiza, banner aparece en primera visita, **cero** requests a Google (verificable en DevTools Network y en E2E interceptando `googletagmanager`).
- [ ] **CA-02 (Aceptar habilita).** Con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GA_TRACKING_ID=G-TEST1234` (env de test): tras clic `Aceptar`, `localStorage['portaqr-consent']==='accepted'` y el script GA se inyecta sin reload.
- [ ] **CA-03 (Rechazar bloquea).** Tras clic `Rechazar`: `localStorage==='rejected'`, banner se oculta y GA **no** se inyecta aunque flag+ID sean válidos. Recargar mantiene decisión (banner no reaparece).
- [ ] **CA-04 (ID inválido bloquea).** Con flag `true` pero ID `your_ga_tracking_id` o vacío: ni siquiera con consent `accepted` se inyecta GA.
- [ ] **CA-05 (Blog cubierto).** `/blog` y `/blog/[slug]` montan el mismo layout → banner y gate aplican igual (E2E visita `/blog` en primera visita y ve banner).
- [ ] **CA-06 (Calidad).** `tsc --noEmit`, `eslint`, `jest` verdes; `.env.example` documenta las 2 vars (qué hace, valores, build-time, ejemplo `G-XXXXXXXXXX`); E2E Playwright del flujo banner en `e2e-tests-portaqr`.

## 3. Diseño Técnico

### 3.1 Arquitectura

```
src/app/layout.tsx (server)
 └─ <ClientLayout>
     ├─ <AuthProvider>…</AuthProvider>
     ├─ <GoogleAnalyticsGate gaId enabled />   ← client, lee consent, renderiza <GoogleAnalytics> si triple-gate OK
     ├─ <CookieConsentBanner />                ← client, lee/escribe localStorage, emite cambio
     └─ {children} (incluye /blog ISR)
```

- **`src/lib/analytics.ts`** (puro, testeable sin DOM):
  - `ANALYTICS_CONSENT_KEY = 'portaqr-consent'`
  - `isGaIdValid(id?: string): boolean` → `/^G-[A-Z0-9]{4,}$/`
  - `isAnalyticsEnabledFlag(flag?: string): boolean` → `flag === 'true'`
  - `shouldLoadGa({enabled, gaId, consent}): boolean` → triple-gate
  - `getConsent()/setConsent()/clearConsent()` sobre `safeLocalStorage`
- **`src/components/analytics/CookieConsentBanner.tsx`** (`'use client'`):
  - `useState` + `useEffect`: si `getConsent() === null` → visible.
  - Escucha evento `window 'portaqr:open-consent'` para re-abrir desde `/cookies`.
  - `Aceptar` → `setConsent('accepted')` + `window.dispatchEvent(new Event('portaqr:consent-changed'))`; `Rechazar` → `'rejected'`.
- **`src/components/analytics/GoogleAnalyticsGate.tsx`** (`'use client'`):
  - Props `{ gaId: string; enabled: boolean }` (leídas en server layout desde `process.env` y pasadas como props → evita `NEXT_PUBLIC_*` en cliente salvo lo necesario).
  - `useState consent` + `useEffect` suscribe `portaqr:consent-changed` + `storage` event (multi-tab).
  - `if (!shouldLoadGa(...)) return null` else `<GoogleAnalytics gaId={gaId} />`.
- **`layout.tsx`**: lee `process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true'` y `process.env.NEXT_PUBLIC_GA_TRACKING_ID ?? ''`, los pasa a `ClientLayout` → `GoogleAnalyticsGate`. No expone nada más.
- **`/cookies`**: botón "Gestionar preferencias de cookies" → `window.dispatchEvent(new Event('portaqr:open-consent'))`.

### 3.2 Contratos / env vars

| Variable | Valores | Efecto |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `true`/`false` (default `false`) | Master switch. `false` → GA jamás carga |
| `NEXT_PUBLIC_GA_TRACKING_ID` | `G-XXXXXXXXXX` o vacío (default vacío) | ID GA4. Debe matchear `/^G-[A-Z0-9]{4,}$/` |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID` | legacy | **Deprecada**, no se lee; solo documentada para no romper enigmas |

### 3.3 Tests

- **Unit (Jest):** `src/lib/analytics.spec.ts` — tabla de `shouldLoadGa` (8 combinaciones), `isGaIdValid` (válidos/inválidos), consent get/set con mock `localStorage`.
- **Componente (jsdom, `@jest-environment jsdom`):** `CookieConsentBanner.spec.tsx` (aparece sin consent, aceptar/rechaza persisten y ocultan, re-apertura por evento) + `GoogleAnalyticsGate.spec.tsx` (mock `@next/third-parties/google` → no render sin gate, render con gate; responde a `portaqr:consent-changed`). Mock del módulo third-parties para no cargar red.
- **E2E (Playwright, `e2e-tests-portaqr/tests/spec-028-ga-consent.spec.ts`):** primera visita ve banner en `/` y `/blog`; aceptar persiste (`localStorage`) y no reaparece al recargar; rechazar bloquea requests `*googletagmanager*`/`*google-analytics*` (route abort + assert 0); con flag off default GA nunca carga.

## 4. Mockups / Referencias

- [Next.js — Third Party Libraries: Google Analytics](https://nextjs.org/docs/app/guides/third-party-libraries) — patrón `<GoogleAnalytics gaId>` en RootLayout
- [`@next/third-parties` — `sendGAEvent`](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/third-party-libraries.mdx) (futuro: eventos custom, fuera de V1)
- Código tocado: `desarrollo-qr/qr-app/src/app/layout.tsx`, `src/app/ClientLayout.tsx`, nuevo `src/lib/analytics.ts`, nuevo `src/components/analytics/`, `desarrollo-qr/qr-app/.env.example`, `desarrollo-qr/qr-app/src/app/cookies/page.tsx` (botón gestionar)
- Páginas legales existentes: `/privacidad`, `/cookies` (el banner enlaza ahí)

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **A. `@next/third-parties/google` + gate + banner (elegida)** | Oficial Vercel, optimiza carga (`afterInteractive`), 1 línea de script, soporta Next 16, testeable | Añade dependencia; eventos custom requieren `sendGAEvent` aparte (V2) | ✅ **Elegida** — estándar, mínimo mantenimiento |
| B. `<Script src="googletagmanager/gtag/js">` manual | Sin dependencia nueva, control total | Más código, fácil equivocarse (strategy, `dataLayer`, duplicados), hay que mantenerlo | ❌ Más churn sin beneficio |
| C. Google Tag Manager (GTM) | Flexibilidad marketer (tags sin deploy) | Sobre-ingeniería para V1, más peso, más superficie privacidad | ❌ Futuro si marketing lo pide |
| D. Sin banner (cargar siempre) | Más simple | Incumple expectativa de `/cookies` ("panel de primera visita") y Ley 19.628 | ❌ Rechazada por usuario |
| E. Consent Mode v2 (`gtag consent default denied/update granted`) | Granularidad por tipo (analytics/ads) | Complejidad V1 sin necesidad; gate binario ya cumple | 🔜 V2 futura |

> [!note] Consideraciones
> - **Rendimiento:** `GoogleAnalytics` usa estrategia optimizada; con gate off el costo es 0 bytes de Google. Banner es ~2KB cliente.
> - **SEO:** scripts GA no afectan crawl; `layout.tsx` sigue server puro salvo islas cliente.
> - **Activación prod:** setear `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GA_TRACKING_ID=G-...` en Railway `qr-app` y redeploy (rebuild inlinea `NEXT_PUBLIC_*`).
> - **Ad-blockers:** pueden bloquear GA aunque haya consent — esperado, no es bug (E2E no debe depender de respuesta real de Google, solo de inyección/no-inyección del script).

---

## 6. Plan de implementación

| # | Paso | Rama |
|---|---|---|
| 1 | Instalar `@next/third-parties` en `qr-app` + crear rama `feat/spec-028-google-analytics` | `qr-app@feat/spec-028-google-analytics` |
| 2 | `src/lib/analytics.ts` + `analytics.spec.ts` (gate puro) | misma rama |
| 3 | `CookieConsentBanner.tsx` + spec jsdom | misma rama |
| 4 | `GoogleAnalyticsGate.tsx` + wiring `ClientLayout`/`layout` + spec | misma rama |
| 5 | `.env.example` documentado + botón re-apertura en `/cookies` | misma rama |
| 6 | E2E `spec-028-ga-consent.spec.ts` (banner + bloqueo/inyección) | `e2e-tests-portaqr@feat/spec-028-google-analytics` |
| 7 | QA: `tsc/lint/jest/build` + E2E + actualizar SPEC a `implementado` | — |

## 7. Estado de implementación

| Área | Estado | Notas |
|---|---|---|
| SPEC | 🟡 Borrador | Pendiente implementación |
| `qr-app` gate + banner | ⬜ Pendiente | — |
| E2E consent | ⬜ Pendiente | — |
