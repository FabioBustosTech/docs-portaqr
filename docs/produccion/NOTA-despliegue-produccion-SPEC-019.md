---
title: "Nota: Paso a producción — SPEC-019 (Correo de activación de QRs)"
date: 2026-08-17
tags:
  - nota-despliegue
  - produccion
  - correo
  - smtp
  - qr-activate
aliases:
  - nota despliegue spec 019
  - nota produccion correo activacion qr
---

# Nota: Paso a producción — SPEC-019 (Correo de activación de QRs)

> [!abstract] Resumen
> La SPEC-019 envía un **correo de activación al dueño** cuando sus QRs quedan activos (pago Webpay exitoso o activación por panel admin). El correo incluye el **logo PNG de Porta QR**, los **PNGs de los QRs generados en memoria** (`qrcode`, nivel H) y la **landing URL** de cada QR. **1 variable nueva opcional** (`EMAIL_ACTIVATION_ENABLED`, default `true` — no requiere configuración en prod); se reutilizan `SMTP_*`, `EMAIL_FROM` y `FRONTEND_URL`. Solo se requiere **redeploy de `backend-portaqr`** (npm install incluirá la dependencia `qrcode`) y, **antes**, el **deploy de `qr-app`** para publicar el asset público `PORTA_QR_LOGO_HORIZONTAL.png` (los clientes de correo no renderizan SVG — ADR-019.7).

## Orden de despliegue (importante)

1. **`qr-app` PRIMERO**: publica `public/PORTA_QR_LOGO_HORIZONTAL.png` → `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png`. Sin este deploy, el header del correo muestra la imagen rota (el template la referencia por URL remota, no por attachment).
2. **`backend-portaqr` DESPUÉS**: redeploy en Railway — `npm install` incluirá `qrcode` (nueva dependencia en `package.json`).

## Variables de entorno

| Variable | Descripción | ¿Nueva? |
| --- | --- | --- |
| `SMTP_HOST` | Host del servidor SMTP (ya usado por verificación/registro) | No |
| `SMTP_PORT` | Puerto SMTP | No |
| `SMTP_SECURE` | TLS sí/no | No |
| `SMTP_USER` | Usuario SMTP | No |
| `SMTP_PASS` | Password SMTP (**secreto**) | No |
| `SMTP_TTL` | Timeout SMTP (typo histórico del nombre — no renombrar) | No |
| `EMAIL_FROM` | Remitente de los correos | No |
| `FRONTEND_URL` | Base URL del frontend (landing `/qr/{idQr}?origen=qr` y logo) | No |
| `EMAIL_ACTIVATION_ENABLED` | Activa/desactiva el envío del correo de activación. **Default `true`** (ausente o cualquier valor ≠ `false` → envía). Poner `false` solo para desarrollo local (tests manuales sin correos reales). **No configurar en prod** | Sí (opcional) |

> [!note] Sin cambios de infraestructura
> No hay cambios de CORS, R2 ni Mongo. El correo es saliente vía SMTP y la imagen QR se genera en memoria (no se persiste). El remitente es el mismo de los correos existentes (`EMAIL_FROM`), por lo que SPF/DKIM ya aplican si están configurados.

## Checklist de despliegue

1. **`qr-app`**: merge de la rama con `public/PORTA_QR_LOGO_HORIZONTAL.png` → deploy en Railway → verificar `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png` responde `200` con `Content-Type: image/png`.
2. **`backend-portaqr`**: merge de `feat/spec-019-correo-activacion-qr` → deploy en Railway (npm install incluye `qrcode`).
3. Verificar en logs de la app tras una activación real: `Email de activación enviado exitosamente a: ...`.

## Verificación post-despliegue

1. Activar un QR por Webpay (modo integración Transbank) → el dueño recibe el correo con **imagen QR escaneable**, landing URL, **fecha de activación** y **fecha de cierre** (dd/mm/yyyy).
2. Activar por panel admin → el **cliente** recibe el correo (no el admin).
3. Escanear el QR del correo → llega a la misma landing que el QR físico (`/qr/{idQr}?origen=qr`).
4. Romper `SMTP_HOST` temporalmente → la activación sigue OK (PAYED/ADMINCREATED) y aparece `email_activation_failed` en logs (best-effort, ADR-019.2).
5. `mongosh`: el documento `qractivates` de la compra tiene `activationDate` poblado.
6. El correo muestra el **logo Porta QR** (link a `portaqr.cl`) y el **badge de tipo** correcto (ej. "QR Dinámico" para `dynamic`, "QR Multi links" para `list`), línea gráfica idéntica a `registerEmail` (solo modo claro).

## Consideraciones operativas

- **Reputación de dominio**: el remitente es el mismo de los correos existentes; el peso del correo crece ~10-20 KB por QR (PNG 200px) — irrelevante para SMTP.
- **Best-effort**: si SMTP falla, la activación NO se revierte ni falla (el correo es efecto secundario). El fallo queda en logs como `email_activation_failed { activationId, userId, reason }`.
- **Bug histórico conocido**: `SMTP_TTL` es un typo de `SMTP_TLS` en el código existente — no renombrar en esta SPEC (fuera de alcance).

## Referencias

- [[SPEC-019-correo-activacion-qr]] — spec técnica completa (RF-1..RF-8, ADR-019.1..8).
- [[NOTA-despliegue-produccion-SPEC-016]] — patrón de nota de despliegue.
- `qr-app/public/PORTA_QR_LOGO_HORIZONTAL.png` — asset público nuevo (generado con `sharp` desde el SVG, 400px, 6.6 KB).