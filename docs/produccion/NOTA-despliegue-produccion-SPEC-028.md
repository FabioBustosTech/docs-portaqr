---
title: "Nota: Paso a producción — SPEC-028 (Google Tag Manager GTM-NLJXTZG4 con banner de consentimiento)"
date: 2026-09-03
tags:
  - nota-despliegue
  - produccion
  - gtm
  - analytics
  - consentimiento
  - cookies
  - qr-app
aliases:
  - nota despliegue spec 028
  - nota produccion gtm tag manager
---

# Nota: Paso a producción — SPEC-028 (Google Tag Manager GTM-NLJXTZG4 con banner de consentimiento)

> [!abstract] Resumen
> La SPEC-028 instala el container **GTM-NLJXTZG4** con el componente oficial `@next/third-parties/google` (`GoogleTagManager`) en el `RootLayout` (cubre todo el sitio incluido `/blog`), **gateado por triple condición**: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID` válido + consentimiento `accepted` del banner (persistente en `localStorage`, re-abrible desde `/cookies`). El snippet `<noscript>` del manual **no** se inyecta (sin JS no hay consentimiento posible). **2 variables en `qr-app`** (`NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_GTM_ID`), **0 en backend**, 0 migraciones. Se despliega **solo `qr-app`** (más merge sin deploy de `e2e-tests-portaqr`). El deploy es seguro por defecto: sin las variables, GTM jamás carga.

## Requisito previo: container GTM publicado con la etiqueta GA4

1. Entrar a [Google Tag Manager](https://tag.google.com/) → container `GTM-NLJXTZG4`.
2. Verificar que existe la etiqueta **GA4 Configuration** (o Google Analytics: configuración de GA4) con el Measurement ID `G-…` apuntando al data stream de `portaqr.cl`, con activador **Initialization - All Pages** (o el que corresponda).
3. **Enviar → Publicar** una versión del container (sin publicar, `gtm.js` responde pero sin etiquetas).
4. Opcional: verificar con **Tag Assistant** (`Preview`) que el container carga en `https://portaqr.cl` tras el deploy.

## Orden de despliegue

1. **`qr-app`**: merge de `feat/spec-028-google-analytics` → `main` → deploy en Railway (el build instala `@next/third-parties`; sin variables nuevas seteadas, el gate queda OFF y no hay requests a Google).
2. **Activar GTM en Railway** (servicio `qr-app` → Variables):
   - `NEXT_PUBLIC_ENABLE_ANALYTICS=true`
   - `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4`
   - **Redeploy obligatorio**: las `NEXT_PUBLIC_*` se inlinean en build-time, cambiar la variable sin redeploy no tiene efecto.
3. **`e2e-tests-portaqr`**: merge de `feat/spec-028-google-analytics` → `main` (sin deploy; solo suma `tests/analytics/spec-028-ga-consent.spec.ts`).

## Variables de entorno

| Variable                         | Descripción                                                                                                                                                      | ¿Nueva? | Dónde            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------- |
| `NEXT_PUBLIC_ENABLE_ANALYTICS`   | Master switch. Solo el string exacto `true` habilita la inyección (`false` o ausente → GTM jamás carga)                                                          | **Sí**  | qr-app (Railway) |
| `NEXT_PUBLIC_GTM_ID`             | Container ID `GTM-NLJXTZG4` (formato `GTM-` + 4+ alfanuméricos; placeholders no matchean y bloquean la carga)                                                     | **Sí**  | qr-app (Railway) |

> [!warning] Build-time, no runtime
> Ambas son `NEXT_PUBLIC_*`: quedan bakeadas en el bundle. Todo cambio exige **redeploy** del servicio `qr-app`. Verificar en los logs del build que el deploy tomó las variables (un redeploy sin cambios de código igual re-hornea).

> [!note] Sin cambios de infraestructura
> No hay cambios de backend, Mongo, CORS ni R2. `NEXT_PUBLIC_GA_TRACKING_ID` / `NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID` legacy **no se leen** (el Measurement ID vive dentro del container GTM). El banner pesa ~2KB y con el gate OFF el costo Google es 0 bytes.

