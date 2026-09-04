---
title: "Nota: Paso a producción — SPEC-034 (Pixel de Meta 24015369744738274 con banner de consentimiento)"
date: 2026-09-04
tags:
  - nota-despliegue
  - produccion
  - meta
  - facebook-pixel
  - analytics
  - consentimiento
  - cookies
  - qr-app
aliases:
  - nota despliegue spec 034
  - nota produccion pixel meta facebook
---

# Nota: Paso a producción — SPEC-034 (Pixel de Meta 24015369744738274 con banner de consentimiento)

> [!abstract] Resumen
> La SPEC-034 instala el Pixel de Meta **`24015369744738274`** con el componente propio `FacebookPixelGate` (`next/script` + `fbevents.js`, snippet oficial) en el `RootLayout` (cubre todo el sitio incluido `/blog`), **gateado por la misma triple condición de SPEC-028**: `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID` válido + consentimiento `accepted` del banner (persistente en `localStorage`, re-abrible desde `/cookies`). El `<noscript><img>` del manual **no** se inyecta (sin JS no hay consentimiento posible). V1 = solo evento `PageView`. **1 variable nueva en `qr-app`** (`NEXT_PUBLIC_FB_PIXEL_ID`; `NEXT_PUBLIC_ENABLE_ANALYTICS` se reutiliza), **0 en backend**, 0 dependencias nuevas, 0 migraciones. Se despliega **solo `qr-app`** (más merge sin deploy de `e2e-tests-portaqr`). El deploy es seguro por defecto: sin las variables, el Pixel jamás carga. **Ojo: se agregó `ARG NEXT_PUBLIC_FB_PIXEL_ID` al `Dockerfile`** (sin esto Railway hornea el ID vacío aunque exista en el dashboard — mismo incidente de SPEC-028).

## Requisito previo: píxel creado en Events Manager

1. El píxel ya existe: **ID `24015369744738274`** (Events Manager → Fuentes de datos → Configuración → "ID del conjunto de datos").
2. No hay que pegar ningún código en el sitio: `qr-app` inyecta el snippet oficial vía `FacebookPixelGate` (init + `PageView` + PageView por cambio de ruta).
3. Opcional: instalar la extensión **Meta Pixel Helper** (Chrome Web Store) para la verificación post-despliegue.

## Orden de despliegue

1. **`qr-app`**: merge de `feat/spec-034-facebook-pixel` → `main` → deploy en Railway. Incluye el fix `a2f9694` (`ARG NEXT_PUBLIC_FB_PIXEL_ID` en la etapa `builder`); sin variables nuevas seteadas, el gate queda OFF y no hay requests a Meta.
2. **Activar el Pixel en Railway** (servicio `qr-app` → Variables):
   - `NEXT_PUBLIC_ENABLE_ANALYTICS=true` (si GTM ya está activo, esta ya existe: verificar que siga en `true`)
   - `NEXT_PUBLIC_FB_PIXEL_ID=24015369744738274`
   - **Redeploy obligatorio**: las `NEXT_PUBLIC_*` se inlinean en build-time, cambiar la variable sin redeploy no tiene efecto.
3. **`e2e-tests-portaqr`**: merge de `feat/spec-034-facebook-pixel` → `main` (sin deploy; solo suma `tests/analytics/spec-034-fb-pixel-consent.spec.ts`).

## Variables de entorno

| Variable                       | Descripción                                                                                                                                                             | ¿Nueva?                                  | Dónde            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Master switch **compartido** GTM + Pixel. Solo el string exacto `true` habilita (`false` o ausente → ninguno carga)                                                     | No (SPEC-028; verificar que siga `true`) | qr-app (Railway) |
| `NEXT_PUBLIC_FB_PIXEL_ID`      | Pixel ID `24015369744738274` (8–20 dígitos; placeholders no matchean y bloquean la carga). **Distinto** de `NEXT_PUBLIC_FACEBOOK_APP_ID` (SDK de compartir, no se toca) | **Sí**                                   | qr-app (Railway) |

> [!warning] Build-time, no runtime
> Ambas son `NEXT_PUBLIC_*`: quedan bakeadas en el bundle. Todo cambio exige **redeploy** del servicio `qr-app`. Verificar en los logs del build que el deploy tomó las variables (un redeploy sin cambios de código igual re-hornea).

> [!important] Railway + Dockerfile: ARG declarado en la rama (incidente SPEC-028 no se repite)
> Railway solo inyecta variables al build Dockerfile si están declaradas con `ARG` en la etapa que las usa. El commit `a2f9694` (`fix/spec-034`) agrega `ARG NEXT_PUBLIC_FB_PIXEL_ID=""` en la etapa `builder` (default = gate OFF, comportamiento local sin cambios). Si el deploy compila el píxel apagado pese a las variables seteadas, lo primero que hay que revisar es que ese `ARG` esté en la imagen construida.

