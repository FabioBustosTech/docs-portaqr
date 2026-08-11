---
title: "Nota: Paso a producción — SPEC-005 (PDF adjunto por item QR Multilink / Ghostscript + R2)"
date: 2026-08-11
tags:
  - despliegue
  - produccion
  - variables
  - env
  - cloudflare
  - r2
  - ghostscript
  - pdf
  - spec-005
status: activo
aliases:
  - Despliegue producción SPEC-005
  - Paso a producción PDF multilink
  - PDFs producción
---

# Nota de despliegue a producción — SPEC-005 (PDF adjunto por item QR Multilink)

> [!important] Resumen
> La SPEC-005 agrega **items PDF** a los QRs multilink (`typeQr: 'list'`): el navegador sube el PDF al backend (multipart), este lo **sanitiza con Ghostscript** (elimina JS embebido, metadata, acciones; re-comprime a 72 DPI) y lo sube a **Cloudflare R2** (`qr-multilink-pdf/{idQr}-{itemId}.pdf`). Solo la URL pública se persiste en `data.urlList[].documentUrl`. Para producción se necesitan: **2 variables nuevas en el backend**, **2 variables nuevas en el frontend** (¡obligan rebuild!), **ghostscript en la imagen** (ya en el Dockerfile) y **extender la política R2** al prefijo `qr-multilink-pdf/*`.

---

## 🟢 BACKEND (`backend-portaqr`) — Variables NUEVAS (obligatorias)

| Variable nueva | Descripción | Valor |
| --- | --- | --- |
| `PDF_MAX_UPLOAD_SIZE` | Límite del PDF de **entrada** en bytes (default 2 MB) | `2097152` |
| `MAX_PDF_ITEMS_PER_QR` | Máximo de items PDF por QR multilink (default 2) | `2` |

> [!info] Ya existentes (obligatorias para este feature — las cargó SPEC-002)
> `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` (**secreto**), `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`, `CLOUDFLARE_R2_MAX_UPLOAD_SIZE` — ver [[NOTA-despliegue-produccion-SPEC-002]]. Sin ellas el `POST /qr/list-pdf` falla al subir a R2.

> [!critical] En Railway
> Cargar `PDF_MAX_UPLOAD_SIZE` y `MAX_PDF_ITEMS_PER_QR` como **secrets** del servicio `backend-portaqr`. El backend **no requiere rebuild por variables** (las lee de `process.env` en runtime), pero la imagen DEBE incluir `ghostscript` (ver abajo).

---

## 🔵 FRONTEND (`qr-app`) — Variables NUEVAS (obligatorias)