## Checklist de despliegue

1. **GTM**: etiqueta GA4 existe y hay una **versión publicada** del container.
2. **qr-app**: merge `feat/spec-028-google-analytics` + deploy verde en Railway.
3. **Railway qr-app**: 2 variables seteadas + **redeploy** ejecutado.
4. Verificación post-despliegue (abajo) OK en incógnito.
5. **e2e-tests-portaqr**: merge a `main`.

## Verificación post-despliegue

1. **Banner en primera visita**: abrir `https://portaqr.cl` en ventana de incógnito → aparece el diálogo "Consentimiento de cookies" con botones **Aceptar/Rechazar** y links a `/cookies` y `/privacidad`.
2. **Rechazar bloquea**: clic **Rechazar** → el banner se oculta, `localStorage['portaqr-consent']==='rejected'`, recargar no lo reabre y en DevTools → Network **cero** requests a `googletagmanager.com` / `google-analytics.com`.
3. **Aceptar inyecta**: en otra sesión incógnita, clic **Aceptar** → sin recargar aparece el request `https://www.googletagmanager.com/gtm.js?id=GTM-NLJXTZG4` y `window.dataLayer` queda definido; `localStorage` en `accepted`.
4. **Cobertura blog**: repetir 1–3 en `https://portaqr.cl/blog` (mismo layout, mismo gate).
5. **Re-apertura**: en `https://portaqr.cl/cookies`, botón **"Gestionar preferencias de cookies"** → re-abre el banner.
6. **GTM/GA4 reciben datos**: en GTM → **Tag Assistant** conectado a `portaqr.cl` se ve el container `GTM-NLJXTZG4` disparando; en GA4 → **Informes en tiempo real** aparece la visita de prueba tras aceptar (los ad-blockers pueden bloquearlo: probar sin bloqueador).
7. **Sin regresión**: home, login, dashboard y `/blog/[slug]` cargan igual que antes (el gate retorna `null` cuando no aplica; `layout.tsx` sigue server puro salvo las islas cliente).

## Consideraciones operativas

- **Desactivado = despliegue seguro**: si las variables no están seteadas (o el Measurement ID dentro de GTM no existe), el sitio funciona idéntico a hoy, solo sin tracking. El rollback es setear `NEXT_PUBLIC_ENABLE_ANALYTICS=false` + redeploy.
- **Consentimiento por navegador**: la decisión vive en `localStorage` (`portaqr-consent`), no en el servidor. Cambiar de navegador/dispositivo o limpiar datos vuelve a mostrar el banner (esperado). Multi-tab se sincroniza vía evento `storage`.
- **Ad-blockers**: pueden bloquear `gtm.js` aunque haya consentimiento — no es bug; la medición quedará sub-reportada en ese segmento.
- **Sin PII al dataLayer**: V1 no envía `userId`, email ni IDs internos (RN-4). Si a futuro se quieren eventos custom, usar `sendGTMEvent` de `@next/third-parties/google` (fuera de esta SPEC).
- **E2E en CI**: `tests/analytics/spec-028-ga-consent.spec.ts` requiere el servidor con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_GTM_ID=GTM-NLJXTZG4` (documentado en la cabecera del spec); las requests a Google se abortan y solo se aserta inyección/no-inyección. Si CI corre con env de defecto (gate OFF), los tests de inyección fallan — ver cabecera del spec.

## Referencias

- [[SPEC-028-google-analytics-ga4]] — spec técnica completa (gate triple, banner, trade-offs, plan).
- [[NOTA-despliegue-produccion-SPEC-020]] — patrón de nota de despliegue.
- Google Tag Manager: https://tag.google.com/ — container `GTM-NLJXTZG4`.
- [Next.js — Third Party Libraries: Google Tag Manager](https://nextjs.org/docs/app/guides/third-party-libraries).