> [!note] Sin cambios de infraestructura
> No hay cambios de backend, Mongo, CORS ni R2. Cero dependencias nuevas (`next/script` es built-in: `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `allowBuilds` intactos). El banner pesa lo mismo (~2KB, sin cambios) y con el gate OFF el costo Meta es 0 bytes.

## Checklist de despliegue

1. **Meta**: el píxel `24015369744738274` existe en Events Manager (fuente de datos Web).
2. **qr-app**: merge `feat/spec-034-facebook-pixel` (6 commits, incluye el fix `ARG`) + deploy verde en Railway.
3. **Railway qr-app**: 2 variables seteadas + **redeploy** ejecutado.
4. Verificación post-despliegue (abajo) OK en incógnito.
5. **e2e-tests-portaqr**: merge a `main`.

## Verificación post-despliegue

> [!success] Verificado en producción 2026-09-04
> Validación directa en `https://portaqr.cl` con navegador automatizado: consent `accepted` → `fbevents.js` + `signals/config/24015369744738274` + `app_config/json/24015369744738274` (200), `window.fbq` function v2.9.393 con cola vacía (flusheada), `facebook.com/tr/?id=24015369744738274&ev=PageView` 200 en `/` y en `/precios` (sin PII en params), `gtm.js?id=GTM-NLJXTZG4` intacto. Primera visita muestra el banner; **Rechazar** → banner oculto, consent `rejected`, `fbq`/`dataLayer` undefined y cero scripts de tracking. Ramas mergeadas a `main` y eliminadas.

1. **Banner en primera visita**: abrir `https://portaqr.cl` en ventana de incógnito → aparece el diálogo "Consentimiento de cookies" con botones **Aceptar/Rechazar** y links a `/cookies` y `/privacidad`.
2. **Rechazar bloquea**: clic **Rechazar** → el banner se oculta, `localStorage['portaqr-consent']==='rejected'`, recargar no lo reabre y en DevTools → Network **cero** requests a `connect.facebook.net` / `facebook.com/tr`.
3. **Aceptar inyecta**: en otra sesión incógnita, clic **Aceptar** → sin recargar aparece el request `https://connect.facebook.net/en_US/fbevents.js` y `typeof window.fbq === 'function'`; `localStorage` en `accepted`.
4. **PageView por ruta**: navegar a `/precios` (o `/blog`) → en Network aparece request `https://www.facebook.com/tr/?id=24015369744738274&ev=PageView…`.
5. **Meta Pixel Helper**: con la extensión instalada, el icono se pone en verde y muestra el píxel `24015369744738274` con evento `PageView` en cada ruta.
6. **Events Manager recibe datos**: en Events Manager → el dataset → **Probar eventos** (o Vista general / actividad reciente) aparece la visita de prueba tras aceptar (los ad-blockers pueden bloquearlo: probar sin bloqueador).
7. **Cobertura blog**: repetir 1–4 en `https://portaqr.cl/blog` (mismo layout, mismo gate).
8. **Re-apertura**: en `https://portaqr.cl/cookies`, botón **"Gestionar preferencias de cookies"** → re-abre el banner; la sección Marketing menciona al Pixel de Meta.
9. **GTM intacto**: si GTM estaba activo, `gtm.js?id=GTM-NLJXTZG4` sigue inyectándose con el mismo consentimiento (gates independientes, mismo banner).
10. **Sin regresión**: home, login, dashboard y `/blog/[slug]` cargan igual que antes.

## Consideraciones operativas

- **Desactivado = despliegue seguro**: si las variables no están seteadas, el sitio funciona idéntico a hoy, solo sin tracking Meta. El rollback es setear `NEXT_PUBLIC_ENABLE_ANALYTICS=false` (o vaciar `NEXT_PUBLIC_FB_PIXEL_ID`) + redeploy. GTM no se ve afectado (gate independiente).
- **Consentimiento por navegador**: la decisión vive en `localStorage` (`portaqr-consent`), no en el servidor. Cambiar de navegador/dispositivo o limpiar datos vuelve a mostrar el banner (esperado). Multi-tab se sincroniza vía evento `storage`.
- **Ad-blockers**: pueden bloquear `connect.facebook.net` aunque haya consentimiento — no es bug; la medición quedará sub-reportada en ese segmento (futura V2: evaluar Conversions API).
- **Sin PII a Meta**: V1 solo envía `PageView` estándar, sin email/teléfono/`userId` ni Advanced Matching (RN-4). Eventos de funnel (`Lead`, `Purchase`…) quedan para V2 con `trackEvent` (ya implementado como API, sin llamadores).
- **E2E en CI**: `tests/analytics/spec-034-fb-pixel-consent.spec.ts` requiere el servidor con `NEXT_PUBLIC_ENABLE_ANALYTICS=true` + `NEXT_PUBLIC_FB_PIXEL_ID=24015369744738274` (documentado en la cabecera del spec); las requests a Meta se abortan y CA-05 lee la cola del stub `window.fbq` (con la librería abortada no hay requests `facebook.com/tr` observables). Si CI corre con env de defecto (gate OFF), los tests de inyección fallan — ver cabecera del spec.
- **Puertos en local**: el E2E se validó contra dev temporal en `:3010` (`BASE_URL=http://localhost:3010`) porque el `:3000` lo ocupa el contenedor Docker `qr-app` (imagen pre-SPEC-034). Nada queda corriendo tras la validación.

## Referencias

- [[SPEC-034-facebook-pixel-qr-app]] — spec técnica completa (gate triple, `FacebookPixelGate`, trade-offs, plan).
- [[NOTA-despliegue-produccion-SPEC-028]] — nota análoga de GTM (patrón triple-gate, incidente `ARG` build-time).
- Meta Events Manager: https://business.facebook.com/events_manager2 — dataset `24015369744738274`.
- [Meta — Configurar el píxel en tu sitio web](https://www.facebook.com/business/help/952192354843755).
