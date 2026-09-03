---
title: "Nota: Paso a producción — SPEC-030/030-A/030-B (Newsletter completa)"
date: 2026-09-03
tags:
  - nota-despliegue
  - produccion
  - newsletter
  - cms
  - smtp
  - bulk
aliases:
  - nota despliegue spec 030
  - nota produccion newsletter
---

# Nota: Paso a producción — SPEC-030/030-A/030-B (Newsletter completa)

> [!abstract] Resumen
> Despliegue de la newsletter completa: **SPEC-030** (suscripciones en CMS, sync desde signup, baja 1-clic, sección pública en qr-app), **SPEC-030-A** (creador de correos `newsletter-issues`, preview en admin, envío masivo por SMTP propio con throttling) y **SPEC-030-B** (rediseño Stitch de la sección en qr-app). **Orden: `qr-cms` → `backend-portaqr` → `qr-app`** (el backend sincroniza contra el CMS y los proxies apuntan al CMS). Nuevas dependencias npm en `qr-cms` (`nodemailer`, `react-email`, `@react-email/components`, `@react-email/render`) — el redeploy las instala. **7 variables nuevas** (detalle abajo); SMTP se reutiliza con los mismos nombres del backend. Sin ESP externo.

## Orden de despliegue (importante)

1. **`qr-cms` PRIMERO**: expone `/api/newsletter/*` (subscribe/confirm/unsubscribe/sync) + colección `subscribers`. Sin esto, el sync del backend falla en silencio (best-effort, pero no hay registros) y los formularios dan 502.
2. **`backend-portaqr` DESPUÉS**: necesita `CMS_BASE_URL` apuntando al CMS en producción para el sync de signup.
3. **`qr-app` AL FINAL**: los proxies `/api/newsletter/*` usan `CMS_URL` (server-side, ya existe). Sin cambios de vars.

## Variables de entorno

### qr-cms (servicio CMS en Railway)

| Variable                                                                           | Descripción                                                                                                                                                                                                                          | Nueva?                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `NEWSLETTER_API_KEY`                                                               | Secreto server-to-server (header `x-newsletter-api-key` en `POST /sync`). Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (**secreto**, debe coincidir con `CMS_NEWSLETTER_API_KEY` del backend) | Sí (requerida)              |
| `NEWSLETTER_PUBLIC_URL`                                                            | URL pública de qr-app para links de correos (`confirmUrl`, `unsubscribeUrl`). Ej prod: `https://portaqr.cl`                                                                                                                          | Sí (requerida)              |
| `NEWSLETTER_DOUBLE_OPT_IN`                                                         | Doble opt-in en orígenes públicos. **Default `true`** (solo `'false'` lo desactiva). **No configurar en prod**                                                                                                                       | Sí (opcional)               |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_TTL` | SMTP transaccional (confirmación/bienvenida/baja). **Mismos nombres y valores que backend-portaqr** (puerto 465 = SSL implícito)                                                                                                     | No (reutilizadas)           |
| `EMAIL_FROM`                                                                       | Remitente transaccional (mismo del backend)                                                                                                                                                                                          | No (reutilizada)            |
| `NEWSLETTER_FROM`                                                                  | Remitente bulk del propio dominio (vacío = `EMAIL_FROM`), ej `newsletter@portaqr.cl`                                                                                                                                                  | Sí (opcional)               |
| `NEWSLETTER_BULK_BATCH_SIZE`                                                       | Tamaño de lote del job. **Default `50`**                                                                                                                                                                                              | Sí (opcional)               |
| `NEWSLETTER_BULK_PAUSE_MS`                                                         | Pausa entre lotes (anti-spam). **Default `30000`**                                                                                                                                                                                    | Sí (opcional)               |
| `CRON_SECRET`                                                                      | Secreto del cron `send-due` (header `x-cron-secret`). Generar como la API key                                                                                                                                                        | Sí (requerida si hay cron)  |

### backend-portaqr

| Variable | Descripción | Nueva? |
| --- | --- | --- |
| `CMS_BASE_URL` | Base del CMS en producción (ej `https://<cms>.up.railway.app`, **sin slash final**). Sin ella, el sync se omite con warn | Sí (requerida) |
| `CMS_NEWSLETTER_API_KEY` | **Mismo valor** que `NEWSLETTER_API_KEY` del CMS | Sí (requerida) |
| `NEWSLETTER_SYNC_ENABLED` | Kill-switch del sync. **Default `true`** (solo `'false'` desactiva). **No configurar en prod** | Sí (opcional) |

