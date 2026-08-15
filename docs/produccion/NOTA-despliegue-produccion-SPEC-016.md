---
title: "Nota: Paso a producción — SPEC-016 (Imagen de mascota PetTag / Cloudflare R2)"
date: 2026-08-14
tags:
  - nota-despliegue
  - produccion
  - pet-tag
  - cloudflare
  - r2
  - imagen
aliases:
  - nota despliegue spec 016
  - nota produccion imagen pet tag
---

# Nota: Paso a producción — SPEC-016 (Imagen de mascota PetTag / Cloudflare R2)

> [!abstract] Resumen
> La SPEC-016 agrega la **foto de la mascota** a los QRs PetTag: el navegador sube la imagen al backend (multipart), este la **sanitiza y re-encodea a WebP ≤512px con `sharp`** (mismo pipeline de SPEC-002) y la sube a **Cloudflare R2** en la **carpeta `pet-tag/`** (`pet-tag/{idQr}.webp`). Solo la URL pública se persiste en `petData.petImageUrl`. Para producción se necesita: **1 variable opcional** en el backend (`PET_TAG_MAX_UPLOAD_SIZE`), **extender la política de acceso público del bucket al prefijo `pet-tag/*`** y **(opcional) cubrir `pet-tag/` en el lifecycle** de limpieza. **No se requieren credenciales ni bucket nuevos**: se reutilizan las 6 variables `CLOUDFLARE_R2_*` de [[NOTA-despliegue-produccion-SPEC-002]].

## Variables de entorno

| Variable | Descripción | Ejemplo | ¿Nueva? |
| --- | --- | --- | --- |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Access Key del token de API R2 | `b509bd5e...` | No (SPEC-002) |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Secret del token de API R2 (**secreto**) | `dd5c0def...` | No (SPEC-002) |
| `CLOUDFLARE_R2_ENDPOINT` | Endpoint S3 del bucket | `https://509578fa....r2.cloudflarestorage.com` | No (SPEC-002) |
| `CLOUDFLARE_R2_BUCKET_NAME` | Nombre del bucket | `portaqr-assets` | No (SPEC-002) |
| `CLOUDFLARE_R2_PUBLIC_URL` | Dominio público del bucket | `https://pub-7833650dc90d46398919c824644e5428.r2.dev` | No (SPEC-002) |
| `CLOUDFLARE_R2_MAX_UPLOAD_SIZE` | (Opcional) Límite general de subida — default 5 MB | `5242880` | No (SPEC-002) |
| `PET_TAG_MAX_UPLOAD_SIZE` | (Opcional) Límite de subida de foto pet-tag — **default 5 MB** si no existe | `5242880` | **Sí (opcional)** |

> [!note] Agregar `PET_TAG_MAX_UPLOAD_SIZE` a Railway
> Es opcional (el código tiene default 5 MB). Si se agrega, hacerlo también en `.env` y `backendPortaqr.env` locales para consistencia. Verificar que las 6 `CLOUDFLARE_R2_*` están presentes (desde SPEC-002) — **no duplicarlas**.

## ☁️ Cloudflare R2 — Configuración adicional (una sola vez)

1. **Bucket**: reutilizar `portaqr-assets` — **no** crear bucket nuevo.
2. **Política de acceso público**: extender el scope de solo-lectura pública al prefijo **`pet-tag/*`** (junto a `qr-multilink/*` y `qr-multilink-pdf/*`):
   - R2 → **portaqr-assets** → **Settings** → **Public Access** (o la policy custom configurada en SPEC-002) → agregar `pet-tag/*`.
   - Sin este paso, la URL persistida (`https://<PUBLIC_URL>/pet-tag/<idQr>.webp`) dará **404** al mostrarse en la página pública.
3. **(Opcional) Lifecycle**: si existe la regla de expiración de SPEC-005, extenderla a `pet-tag/` — limpia objetos huérfanos tras fallos de borrado (mejor esfuerzo en `deleteObject`).

> [!note] No se requiere CORS en el bucket
> La subida va **del navegador al backend** (multipart) y el backend sube a R2 vía SDK — igual que SPEC-002/005, sin CORS para PUT desde el navegador.

## Checklist de despliegue

1. **Cloudflare**: política pública `pet-tag/*` habilitada + (opcional) lifecycle `pet-tag/`.
2. **Backend (Railway)**: verificar `CLOUDFLARE_R2_*` presentes; (opcional) `PET_TAG_MAX_UPLOAD_SIZE` → desplegar.
3. **Frontend (Railway/Next)**: desplegar la nueva API route y el formulario (cambios de build — requiere rebuild).

## Verificación post-despliegue

1. Activar una placa con foto → `POST /pet-tag/:idQr/image` responde `200 { petImageUrl, size, width, height }`.
2. Abrir la URL pública `https://<PUBLIC_URL>/pet-tag/<idQr>.webp` → debe responder `200` con `Content-Type: image/webp` (si da `404` → la política `pet-tag/*` no está habilitada).
3. Página pública `/pet-tag/<idQr>` → se muestra la foto circular de la mascota sobre la tarjeta.
4. Re-subir foto → mismo key `pet-tag/<idQr>.webp` sobrescrito (verificar `LastModified` en R2).
5. `DELETE /pet-tag/:idQr/image` → `200 { petImageUrl: null }`, la URL R2 responde `404` y Mongo tiene `petData.petImageUrl: null`.
6. Logs del backend: `r2_object_put { idQr, size, width, height }` al subir y `r2_object_deleted { key: pet-tag/... }` al borrar.

## Consideraciones operativas

- **Rotación del token R2**: actualizar `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` en Railway (las imágenes ya subidas no se afectan; solo subidas/borrados nuevos).
- **Límites**: foto > 5 MB → `413`; formato no permitido (`.svg`, `.pdf`) → `415`; binario corrupto → `422` (nada se persiste).
- **Privacidad**: la key incluye el `idQr` (no datos personales); el campo `petImageUrl` no es escribible por JSON (solo vía endpoints de imagen).

## Referencias

- [[SPEC-016-imagen-mascota-pet-tag]] — spec técnica completa.
- [[NOTA-despliegue-produccion-SPEC-002]] — variables R2 base y configuración del bucket.
- [[NOTA-despliegue-produccion-SPEC-005]] — patrón de extensión de política/lifecycle.
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
