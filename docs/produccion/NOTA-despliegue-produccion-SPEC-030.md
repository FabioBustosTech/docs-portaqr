---
title: "Nota: Paso a producción — SPEC-030/030-A/030-B (Newsletter completa)"
date: 2026-09-03
tags:
  - nota-despliegue
  - produccion
  - newsletter
  - cms
  - smtp
  - resend
aliases:
  - nota despliegue spec 030
  - nota produccion newsletter
---

# Nota: Paso a producción — SPEC-030/030-A/030-B (Newsletter completa)

> [!abstract] Resumen
> Despliegue de la newsletter completa: **SPEC-030** (suscripciones en CMS, sync desde signup, baja 1-clic, sección pública en qr-app), **SPEC-030-A** (creador de correos `newsletter-issues`, preview en admin, envío masivo vía Resend, cron, webhook rebotes) y **SPEC-030-B** (rediseño Stitch de la sección en qr-app). **Orden: `qr-cms` → `backend-portaqr` → `qr-app`** (el backend sincroniza contra el CMS y los proxies apuntan al CMS). Nuevas dependencias npm en `qr-cms` (`nodemailer`, `react-email`, `@react-email/components`, `@react-email/render`, `resend`, `svix`) — el redeploy las instala. **11 variables nuevas** (detalle abajo); SMTP se reutiliza con los mismos nombres del backend.

## Orden de despliegue (importante)

1. **`qr-cms` PRIMERO**: expone `/api/newsletter/*` (subscribe/confirm/unsubscribe/sync) + colección `subscribers`. Sin esto, el sync del backend falla en silencio (best-effort, pero no hay registros) y los formularios dan 502.
2. **`backend-portaqr` DESPUÉS**: necesita `CMS_BASE_URL` apuntando al CMS en producción para el sync de signup.
3. **`qr-app` AL FINAL**: los proxies `/api/newsletter/*` usan `CMS_URL` (server-side, ya existe). Sin cambios de vars.

## Variables de entorno

### qr-cms (servicio CMS en Railway)

| Variable | Descripción | Nueva? |
| --- | --- | --- |
| `NEWSLETTER_API_KEY` | Secreto server-to-server (header `x-newsletter-api-key` en `POST /sync`). Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (**secreto**, debe coincidir con `CMS_NEWSLETTER_API_KEY` del backend) | Sí (requerida) |
| `NEWSLETTER_PUBLIC_URL` | URL pública de qr-app para links de correos (`confirmUrl`, `unsubscribeUrl`). Ej prod: `https://portaqr.cl` | Sí (requerida) |
| `NEWSLETTER_DOUBLE_OPT_IN` | Doble opt-in en orígenes públicos. **Default `true`** (solo `'false'` lo desactiva). **No configurar en prod** | Sí (opcional) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_TTL` | SMTP transaccional (confirmación/bienvenida/baja). **Mismos nombres y valores que backend-portaqr** (puerto 465 = SSL implícito) | No (reutilizadas) |
| `EMAIL_FROM` | Remitente transaccional (mismo del backend) | No (reutilizada) |
| `RESEND_API_KEY` | API key de Resend (**ESP para masivos**). Sin ella, `send` responde 503 explicativo | Sí (requerida para bulk) |
| `NEWSLETTER_FROM` | Remitente bulk DEDICADO, ej `newsletter@news.portaqr.cl` (verificado en Resend; ver §DNS) | Sí (requerida para bulk) |
| `NEWSLETTER_BULK_BATCH_SIZE` | Tamaño de lote del job. **Default `100`** | Sí (opcional) |
| `CRON_SECRET` | Secreto del cron `send-due` (header `x-cron-secret`). Generar como la API key | Sí (requerida si hay cron) |
| `RESEND_WEBHOOK_SECRET` | Secreto del webhook Resend/Svix (Dashboard Resend > Webhooks). Sin él, el webhook responde 503 | Sí (requerida para rebotes) |

### backend-portaqr

| Variable | Descripción | Nueva? |
| --- | --- | --- |
| `CMS_BASE_URL` | Base del CMS en producción (ej `https://<cms>.up.railway.app`, **sin slash final**). Sin ella, el sync se omite con warn | Sí (requerida) |
| `CMS_NEWSLETTER_API_KEY` | **Mismo valor** que `NEWSLETTER_API_KEY` del CMS | Sí (requerida) |
| `NEWSLETTER_SYNC_ENABLED` | Kill-switch del sync. **Default `true`** (solo `'false'` desactiva). **No configurar en prod** | Sí (opcional) |