### qr-app

Sin variables nuevas (los proxies reutilizan `CMS_URL` server-side — verificar que apunte al CMS de producción, no a `qr-cms:3005` del compose local).

> [!note] Sin cambios de infraestructura
> Sin colecciones que migrar (Payload crea `subscribers` y `newsletter-issues` solas, con sus índices únicos). Sin cambios de CORS/R2. El bulk sale por el SMTP del hosting (sin ESP externo). Todo el correo —transaccional y masivo— usa el propio dominio con SPF/DKIM/DMARC (ver §Anti-spam).

## DNS y entregabilidad (antes del primer masivo)

1. Verificar SPF/DKIM/DMARC del dominio en cPanel (Email Deliverability) — remitente del propio dominio (sin esto, spam directo).
2. Cron cada 5 min → `POST {CMS}/api/newsletter/issues/send-due` con `x-cron-secret` (Railway cron o Vercel Cron).
3. Calentamiento: primeros masivos a listas pequeñas (reputación + tope/hora de la cuenta de hosting — confirmar con el proveedor).
4. Rebotes tardíos: sin ESP no hay webhook — revisión periódica manual de la casilla + `bounced` (mejora futura: monitoreo IMAP).

## Valores actuales en local (desarrollo, 2026-09-03)

> [!warning] Secretos fuera de git
> Los valores marcados 🔒 (`SMTP_USER`, `SMTP_PASS`, `NEWSLETTER_API_KEY`,
> `CMS_NEWSLETTER_API_KEY`, `CRON_SECRET`) **existen solo** en `qr-cms/qrCms.env` y
> `backend-portaqr/backendPortaqr.env` (no versionados) y deberán cargarse a
> mano en el dashboard de Railway. **Jamás se commitean.** Abajo solo van los
> valores no secretos.

### qr-cms/qrCms.env (local)

| Variable                     | Valor local                                      | En prod cambiar a                         |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `SMTP_HOST`                  | `srv61.benzahosting.cl`                          | El mismo (hosting actual)                 |
| `SMTP_PORT`                  | `465` (SSL implícito)                            | El mismo                                  |
| `SMTP_USER` / `SMTP_PASS`    | 🔒 (las del backend, ya copiadas)                | Los mismos                                |
| `EMAIL_FROM`                 | `noreplay@portaqr.cl`                            | El mismo                                  |
| `NEWSLETTER_PUBLIC_URL`      | `http://localhost:3000`                          | `https://portaqr.cl`                      |
| `NEWSLETTER_DOUBLE_OPT_IN`   | `true`                                           | No configurar (default)                   |
| `NEWSLETTER_API_KEY`         | 🔒 (generada 64 hex, comparte valor con backend) | Regenerar una nueva para prod             |
| `NEWSLETTER_FROM`            | (vacía = usa `EMAIL_FROM`)                       | `newsletter@portaqr.cl` (o no configurar) |
| `NEWSLETTER_BULK_BATCH_SIZE` | (vacía, default 50)                              | No configurar (default)                   |
| `NEWSLETTER_BULK_PAUSE_MS`   | (vacía, default 30000)                           | No configurar (default)                   |
| `CRON_SECRET`                | (vacía)                                          | Generar uno nuevo para prod               |

### backend-portaqr/backendPortaqr.env (local)

