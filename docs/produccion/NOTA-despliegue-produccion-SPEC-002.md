---
title: "Nota: Paso a producción — SPEC-002 (Imagen de portada QR Multilink / Cloudflare R2)"
date: 2026-08-07
tags:
  - despliegue
  - produccion
  - variables
  - env
  - cloudflare
  - r2
  - storage
  - spec-002
status: activo
aliases:
  - Despliegue producción SPEC-002
  - Paso a producción imagen QR multilink
  - R2 producción
---

# Nota de despliegue a producción — SPEC-002 (Imagen de portada QR Multilink)

> [!important] Resumen
> La SPEC-002 agrega la **imagen de portada** para QRs multilink (`typeQr: 'list'`): el navegador sube la imagen al backend (multipart), este la **sanitiza y re-encodea a WebP ≤512px con `sharp`** y la sube a **Cloudflare R2**. Solo la URL pública se persiste en `data.listImageUrl`. Para producción se necesitan: **6 variables nuevas** en el backend y la **configuración del bucket R2** (creación, token, acceso público).

---

## 🟢 BACKEND (`backend-portaqr`) — Variables NUEVAS (obligatorias)

| Variable nueva | Descripción | Ejemplo |
| --- | --- | --- |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Access Key del token de API R2 | `b509bd5e...` |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Secret del token de API R2 (**secreto**) | `dd5c0def...` |
| `CLOUDFLARE_R2_ENDPOINT` | Endpoint S3 del bucket | `https://509578fa....r2.cloudflarestorage.com` |
| `CLOUDFLARE_R2_BUCKET_NAME` | Nombre del bucket | `portaqr-assets` |
| `CLOUDFLARE_R2_PUBLIC_URL` | Dominio público vinculado al bucket (custom o `*.r2.dev`) | `https://pub-7833650dc90d46398919c824644e5428.r2.dev` |
| `CLOUDFLARE_R2_MAX_UPLOAD_SIZE` | (Opcional) Límite de subida en bytes — default 5 MB | `5242880` |

> [!tip] Cómo obtener las credenciales
> 1. Cloudflare Dashboard → **R2** → **Manage R2 API Tokens** → **Create API Token**
> 2. Permiso: **Object Read & Write** sobre el bucket (solo ese bucket)
> 3. CF entrega `Access Key ID` + `Secret Access Key` (una sola vez) y el `Account ID` (en la barra lateral) — con el Account ID se arma el `CLOUDFLARE_R2_ENDPOINT` (`https://<account_id>.r2.cloudflarestorage.com`)

> [!critical] En Railway
> Cargar las 6 variables como **secrets** del servicio `backend-portaqr`. El `CLOUDFLARE_R2_PUBLIC_URL` debe apuntar al dominio público **con Public Access habilitado** (si no, la URL guardada dará 404 al mostrarse).

---

## ☁️ Configuración de Cloudflare R2 (una sola vez)

1. **Crear el bucket** (`portaqr-assets`) — región auto.
2. **Crear el token de API** (ver tip anterior).
3. **Habilitar Public Access** del bucket:
   - Settings → **Public Access** → **R2.dev subdomain** → *Allow access to the bucket via r2.dev* → **Enable** (o configurar un **dominio custom**, ej. `images.portaqr.cl`, en **Custom Domains**).
   - Sin esto, el `PUT` funciona pero la URL pública devuelve **404** ("not publicly accessible").
4. **(Recomendado) Política de acceso**: limitar a **solo lectura pública** del prefijo `qr-multilink/*` (no exponer el resto del bucket).
5. **(Opcional) Lifecycle rule**: `qr-multilink/` sin uso en 90 días → `DeleteObject` (limpia huérfanos de QRs eliminados).

> [!note] No se requiere CORS en el bucket
> La subida va **del navegador al backend** (multipart) y el backend sube a R2 vía SDK — el bucket no necesita reglas CORS para PUT desde el navegador.

---

## 📦 Ramas / código pendiente de mergear

| Repo | Rama | Contenido |
| --- | --- | --- |
| `docs-portaqr` | `feat/spec-002-imagen-multilink` | Spec actualizado |
| `backend-portaqr` | `feat/spec-002-imagen-multilink` | `modules/storage/` (R2 + sharp), endpoint `POST /qr/list-image`, campo `listImageUrl`, fix `_id:false` en `urlList` |
| `qr-app` | `feat/spec-002-imagen-multilink` | `ListImageUploader`, API route `/api/qr/list-image`, integración crear/editar, render página pública, link público en tarjeta |
| `e2e-tests-portaqr` | `feat/spec-002-tests-e2e` | Tests e2e (imagen, name/description, tarjeta) — 38/38 OK |

> [!warning] Dependencias nuevas en backend
> El backend ahora requiere `sharp` + `@aws-sdk/client-s3` (+ `@types/multer`). En el build de producción (Dockerfile/Railway) **deben instalarse** (`npm install` normal las instala desde `package.json`). En docker local el volumen `node_modules` debe recrearse: `docker compose up -d --build --force-recreate backend-portaqr`.

---

## 📋 CHECKLIST de despliegue

1. **Cloudflare**: bucket creado → token API (Object R&W) → **Public Access habilitado** → (recomendado) policy solo `qr-multilink/*`
2. **Backend (Railway)**: agregar las 6 `CLOUDFLARE_R2_*` → desplegar → verificar en logs `r2_object_put` al subir
3. **Frontend**: sin variables nuevas (la subida va al backend; `NEXT_PUBLIC_BFF_URL` ya apunta al backend de producción — ver [[NOTA-despliegue-produccion-SPEC-003]])
4. **Merge** de las 3 ramas de código a `main` (docs, backend, qr-app) + la de e2e
5. **Smoke test**:
   - Crear QR multilink **con imagen** → verificar que la página pública la muestra (80% del ancho, centrada)
   - Editar y **cambiar/eliminar** la imagen → el objeto R2 se borra (URL da 404 tras eliminar)
   - QR list **sin imagen** → flujo normal sin regresión
   - Imagen **> 5 MB** → `413`; formato no soportado → `415`; archivo corrupto → `422`

---

## ⚠️ Post-despliegue

- **Verificar la URL pública** del objeto tras el primer upload: debe responder `200` con `Content-Type: image/webp` (si da 404 → Public Access del bucket deshabilitado).
- **Rotación del token R2**: si se rota el token, actualizar `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` en Railway (las imágenes existentes no se afectan; solo subidas/borrados nuevos).
- **Límite por abuso** (pendiente opcional): rate-limit de 10 subidas/hora/usuario documentado en el spec (§9).

---

## Referencias

- [[SPEC-002-qr-multilink-imagen]] — spec completo del feature (flujo multipart + sharp, RF, tests)
- [[NOTA-despliegue-produccion-SPEC-003]] — variables de auth (RS256) y checklist general Railway
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- Bucket de desarrollo actual: `https://pub-7833650dc90d46398919c824644e5428.r2.dev` (solo lectura pública)