### qr-app

Sin variables nuevas (los proxies reutilizan `CMS_URL` server-side — verificar que apunte al CMS de producción, no a `qr-cms:3005` del compose local).

> [!note] Sin cambios de infraestructura
> Sin colecciones que migrar (Payload crea `subscribers` y `newsletter-issues` solas, con sus índices únicos). Sin cambios de CORS/R2. El bulk sale por Resend (no por SMTP del hosting). El remitente bulk va en subdominio dedicado (`news.portaqr.cl`) con reputación separada del transaccional.

## DNS y entregabilidad (antes del primer masivo)

1. Verificar dominio `news.portaqr.cl` en Resend + SPF/DKIM/DMARC (sin esto, spam directo).
2. Verificar remitente `NEWSLETTER_FROM` en Resend.
3. Cron cada 5 min → `POST {CMS}/api/newsletter/issues/send-due` con `x-cron-secret` (Railway cron o Vercel Cron).
4. Registrar webhook en Resend → `POST {CMS}/api/newsletter/webhooks/resend` (bounced/complained → `bounced`).
5. Calentamiento: primeros masivos a listas pequeñas (reputación de dominio nuevo).

## Checklist de despliegue

1. **Merge a `main`**: `backend-portaqr` (33271bd), `qr-app` (7971a68), `e2e-tests-portaqr` (677bbf3), `qr-cms` (ff2950c) — ya pusheados.
2. **qr-cms**: deploy en Railway (`npm install` trae `nodemailer`, `react-email/*`, `resend`, `svix`) + setear las 10 vars de la tabla.
3. **backend-portaqr**: deploy + setear las 3 vars (`CMS_BASE_URL` a la URL pública del CMS).
4. **qr-app**: deploy (sin vars nuevas; verificar `CMS_URL` prod).
5. Verificar en logs del CMS tras una suscripción de prueba: `[NewsletterMail] Email de confirmación ... enviado exitosamente a: ...`.

## Verificación post-despliegue

1. `POST /api/newsletter/subscribe` (o formulario en `/newsletter`) → 201 `pending-confirmation` + doc `pending` en admin CMS + correo de confirmación recibido.
2. Clic en confirmar → `subscribed` + bienvenida con footer de baja + headers `List-Unsubscribe` (ver fuente del correo en Gmail).
3. Signup en qr-app con casilla marcada → cuenta 201 + doc `subscribed` con `source: signup` y `userId` en CMS.
4. Link de baja del correo → `unsubscribed` sin login (probar también el one-click de Gmail).
5. Admin CMS → crear issue → preview embebido en vivo → test a casilla propia → programar/enviar → stats (`sentCount`) correctos.
6. Webhook: bounce de prueba del ESP → suscriptor pasa a `bounced`.
7. Con `RESEND_API_KEY` vacía: `send` responde 503 explicativo (no 500).

## Consideraciones operativas

- **Best-effort total**: ningún fallo de newsletter rompe cuentas ni activaciones (sync, confirmaciones y envíos degradan a warn + reintento).
- **Reputación**: transaccional (SMTP hosting, `EMAIL_FROM`) y bulk (Resend, `NEWSLETTER_FROM`) separados a propósito (RN-A6).
- **Límites**: throttle público 10/min/IP (subscribe), reenvíos 3/24h por email, test-send 5/hora por admin, 1 masivo concurrente (409 si hay otro en curso).
- **Privacidad**: prueba de consentimiento = `consentAt + consentTextVersion + source (+ userId)`; sin IPs guardadas; baja inmediata sin login (Ley 19.628 / 19.496 art. 28 B).