| Variable | Valor local | En prod cambiar a |
| --- | --- | --- |
| `CMS_BASE_URL` | `http://qr-cms:3005` (red docker) | URL pública del CMS en Railway (sin slash) |
| `CMS_NEWSLETTER_API_KEY` | 🔒 (igual a la del CMS local) | Igual a la `NEWSLETTER_API_KEY` de prod |
| `NEWSLETTER_SYNC_ENABLED` | `true` | No configurar (default) |

### qr-app/qrApp.env (local)

| Variable | Valor local | En prod cambiar a |
| --- | --- | --- |
| `CMS_URL` | (interno docker) | URL pública del CMS en Railway |

## Anti-spam con SMTP propio (hosting compartido de uso exclusivo)

Sin límites duros más que no caer en spam. Capas de protección:

1. **Throttling**: pool 1 conexión + 1 destinatario por mensaje + secuencial (RTT ~30-60/min) + pausa 30s entre lotes de 50 → ~1.000 suscriptores ≈ 35 min.
2. **Higiene**: solo `subscribed`, baja 1-clic en cada correo + headers, rebotes 550 inmediatos no bloquean el lote.
3. **Autenticación**: verificar SPF/DKIM/DMARC del dominio en cPanel (Email Deliverability) + remitente del propio dominio.
4. **Calentamiento**: primeros masivos a listas pequeñas; confirmar con el proveedor el tope/hora de la cuenta.
5. **Rebotes tardíos**: sin ESP no hay webhook automático — revisar periódicamente la casilla `noreplay@` y marcar `bounced` manual (mejora futura: monitoreo IMAP).

## Checklist de despliegue

1. **Merge a `main`**: `backend-portaqr` (33271bd), `qr-app` (7971a68), `e2e-tests-portaqr` (677bbf3), `qr-cms` (ff2950c) — ya pusheados.
2. **qr-cms**: deploy en Railway (`npm install` trae `nodemailer`, `react-email/*`) + setear las 7 vars de la tabla.
3. **backend-portaqr**: deploy + setear las 3 vars (`CMS_BASE_URL` a la URL pública del CMS).
4. **qr-app**: deploy (sin vars nuevas; verificar `CMS_URL` prod).
5. Verificar en logs del CMS tras una suscripción de prueba: `[NewsletterMail] Email de confirmación ... enviado exitosamente a: ...`.

## Verificación post-despliegue

1. `POST /api/newsletter/subscribe` (o formulario en `/newsletter`) → 201 `pending-confirmation` + doc `pending` en admin CMS + correo de confirmación recibido.
2. Clic en confirmar → `subscribed` + bienvenida con footer de baja + headers `List-Unsubscribe` (ver fuente del correo en Gmail).
3. Signup en qr-app con casilla marcada → cuenta 201 + doc `subscribed` con `source: signup` y `userId` en CMS.
4. Link de baja del correo → `unsubscribed` sin login (probar también el one-click de Gmail).
5. Admin CMS → crear issue → preview embebido en vivo → test a casilla propia → programar/enviar → stats (`sentCount`) correctos.
6. Rebote permanente (550) en un masivo → suscriptor pasa a `bounced` sin bloquear el lote.
7. Sin SMTP configurado: `send` responde 503 explicativo (no 500).

## Consideraciones operativas

- **Best-effort total**: ningún fallo de newsletter rompe cuentas ni activaciones (sync, confirmaciones y envíos degradan a warn + reintento).
- **Reputación**: todo el correo sale del propio dominio por SMTP del hosting (`EMAIL_FROM`/`NEWSLETTER_FROM`); entregabilidad = SPF/DKIM/DMARC + calentamiento + higiene (RN-A6, §Anti-spam).
- **Límites**: throttle público 10/min/IP (subscribe), reenvíos 3/24h por email, test-send 5/hora por admin, 1 masivo concurrente (409 si hay otro en curso).
- **Privacidad**: prueba de consentimiento = `consentAt + consentTextVersion + source (+ userId)`; sin IPs guardadas; baja inmediata sin login (Ley 19.628 / 19.496 art. 28 B).