| Variable nueva | Descripción | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR` | Límite de items PDF por QR para bloquear la UI (debe coincidir con el backend) | `2` |
| `NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE` | Tamaño máximo del PDF en **bytes** para la validación cliente (debe coincidir con el backend) | `2097152` |

> [!critical] Las `NEXT_PUBLIC_*` se inlinean en **build time**
> En Next.js, las variables `NEXT_PUBLIC_*` se incrustan en el bundle durante el build. **Cambiar solo el valor NO es suficiente**: hay que definirlas en el servicio de Railway y hacer un **redeploy con rebuild** (`railway up` con build, o redeploy que reconstruya la imagen). Si difieren del backend, el **backend tiene la última palabra** (responde `400` por límite / `413` por tamaño).

> [!info] Ya existentes
> `NEXT_PUBLIC_BFF_URL` (apunta al backend de producción) — ver [[NOTA-despliegue-produccion-SPEC-003]].

---

## 🐧 Ghostscript en la imagen del backend (obligatorio)

SPEC-005 agregó al Dockerfile de `backend-portaqr` (etapa `production`):

```dockerfile
RUN apk add --no-cache ghostscript
```

> [!warning] Verificar tras el deploy
> ```bash
> docker exec backend-portaqr gs --version   # local: debe responder (ej. 10.06.0)
> # En Railway: revisar en los logs del deploy que apk instaló ghostscript sin error,
> # o ejecutar `gs --version` vía Railway CLI / consola del servicio.
> ```
> Sin `gs` instalado, **toda subida de PDF responde `422`** ("No se pudo ejecutar Ghostscript").

---

## ☁️ Cloudflare R2 — Configuración adicional (una sola vez)

1. **Bucket**: reutilizar `portaqr-assets` (creado en SPEC-002). No requiere bucket nuevo.
2. **Política de acceso público**: extender la policy de **solo lectura pública** para incluir el prefijo `qr-multilink-pdf/*` (además de `qr-multilink/*`). Sin esto, la URL guardada en `documentUrl` dará **404**.
3. **(Opcional, recomendado) Lifecycle rule**: `qr-multilink-pdf/` sin uso en 90 días → `DeleteObject` (limpia huérfanos de items eliminados cuyos borrados fallaron).

> [!note] No se requiere CORS en el bucket
> La subida va del navegador → backend (multipart) y el backend sube a R2 vía SDK — igual que SPEC-002, sin CORS en el bucket.

---

## 📦 Ramas / código pendiente de mergear

| Repo | Rama | Contenido |
| --- | --- | --- |
| `docs-portaqr` | `feat/spec-005-docs` | Spec implementada + tareas cerradas (16/16) |
| `backend-portaqr` | `feat/spec-005` | `PdfSanitizerService` (gs), `StorageService.uploadPdf`, `POST /qr/list-pdf`, validador schema (exclusividad + límite), limpieza R2 en `PATCH /qr/:id`, helper `pdf-limits.helper.ts`, Dockerfile con gs, 1015 tests PASS |
| `qr-app` | `feat/spec-005` | `ListPdfUploader`, opción "PDF" en el Select, `buildUrlList` (pdf sin documentUrl se excluye), uploads post-creación, bloqueo UI límite, render público (botón `bg-rose-600` "Descargar PDF"), icono pdf, constantes de env |
| `e2e-tests-portaqr` | `feat/spec-005` | 5 tests E2E (crear, página pública, eliminar, límite UI, peso 2MB) — 46/46 suite completa OK |

> [!warning] Dependencias nuevas
> - **Backend**: `ghostscript` (binario del sistema — ya en Dockerfile). Sin nuevas dependencias npm (usa `child_process`).
> - **Frontend**: sin dependencias npm nuevas.
> - En docker local tras merge: `docker compose up -d --build --force-recreate -V backend-portaqr qr-app` (el `-V` limpia el volumen `node_modules` viejo — evita SIGSEGV en `nest start --watch` con la imagen nueva).

---

## 📋 CHECKLIST de despliegue

1. **Merge** de las 4 ramas a `main` (docs, backend-portaqr, qr-app, e2e-tests-portaqr)
2. **Backend (Railway)**:
   - [ ] Secrets: `PDF_MAX_UPLOAD_SIZE=2097152`, `MAX_PDF_ITEMS_PER_QR=2` (+ verificar `CLOUDFLARE_R2_*` presentes)
   - [ ] Deploy con rebuild (imagen nueva incluye ghostscript)
   - [ ] Verificar `gs --version` en el contenedor de producción
3. **Frontend (Railway)**:
   - [ ] Variables: `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR=2`, `NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE=2097152` (+ verificar `NEXT_PUBLIC_BFF_URL`)
   - [ ] **Redeploy con rebuild** (las `NEXT_PUBLIC_*` se inlinean en build time)
4. **Cloudflare R2**: policy pública `qr-multilink-pdf/*` + (opcional) lifecycle 90 días
5. **Smoke test**:
   - Crear QR multilink con **1 PDF válido** → página pública muestra botón rosa "Descargar PDF" que abre el PDF desde R2
   - Crear con **2 PDFs** → ambos botones; intentar un **3er PDF** → la opción desaparece de la UI (límite 2)
   - PDF **> 2 MB** → `413` (y error cliente antes de subir); formato no PDF → `415`; PDF corrupto → `422`
   - **Editar**: reemplazar PDF (sobrescribe R2), eliminar PDF → la URL R2 responde `404` tras el borrado
   - **Regresión**: QR multilink sin PDFs y con URLs/vCards → flujo normal

---

## ⚠️ Post-despliegue

- **Verificar la URL pública** del primer PDF subido: debe responder `200` con `Content-Type: application/pdf` (si da 404 → policy pública de `qr-multilink-pdf/*` no aplicada).
- **Rotación del token R2**: actualizar `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` en Railway (los PDFs ya subidos no se afectan).
- **Sincronización de límites**: si se cambia `MAX_PDF_ITEMS_PER_QR` o `PDF_MAX_UPLOAD_SIZE` en el backend, actualizar también las `NEXT_PUBLIC_*` del frontend **y rebuildar**.
- **Métricas sugeridas** (cuando existan): `qr_list_pdf_uploads_total`, `qr_list_pdf_upload_errors_total{reason}`, `gs_processing_seconds`, `r2_failed_delete_total` (spec §10).

---

## Referencias

- [[SPEC-005-pdf-multilink]] — spec completo del feature (flujo multipart + gs, RF, CA-01..13, tests)
- [[NOTA-despliegue-produccion-SPEC-002]] — variables R2 base y configuración del bucket
- [[NOTA-despliegue-produccion-SPEC-003]] — variables de auth (RS256) y checklist general Railway
- Ghostscript docs: https://www.ghostscript.com/documentation/
- Bucket de desarrollo actual: `https://pub-7833650dc90d46398919c824644e5428.r2.dev` (solo lectura pública)
