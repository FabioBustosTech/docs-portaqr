---
title: "SPEC-005: PDF adjunto por item para QR Multilink (Cloudflare R2 + Ghostscript)"
date: 2026-08-07
tags:
  - spec
  - feature
  - frontend
  - backend
  - qr
  - multilink
  - cloudflare
  - r2
  - storage
  - pdf
  - ghostscript
  - sanitizacion
status: borrador
aliases:
  - SPEC-005
  - PDF QR Multilink
  - PDF Item Multilink
  - Documento Multilink R2
---

# SPEC-005: PDF adjunto por item para QR Multilink (Cloudflare R2 + Ghostscript)

> [!abstract] Decisión clave
> Permitir que cada item del array `data.urlList[]` de un QR multilink (`typeQr: 'list'`) sea de **tipo PDF** (`typeUrl: 'pdf'`) con un archivo adjunto. El navegador sube el PDF al backend (**multipart/form-data**); el backend lo **sanitiza con Ghostscript** (`gs -dPDFSETTINGS=/screen -dCompatibilityLevel=1.7`) — eliminando JavaScript embebido, acciones automáticas (`/OpenAction`, `/AA`), metadata de autor/creador, embedded files y re-comprimiendo a 72 DPI — y lo sube a **Cloudflare R2** con key `qr-multilink-pdf/{idQr}-{itemId}.pdf`. Solo la URL pública final se persiste en el campo `documentUrl` del item de `urlList`. La página pública `portaqr.cl/qr/{idQr}` renderiza el item como un **botón ancla** (`<a>`) con color distintivo que descarga/abre el PDF. El dashboard permite subir, descargar y eliminar el PDF (el eliminado borra el objeto R2). Límite: **2 MB** por archivo, **`MAX_PDF_ITEMS_PER_QR`** items PDF por QR (configurable vía env, default 5).

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-07
> - **Autor:** Equipo Plataforma QR
> - **Componentes afectados:** `backend-portaqr/` (puerto 3004 en docker-compose), `qr-app/` (puerto 3000)
> - **Alcance:** Solo QR tipo `list` (multilink). No aplica a `dynamic`, `static`, `whatsapp`, `email`, `call`, `wifi`, `texto`, `vcard`, `pet`, `phone`, `map`.
> - **Página pública destino:** `https://portaqr.cl/qr/{idQr}` (ej. `https://portaqr.cl/qr/89302960-7799-43fe-b5a0-45d2295d539f`).
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]], [[SPEC-002-qr-multilink-imagen]], [[SPEC-003-auditoria-dependencias-qr-app]]
>
> [!warning] Impacto de SPEC-002 (implementada 2026-08-07)
> SPEC-002 ya implementó la infraestructura de storage R2 reutilizable: `modules/storage/` con `StorageService` (upload/delete R2) e `ImageProcessorService` (pipeline sharp). Esta SPEC-005 **reutiliza** `StorageService` (extendido para PDFs) y agrega un nuevo `PdfSanitizerService` (Ghostscript). El endpoint multipart sigue el patrón de `POST /qr/list-image` pero con `POST /qr/list-pdf`. La API route del frontend sigue el patrón de `/api/qr/list-image` → `/api/qr/list-pdf`.
>
> [!warning] Impacto de SPEC-003 (implementada 2026-08-07)
> Tras SPEC-003 el frontend usa **JWT directo con cookies httpOnly + `jose`** (sin next-auth): el navegador **no tiene el token**, por lo que **toda llamada autenticada debe pasar por una API route del frontend** (`/api/*`) que lee la cookie y reenvía al backend con `Authorization: Bearer`. El endpoint de subida de PDF se expone como `POST /api/qr/list-pdf` (frontend) → `POST /qr/list-pdf` (backend). Además `backend-portaqr` corre en el puerto **3004** en docker-compose (las API routes usan `NEXT_PUBLIC_BFF_URL || 'http://localhost:3001'`).

---

## 1. Objetivo

Permitir que cada QR **multilink** (`typeQr: 'list'`) tenga items de tipo **PDF** dentro de su `data.urlList[]` — además de los items de URL/redes sociales/vCard ya existentes y de la imagen de portada (`listImageUrl` de SPEC-002). Cada item PDF se renderiza en la landing pública como un **botón ancla** que descarga/abre el archivo sanitizado.

> [!info] Cardinalidad: items PDF configurables por QR
> Cada QR multilink puede tener **0 a N items PDF** dentro de `urlList[]`, donde N es configurable vía `MAX_PDF_ITEMS_PER_QR` (default 5). Cada item PDF tiene exactamente **1 archivo PDF** persistido en `documentUrl`. Reemplazar el PDF sobrescribe el mismo objeto R2 (mismo `key`). Eliminar el item PDF lo borra de R2 y del array.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-005 |
| --- | --- | --- |
| Adjuntar documentos a QR multilink | No soportado (solo URLs/vCard) | Items PDF con archivo en R2 |
| Hosting de PDFs | Inexistente | Cloudflare R2 (CDN, escala, coste bajo) |
| Seguridad de archivos | n/a | Ghostscript sanitiza (sin JS, sin metadata, sin acciones) |
| Tamaño de BD MongoDB | sin cambio | sin cambio (solo un string por item PDF) |
| Experiencia móvil | n/a | Botón ancla con descarga directa |

### 1.2 Out of scope (no incluido en este spec)

- **Imágenes como items de lista** (solo PDF por ahora — decisión 2026-08-07). Las imágenes de portada siguen siendo `listImageUrl` (SPEC-002).
- Preview/visualización inline del PDF en la landing (solo botón de descarga).
- OCR o extracción de texto del PDF.
- Firmas digitales / cifrado del PDF.
- Watermarking ni moderación automática de contenido.
- Límite total de items en `urlList` (solo se limita PDFs — decisión 2026-08-07).
- Versionado/historial de PDFs (al reemplazar se sobrescribe el mismo objeto R2).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

#### Modelo de datos

- **RF-1**. Extender el tipo `QrUrlListItem` (en `qr.entity.ts`) para soportar items PDF. El item PDF tiene esta forma:
  ```ts
  {
    typeUrl: 'pdf',
    documentUrl: string,   // URL pública R2 del PDF sanitizado
    // url y vcard NO están presentes (exclusividad — ver RF-4)
  }
  ```
  Los items existentes (`url`, `vcard`) siguen funcionando sin cambios.

- **RF-2**. El campo `documentUrl` almacena la **URL pública** (`https://...`) devuelta por Cloudflare R2 tras la subida. No se almacena el binario en MongoDB.

- **RF-3**. El item PDF es **mutable**: se puede subir, cambiar (sobrescribir el PDF del mismo item) y eliminar (quitar el item del array) en cualquier momento vía `PATCH /qr/{id}`. Al eliminar el item, el backend borra el objeto R2 correspondiente (RF-14).

- **RF-4**. El `validator` del schema (exclusividad por `typeQr` y por tipo de item) **debe rechazar** items PDF que tengan `url` o `vcard` (y viceversa). La regla de exclusividad por item:
  - `typeUrl === 'pdf'` → exige `documentUrl`, prohíbe `url` y `vcard`.
  - `typeUrl` es red social / `web` / `email` / `teléfono` / `whatsapp` / `google maps` → exige `url`, prohíbe `documentUrl` y `vcard`.
  - `typeUrl === 'vcard'` → exige `vcard`, prohíbe `url` y `documentUrl`.

- **RF-5**. **Límite de items PDF por QR**: máximo `MAX_PDF_ITEMS_PER_QR` items con `typeUrl: 'pdf'` por QR (env var, default `5`). El backend valida al crear/actualizar: si el `urlList` resultante tiene más items PDF que el límite, responde `400 Bad Request`. El frontend usa el mismo env var (expuesto vía `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR`) para bloquear la UI al alcanzar el límite.

#### Formatos y límites de entrada

- **RF-6**. El frontend permitirá al usuario seleccionar un PDF desde su dispositivo (input `file`, `accept="application/pdf,.pdf"`). **Formato de entrada aceptado**: solo `application/pdf`. Cualquier otro formato → `415 Unsupported Media Type`.
- **RF-7**. Tamaño máximo de archivo de **entrada**: **2 MB** (validado en frontend antes de subir y revalidado en backend via `limits.fileSize` de multer). Si excede → `413 Payload Too Large`. Justificación: el límite cubre PDFs típicos de menús, catálogos, fichas técnicas; el archivo **final** sanitizado por gs queda re-comprimido a 72 DPI (típicamente más pequeño que el original).

#### Procesamiento en backend (sanitización con Ghostscript)

> [!important] Principio de seguridad
> El backend **no confía en el binario** que recibe. Lo re-procesa con **Ghostscript** (`gs`), que re-renderiza el PDF desde cero descartando todo lo que no sea contenido visual:
> - **JavaScript embebido** (`/JS`, `/JavaScript`) eliminado.
> - **Acciones automáticas** (`/OpenAction`, `/AA`) eliminadas.
> - **Metadata** (`/Author`, `/Creator`, `/Producer`, `/Title`, `/Subject`, `/Keywords`) eliminada.
> - **Embedded files** (archivos adjuntos dentro del PDF) eliminados.
> - **Formularios** con datos pre-cargados eliminados.
> - **Objetos ocultos / polyglot** eliminados (gs solo conserva contenido visual).
> - **Pixels inválidos / corruptos** → gs lanza error → endpoint responde `422 Unprocessable PDF`.

- **RF-8**. El PDF se sanitiza con **Ghostscript** en backend, ejecutando este pipeline canónico vía `child_process.spawn`:

  ```bash
  gs -dNOPAUSE -dBATCH -dQUIET \
     -dPDFSTOPONERROR \
     -dCompatibilityLevel=1.7 \
     -dPDFSETTINGS=/screen \
     -sDEVICE=pdfwrite \
     -dColorImageResolution=72 \
     -dGrayImageResolution=72 \
     -dMonoImageResolution=72 \
     -dEmbedAllFonts=true \
     -dSubsetFonts=true \
     -dDetectDuplicateImages=true \
     -sOutputFile=- -   # stdin → stdout
  ```

  > [!note] Justificación de parámetros
  > - `-dPDFSETTINGS=/screen`: preset de 72 DPI (más comprimido, ideal para móvil).
  > - `-dPDFSTOPONERROR`: si gs encuentra un error de parsing, aborta (→ `422`).
  > - `-dCompatibilityLevel=1.7`: PDF moderno, soportado por todos los visores.
  > - `-dEmbedAllFonts=true -dSubsetFonts=true`: fonts embebidas y sub-seteadas (PDF autocontenido).
  > - `-dDetectDuplicateImages=true`: desduplica imágenes repetidas (reduce tamaño).

- **RF-9**. **Resolución de salida**: 72 DPI (`/screen`). Justificación:
  - La página pública muestra el PDF como descarga (no render inline) — el usuario lo abre en su visor nativo.
  - 72 DPI es suficiente para visualización en pantalla móvil (la mayoría de los PDFs de menús/catálogos se ven en celular).
  - Re-compresión reduce tamaño significativamente (cumple el límite de 2MB y reduce ancho de banda).
  - Si el usuario necesita alta calidad de impresión, puede subir un PDF ya optimizado (gs respetará la resolución si es menor).

- **RF-10**. El PDF sanitizado se sube al bucket R2 **desde el backend** con `PutObjectCommand` (SDK S3). **El objeto R2 NO se hace público hasta después de la subida exitosa**: si `PutObjectCommand` falla, el endpoint responde error y **no se persiste nada** en MongoDB (no queda URL huérfana apuntando a un objeto inexistente).

- **RF-11**. El nombre del objeto en R2 sigue el patrón:
  `qr-multilink-pdf/{idQr}-{itemId}.pdf`
  - `qr-multilink-pdf/`: **carpeta/prefijo** dedicada a los PDFs de items de QRs multilink. Aísla este tipo de asset de las imágenes de portada (`qr-multilink/` de SPEC-002) y de futuros uploads.
  - `{idQr}`: UUID v4 del QR.
  - `{itemId}`: identificador único del item dentro de `urlList[]` (ver RF-12 sobre generación de itemId).
  - Extensión siempre `.pdf`.

  > [!note] Sobrescritura y auditoría
  > Al sobrescribir el objeto (mismo `key` con mismo `itemId`) no se acumulan versiones huérfanas en el bucket. La auditoría se logra por (a) el `idQr` + `itemId` en el nombre y (b) logs del backend (`r2_object_put` con `{ idQr, itemId, userId, size }`). No se guardan versiones previas (out of scope, ver §11).

#### Generación de itemId

- **RF-12**. Cada item de `urlList[]` (sin importar el tipo) debe tener un **`itemId`** único y estable que lo identifique dentro del array. Esto permite:
  - Nombrar el objeto R2 sin colisiones (`{idQr}-{itemId}.pdf`).
  - Identificar qué objeto R2 borrar al eliminar/reemplazar un item PDF.
  - El `itemId` se genera en el **frontend** al crear el item (UUID v4 o `crypto.randomUUID()`) y se persiste como campo del item en Mongo. Al editar, el `itemId` se mantiene estable (no se regenera).

  > [!warning] Migración de items existentes
  > Los items de `urlList[]` existentes (pre-SPEC-005) **no tienen `itemId`**. Se debe agregar un campo `itemId` con un UUID generado al vuelo en el mapper `toDomain` si no existe (mejor esfuerzo — no requiere migración masiva). Los items PDF nuevos siempre tendrán `itemId` desde el frontend.

#### Flujo de subida y persistencia

- **RF-13**. La subida se hace **vía backend** (multipart/form-data). Cadena completa:
  1. Frontend: validación cliente (tipo PDF, tamaño ≤2MB). Muestra nombre del archivo seleccionado.
  2. Frontend: `POST /api/qr/list-pdf` (API route del frontend, lee cookie httpOnly y reenvía) → `POST /qr/list-pdf` (backend) con `multipart/form-data` (campo `idQr` en form-text, campo `itemId` en form-text, campo `file` en form-file).
  3. Backend: `@UseInterceptors(FileInterceptor)` de `@nestjs/platform-express` + `multer` con `limits.fileSize: 2MB`, `storage: memoryStorage()` (no toca disco), `fileFilter` con allowlist de MIME types (`application/pdf`).
  4. Backend: verificar owner (JWT) + `typeQr === 'list'` del QR identificado por `idQr`.
  5. Backend: verificar que el item identificado por `itemId` existe en `urlList[]` y tiene `typeUrl === 'pdf'`.
  6. Backend: verificar límite `MAX_PDF_ITEMS_PER_QR` (si es un item PDF nuevo, contar items PDF actuales).
  7. Backend: pipeline Ghostscript (RF-8) genera buffer PDF sanitizado.
  8. Backend: `PutObjectCommand` a R2 con `ContentType: 'application/pdf'` (RF-10).
  9. Backend: `PATCH` interno a MongoDB → actualiza `documentUrl` del item identificado por `itemId` en `data.urlList[]`.
  10. Backend responde `200 { documentUrl, size, itemId }`.
  11. Frontend actualiza estado y muestra botón de descarga.

  > [!success] Por qué multipart vía backend y NO presigned URL directa
  > Misma justificación que SPEC-002: el backend **debe** recibir el binario para sanitizarlo con Ghostscript. Con presigned directa el backend nunca ve el binario y no puede eliminar JavaScript/metadata embebidos. Trade-off aceptado: el backend consume memoria/banda durante la subida; se mitiga con `memoryStorage` + `limits.fileSize: 2MB` + `fileFilter`.

- **RF-14**. La URL pública `documentUrl` se compone de `CLOUDFLARE_R2_PUBLIC_URL` + key (ver RF-11).

- **RF-15**. **Eliminación de item PDF**: al hacer `PATCH /qr/{idQr}` (frontend) → `PATCH /qr/{idQr}` (backend) con un `urlList` que ya no incluye el item PDF (o lo incluye sin `documentUrl`), el backend:
  - **Borra el objeto R2** del item eliminado vía `DeleteObjectCommand` — el PDF se elimina también del storage, no solo de MongoDB.
  - Persiste el `urlList` actualizado en MongoDB.
  - Si `DeleteObjectCommand` falla (red, no existe, etc.), se registra `ERROR` log (`r2_failed_delete`) pero **no aborta** el `PATCH` (la URL queda sin referencia en Mongo y el objeto R2 queda huérfano — lifecycle rule §6.4 lo limpiará).

- **RF-16**. **Reemplazo de PDF**: el endpoint `POST /qr/list-pdf` (vía `/api/qr/list-pdf`) puede invocarse nuevamente con un nuevo `file` para el mismo `{idQr, itemId}`; retorna nueva `documentUrl` (sobrescribe el mismo objeto R2, mismo `key`). El `UpdateQrUseCase` (o el controller) al recibir `PATCH` con un `documentUrl` distinto al actual para el mismo `itemId`, borra el objeto R2 anterior de forma **mejor esfuerzo** (log si falla, no abortar).

#### UI /UX

- **RF-17**. **Crear QR multilink** (`CreateQrForm.tsx` → `ListUrlForm.tsx`): el `Select` de tipo de enlace incluye una nueva opción **"PDF"** (`typeUrl: 'pdf'`). Al seleccionarla:
  - Se muestra un input `file` con `accept="application/pdf,.pdf"`.
  - Al seleccionar archivo: validar tipo/tamaño en cliente (≤2 MB; si no es PDF → error inmediato).
  - Se genera un `itemId` (UUID v4) para el item.
  - El upload real se dispara en el `handleSubmit` de `CreateQrForm` después de crear el QR y obtener `idQr` (mismo patrón que SPEC-002 §4.2.3). Si falla la subida → el QR queda creado sin el PDF y se muestra toast de warning (se puede agregar después desde editar).
  - El `name` textual del item (etiqueta del botón) es opcional; si no se provee, se usa el nombre del archivo.

- **RF-18**. **Editar QR multilink** (`/dashboard/qr/edit/[id]`): mismo bloque, pero:
  - Si el item PDF ya tiene `documentUrl` (ya subido), se muestra un **botón ancla** `<a href={documentUrl} download>` con el nombre del archivo y un botón "Eliminar" (trash icon) que quita el item del array (dispara `PATCH` con `urlList` sin el item → backend borra R2).
  - Si el item PDF no tiene `documentUrl` (item creado pero sin archivo), se muestra el input `file` para subirlo.
  - Se puede cambiar el PDF (nueva subida sobrescribe el mismo `key`).

- **RF-19**. **Página pública** (`https://portaqr.cl/qr/{idQr}` → `UrlList.tsx`): los items con `typeUrl === 'pdf'` se renderizan como un **botón ancla** `<a>` (no `<button>`) con:
  - `href={item.documentUrl}`
  - `target="_blank"` (abre en nueva pestaña) o `download` (descarga directa) — decisión: `target="_blank"` + `rel="noopener noreferrer"` para que el visor nativo del navegador lo abra.
  - **Color distintivo**: `bg-red-600 hover:bg-red-700` (rojo — diferenciado de las redes sociales).
  - **Icono**: `file-text` o `document` de lucide-react.
  - **Label**: el nombre del archivo o una etiqueta personalizada.
  - Si `documentUrl` no existe (item PDF sin archivo subido), el item **no se renderiza** en la página pública (no se muestra botón roto).

  > [!note] Sin fallback
  > Si el PDF no carga por cualquier motivo (404/403, error de red, formato corrupto), el navegador nativo mostrará su mensaje de error. No se implementa fallback custom — el botón ancla simplemente no abrirá el archivo. El usuario puede reintentar.

- **RF-20**. La página pública debe cargar el botón PDF sin optimización especial (es un `<a>`, no un recurso). No se usa `loading="lazy"` (no aplica a links).

### 2.2 Criterios de aceptación (CA)

- **CA-01**. Un usuario autenticado puede crear un QR `list` SIN items PDF y el flujo funciona exactamente igual que hoy (sin regresión).
- **CA-02**. Un usuario autenticado puede crear un QR `list` CON un item PDF: el PDF se sube a R2, la URL queda persistida en `documentUrl` del item, y la página pública `/qr/[id]` muestra un botón ancla rojo que abre el PDF.
- **CA-03**. El usuario puede editar un QR `list` existente y agregar un nuevo item PDF: una nueva subida persiste la URL en el item correspondiente.
- **CA-04**. El usuario puede editar un QR `list` existente y **reemplazar** el PDF de un item: una nueva subida con el mismo `{idQr, itemId}` sobrescribe el objeto R2 (mismo `key`) y actualiza `documentUrl`.
- **CA-05**. El usuario puede **eliminar** un item PDF de un QR `list` existente: el `PATCH` con `urlList` sin el item limpia el campo en MongoDB **y borra el objeto correspondiente del bucket R2** (verificar `DeleteObjectCommand` fue invocado con el `key` correcto). La página pública ya no muestra el botón y la URL R2 devuelve `404` tras el borrado.
- **CA-06**. Un usuario NO propietario del QR recibe `403` al llamar `POST /qr/list-pdf` para un `idQr` ajeno.
- **CA-07**. Intentar subir un archivo de tamaño > 2 MB recibe `413 Payload Too Large` (frontend en UI; backend en multer `limits.fileSize`) antes de tocar R2. Un archivo con formato no PDF (p. ej. `.docx`, `.exe`) recibe `415 Unsupported Media Type`.
- **CA-08**. Un binario que Ghostscript no puede procesar (PDF corrupto, falseado, o con estructura inválida) recibe `422 Unprocessable PDF` y **no se persiste ni se sube nada** a R2.
- **CA-09**. La validación del schema (exclusividad por `typeQr` y por tipo de item) sigue pasando: un item con `typeUrl: 'pdf'` solo se persiste si tiene `documentUrl` y no tiene `url` ni `vcard`; un item con `url` no puede tener `documentUrl`.
- **CA-10**. Si el `urlList` resultante tiene más items PDF que `MAX_PDF_ITEMS_PER_QR` (default 5), el backend responde `400 Bad Request` y el frontend bloquea la UI al alcanzar el límite.
- **CA-11**. El PDF sanitizado con Ghostscript **no contiene JavaScript embebido** (verificar con `pdfinfo` o parser que `/JS` y `/JavaScript` no existen en el árbol de nombres).
- **CA-12**. El PDF sanitizado con Ghostscript **no contiene metadata de autor/creador** (verificar que `/Author`, `/Creator`, `/Producer` están vacíos o ausentes).
- **CA-13**. El PDF sanitizado con Ghostscript **no contiene acciones automáticas** (verificar que `/OpenAction` y `/AA` no existen en el catálogo).

---

## 3. Decisiones de diseño (con ADR embebido)

### 3.1 ADR-005.1 — Modelo del item PDF en urlList

> [!question] Contexto
> El schema tiene `QrData.urlList?: Array<{ url?, vcard?, typeUrl }>` y `typeQr: 'list'`. ¿Cómo modelar el item PDF? ¿Como un campo aparte (como `listImageUrl` de SPEC-002) o como un item de la lista?

> [!tip] Alternativas consideradas
> - **A)** Campo `listPdfUrl: string | null` a nivel del `QrData` (junto a `listImageUrl`). Pros: patrón idéntico a SPEC-002. Contras: solo 1 PDF por QR; no permite múltiples PDFs en la lista.
> - **B)** Item dedicado en `urlList[]` con `typeUrl: 'pdf'` y `documentUrl`. Pros: permite múltiples PDFs (hasta el límite), semánticamente "un enlace más que es un PDF", reutiliza la UI de la lista. Contras: requiere extender el schema de `urlList` y el validador. ✅
> - **C)** Array separado `listPdfUrls: string[]`. Pros: aísla PDFs de URLs. Contras: duplica la estructura, la UI de la lista no los muestra ordenados con los demás items.

> [!success] Decisión
> **Alternativa B**. Item dedicado en `urlList[]` con `typeUrl: 'pdf'` y `documentUrl`. El item PDF tiene exclusividad: no puede tener `url` ni `vcard` (RF-4). El `itemId` identifica al item dentro del array para nombrar el objeto R2 y gestionar borrados.

### 3.2 ADR-005.2 — Sanitización con Ghostscript (vs pdf-lib, qpdf)

> [!question] Contexto
> ¿Cómo sanitizar el PDF para eliminar metadata y prevenir archivos maliciosos (JavaScript embebido, acciones automáticas, embedded files)?

> [!tip] Alternativas consideradas
>
> | Criterio | A) Ghostscript ✅ | B) pdf-lib (puro JS) | C) qpdf |
> | --- | --- | --- | --- |
> | Elimina JavaScript embebido (`/JS`, `/JavaScript`) | ✅ Sí (re-renderiza) | ❌ No (no re-renderiza) | ⚠️ Parcial |
> | Elimina acciones automáticas (`/OpenAction`, `/AA`) | ✅ Sí | ❌ No | ⚠️ Parcial |
> | Elimina metadata (`/Author`, `/Creator`, etc.) | ✅ Sí | ✅ Sí (manual) | ✅ Sí |
> | Elimina embedded files | ✅ Sí | ❌ No | ⚠️ Parcial |
> | Re-comprime imágenes | ✅ Sí (configurable DPI) | ❌ No | ❌ No |
> | Detecta PDFs corruptos | ✅ Sí (`-dPDFSTOPONERROR` → 422) | ⚠️ Parcial | ✅ Sí |
> | Dependencias | Binario `gs` (instalar en Docker) | npm puro JS | Binario `qpdf` |
> | Latencia (2MB PDF) | ~1-3s | ~0.5s | ~0.5s |
> | Estándar de la industria | ✅ Sí (motor de evince, okular, impresoras) | No | Parcial |

> [!success] Decisión
> **Alternativa A: Ghostscript**. Razones:
> 1. **Sanitización robusta**: re-renderiza el PDF desde cero, descartando todo lo que no sea contenido visual. Es el único que elimina JavaScript embebido y acciones automáticas de forma garantizada.
> 2. **Re-compresión**: reduce tamaño (útil con límite de 2MB) y re-embeds fonts.
> 3. **Detección de corruptos**: `-dPDFSTOPONERROR` aborta si el PDF está corrupto → `422`.
> 4. **Estándar de la industria**: motor de casi todos los visores de PDF de Linux.
> 5. **Trade-off aceptado**: requiere instalar `gs` en el contenedor Docker (~30MB extra en la imagen) y latencia de ~1-3s por upload.

> [!warning] Trade-off aceptado
> - **Binario externo**: `gs` debe estar en el contenedor. Se agrega al Dockerfile: `RUN apt-get update && apt-get install -y ghostscript && rm -rf /var/lib/apt/lists/*`.
> - **Latencia**: ~1-3s por upload de 2MB. Aceptable para subidas interactivas (no es streaming).
> - **Spawn de proceso**: cada upload genera un proceso `gs`. Para alta concurrencia, futuro: pool de procesos o cola (§11.4).

### 3.3 ADR-005.3 — Key del objeto R2 con itemId

> [!question] Contexto
> SPEC-002 usó `qr-multilink/{idQr}.webp` (1 imagen por QR). Como SPEC-005 permite múltiples items PDF por QR, ¿cómo nombrar el objeto R2 para evitar colisiones?

> [!tip] Alternativas consideradas
> - **A)** `qr-multilink-pdf/{idQr}.pdf` — solo 1 PDF por QR. Contradice la decisión de que el PDF es un item de la lista (puede haber varios).
> - **B)** `qr-multilink-pdf/{idQr}-{itemId}.pdf` — incluye el `itemId` del item. Permite múltiples PDFs sin colisiones. Al reemplazar el PDF del mismo item, sobrescribe el mismo `key`. ✅
> - **C)** `qr-multilink-pdf/{idQr}-{timestamp}.pdf` — cada subida genera un nuevo objeto. No sobrescribe. Requiere limpieza de huérfanos.

> [!success] Decisión
> **Alternativa B**: `qr-multilink-pdf/{idQr}-{itemId}.pdf`. El `itemId` identifica al item dentro de `urlList[]` y es estable (no cambia al editar). Al reemplazar el PDF del mismo item, sobrescribe el mismo `key` (sin huérfanos). Al eliminar el item, el backend borra el objeto R2 correspondiente.

---

## 4. Cambios por capa

### 4.1 Backend — `backend-portaqr/`

> [!note] Estructura hexagonal
> SPEC-001 ya aisló el dominio en `domain/`, `application/`, `infrastructure/`, `presentation/`. SPEC-002 ya creó `modules/storage/`. Este spec respeta esa segmentación y **reutiliza** `StorageService` (extendido).

#### 4.1.1 Dominio — `domain/entities/qr.entity.ts`

Extender `QrUrlListItem`:

```ts
export interface QrUrlListItem {
  itemId?: string;            // ⬅ NUEVO: identificador único del item dentro del array
  vcard?: unknown;
  url?: string;
  documentUrl?: string | null; // ⬅ NUEVO: URL pública R2 del PDF (solo typeUrl === 'pdf')
  typeUrl: string;
}
```

> [!note] itemId opcional por retrocompatibilidad
> `itemId` es **opcional** en la entity para no romper los items existentes (pre-SPEC-005). El mapper `toDomain` lo genera al vuelo si no existe (ver §4.1.7). Los items PDF nuevos siempre lo traen desde el frontend.

#### 4.1.2 DTOs

**`application/dto/create-qr.dto.ts`** — dentro de la clase `QrUrlListItem` (o equivalente):

```ts
export class QrUrlListItemDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @ValidateIf((o) => o.typeUrl === 'pdf')
  @IsOptional()
  @IsUrl({}, { message: 'La URL del documento debe ser válida' })
  documentUrl?: string | null;

  @ValidateIf((o) => o.typeUrl !== 'pdf' && o.typeUrl !== 'vcard')
  @IsOptional()
  @IsString()
  url?: string;

  @ValidateIf((o) => o.typeUrl === 'vcard')
  @IsOptional()
  vcard?: unknown;

  @IsString()
  typeUrl: string;
}
```

**`application/dto/update-qr.dto.ts`** — `UpdateQrDto extends PartialType(CreateQrDto)` ya existente; verificar que `@IsOptional` no chille con `null` en `documentUrl`.

#### 4.1.3 Schema Mongoose — `infrastructure/repository/mongo/schemas/qr.schema.ts`

Extender el tipo `urlList` dentro de `data`:

```ts
urlList: {
  type: [{
    itemId: { type: String, required: false },    // ⬅ NUEVO
    vcard: { type: SchemaTypes.Mixed },
    url: { type: String },
    documentUrl: { type: String, required: false, default: null }, // ⬅ NUEVO
    typeUrl: { type: String },
  }],
  required: false,
  default: undefined,
  _id: false,
},
```

Actualizar el `validate.validator` del `data` para el `case 'list'` — agregar validación de exclusividad por item:

```ts
case 'list':
  if (!value.urlList) return false;
  // Exclusividad a nivel de item (RF-4)
  for (const item of value.urlList) {
    if (item.typeUrl === 'pdf') {
      // PDF: exige documentUrl, prohíbe url y vcard
      if (!item.documentUrl || item.url || item.vcard) return false;
    } else if (item.typeUrl === 'vcard') {
      // vCard: exige vcard, prohíbe url y documentUrl
      if (!item.vcard || item.url || item.documentUrl) return false;
    } else {
      // URL/red social: exige url, prohíbe vcard y documentUrl
      if (!item.url || item.vcard || item.documentUrl) return false;
    }
  }
  // Exclusividad a nivel de QR (sin cambios)
  return !value.url && !value.whatsappUrl && !value.emailUrl && !value.phoneUrl
    && !value.wifiData && !value.text && !value.vcardData && !value.petData
    && !value.mapUrl;
```

> [!note] Tipos TS del schema
> Actualizar el tipo TS declarado de la propiedad `data` en `QrSchema` (líneas ~197-247) agregando `itemId?: string` y `documentUrl?: string | null` al tipo `urlList[]`.

#### 4.1.4 Extender módulo Storage — `modules/storage/`

**`storage.service.ts`** — agregar método `uploadPdf`:

```ts
async uploadPdf(input: {
  idQr: string;
  itemId: string;
  buffer: Buffer;          // PDF ya sanitizado por Ghostscript
}): Promise<UploadedPdf> {
  const key = `qr-multilink-pdf/${input.idQr}-${input.itemId}.pdf`;
  const publicUrl = this.publicBaseUrl ? `${this.publicBaseUrl}/${key}` : key;

  await this.r2.send(
    new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: 'application/pdf',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  this.logger.log(
    `r2_object_put { idQr: ${input.idQr}, itemId: ${input.itemId}, size: ${input.buffer.length} }`,
  );
  return { publicUrl, key, size: input.buffer.length };
}
```

Extender `extractKeyFromUrl` para soportar el prefijo `qr-multilink-pdf/`:

```ts
private extractKeyFromUrl(publicUrl: string): string | null {
  if (!publicUrl) return null;
  if (this.publicBaseUrl && publicUrl.startsWith(this.publicBaseUrl)) {
    return publicUrl.slice(this.publicBaseUrl.length + 1);
  }
  // Soporta ambos prefijos: qr-multilink/ (SPEC-002) y qr-multilink-pdf/ (SPEC-005)
  const match = publicUrl.match(/(qr-multilink(?:-pdf)?\/[\w-]+\.(?:webp|pdf))$/);
  return match ? match[1] : null;
}
```

**Nuevo `pdf-sanitizer.service.ts`** — wrapper de Ghostscript:

```ts
import { Injectable, UnprocessableEntityException, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export interface SanitizedPdf {
  buffer: Buffer;
  size: number;
}

/**
 * Sanitiza un PDF con Ghostscript (RF-8):
 * - Re-renderiza el PDF desde cero (pdfwrite) descartando JS, acciones, metadata, embedded files.
 * - Re-comprime a 72 DPI (/screen).
 * - Si el PDF está corrupto → -dPDFSTOPONERROR aborta → 422 Unprocessable PDF.
 */
@Injectable()
export class PdfSanitizerService {
  private readonly logger = new Logger(PdfSanitizerService.name);

  async sanitize(inputBuffer: Buffer): Promise<SanitizedPdf> {
    return new Promise((resolve, reject) => {
      const args = [
        '-dNOPAUSE', '-dBATCH', '-dQUIET',
        '-dPDFSTOPONERROR',
        '-dCompatibilityLevel=1.7',
        '-dPDFSETTINGS=/screen',
        '-sDEVICE=pdfwrite',
        '-dColorImageResolution=72',
        '-dGrayImageResolution=72',
        '-dMonoImageResolution=72',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        '-dDetectDuplicateImages=true',
        '-sOutputFile=-',
        '-',
      ];

      const gs = spawn('gs', args);
      const chunks: Buffer[] = [];
      let stderrData = '';

      gs.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      gs.stderr.on('data', (data: Buffer) => { stderrData += data.toString(); });
      gs.on('error', (err) => {
        this.logger.error(`gs spawn error: ${err.message}`);
        reject(new UnprocessableEntityException('No se pudo ejecutar Ghostscript'));
      });
      gs.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn(`gs exited with code ${code}: ${stderrData}`);
          reject(new UnprocessableEntityException(
            'El PDF no se pudo procesar: archivo corrupto o inválido',
          ));
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          reject(new UnprocessableEntityException('El PDF sanitizado está vacío'));
          return;
        }
        this.logger.log(`pdf_sanitized { inputBytes: ${inputBuffer.length}, outputBytes: ${buffer.length} }`);
        resolve({ buffer, size: buffer.length });
      });

      gs.stdin.write(inputBuffer);
      gs.stdin.end();
    });
  }
}
```

**`storage.module.ts`** — registrar el nuevo provider:

```ts
@Module({
  providers: [StorageService, ImageProcessorService, PdfSanitizerService],
  exports: [StorageService, ImageProcessorService, PdfSanitizerService],
})
export class StorageModule {}
```

**Dependencia nueva**: `ghostscript` (binario del sistema — instalar en Dockerfile, no es npm).

#### 4.1.5 Controller — endpoint multipart

En `presentation/controllers/qr.controller.ts`, agregar `POST /qr/list-pdf`:

```ts
const LIST_PDF_ALLOWED_MIME = ['application/pdf'];

function getListPdfMaxUploadSize(): number {
  const raw = process.env.PDF_MAX_UPLOAD_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 1024 * 1024; // default 2 MB
}

function getMaxPdfItemsPerQr(): number {
  const raw = process.env.MAX_PDF_ITEMS_PER_QR;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

@Post('list-pdf')
@Roles('admin', 'user')
@HttpCode(HttpStatus.OK)
@ApiConsumes('multipart/form-data')
@ApiBody({
  description: 'Subida de PDF para item de QR multilink (SPEC-005)',
  schema: {
    type: 'object',
    properties: {
      idQr: { type: 'string', description: 'UUID v4 del QR (typeQr: list)' },
      itemId: { type: 'string', description: 'Identificador único del item dentro de urlList[]' },
      file: { type: 'string', format: 'binary', description: 'PDF (application/pdf, máx 2MB)' },
    },
  },
})
@ApiOperation({ summary: 'Subir PDF de un item de QR multilink (sanitiza con gs y sube a R2)' })
@ApiResponse({ status: 200, description: 'PDF subido. Retorna { documentUrl, size, itemId }' })
@ApiResponse({ status: 403, description: 'Prohibido - no es el propietario' })
@ApiResponse({ status: 400, description: 'El QR no es de tipo list, falta idQr/itemId, o límite excedido' })
@ApiResponse({ status: 413, description: 'Archivo mayor a 2 MB' })
@ApiResponse({ status: 415, description: 'Formato no soportado (solo application/pdf)' })
@ApiResponse({ status: 422, description: 'El PDF no se pudo procesar (corrupto)' })
@UseInterceptors(
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: getListPdfMaxUploadSize() }, // RF-7: PDF_MAX_UPLOAD_SIZE (default 2 MB)
    fileFilter: (_req, file, cb) => {
      if (!LIST_PDF_ALLOWED_MIME.includes(file.mimetype)) {
        return cb(
          new UnsupportedMediaTypeException(
            'Formato no soportado. Solo se aceptan archivos PDF',
          ),
          false,
        );
      }
      cb(null, true);
    },
  }),
)
async uploadListPdf(
  @UploadedFile() file: Express.Multer.File,
  @Body('idQr') idQr: string,
  @Body('itemId') itemId: string,
  @GetUser() user: User,
  @Tracking() tracking: TrackingContext,
): Promise<{ documentUrl: string; size: number; itemId: string }> {
  this.traceService.log(tracking, TraceLayer.CONTROLLER, 'POST /qr/list-pdf', { idQr, itemId, userId: user.id });

  if (!file) throw new BadRequestException('El archivo es requerido (campo "file")');
  if (!idQr) throw new BadRequestException('El campo idQr es requerido');
  if (!itemId) throw new BadRequestException('El campo itemId es requerido');

  // 1. Validar que el QR existe, es del usuario y es tipo 'list'
  const qr = await this.getQrUseCase.execute(idQr, tracking);
  if (!qr) throw new NotFoundException('QR no encontrado');
  const isAdmin = user.role === 'admin';
  if (!isAdmin && qr.userId !== user.id) {
    this.traceService.warn(tracking, TraceLayer.CONTROLLER, 'POST /qr/list-pdf - forbidden owner', {
      requester: user.id, owner: qr.userId,
    });
    throw new ForbiddenException('No tienes permiso para subir un PDF a este QR');
  }
  if (qr.typeQr !== 'list') {
    this.traceService.warn(tracking, TraceLayer.CONTROLLER, 'POST /qr/list-pdf - wrong type', { idQr, typeQr: qr.typeQr });
    throw new BadRequestException('Solo los QRs multilink (list) admiten items PDF');
  }

  // 2. Validar límite MAX_PDF_ITEMS_PER_QR (RF-5)
  const urlList = qr.data?.urlList ?? [];
  const existingItem = urlList.find((it) => it.itemId === itemId);
  const isReplacement = !!existingItem;
  if (!isReplacement) {
    const pdfCount = urlList.filter((it) => it.typeUrl === 'pdf').length;
    if (pdfCount >= getMaxPdfItemsPerQr()) {
      throw new BadRequestException(
        `Límite excedido: máximo ${getMaxPdfItemsPerQr()} items PDF por QR`,
      );
    }
  }

  // 3. Sanitizar con Ghostscript (RF-8)
  const { buffer, size } = await this.pdfSanitizer.sanitize(file.buffer);

  // 4. Subir a R2 (RF-11)
  const { publicUrl } = await this.storageService.uploadPdf({
    idQr: qr.idQr,
    itemId,
    buffer,
  });

  // 5. Actualizar el item en urlList (RF-13 paso 9)
  const updatedUrlList = isReplacement
    ? urlList.map((it) => it.itemId === itemId ? { ...it, documentUrl: publicUrl } : it)
    : [...urlList, { itemId, typeUrl: 'pdf', documentUrl: publicUrl }];

  await this.updateQrUseCase.execute(
    qr.idQr,
    {
      data: {
        ...qr.data,
        urlList: updatedUrlList,
        typeQr: qr.data.typeQr as QrType,
      },
    } as Partial<CreateQrDto>,
    tracking,
  );

  this.traceService.log(tracking, TraceLayer.CONTROLLER, 'POST /qr/list-pdf - complete', {
    idQr, itemId, documentUrl: publicUrl, size,
  });

  return { documentUrl: publicUrl, size, itemId };
}
```

> [!note] Inyección de dependencias
> El constructor de `QrController` agrega `pdfSanitizer: PdfSanitizerService`. El `QrModule` ya importa `StorageModule` (desde SPEC-002), que ahora exporta `PdfSanitizerService`.

#### 4.1.6 Use cases

`UpdateQrUseCase` extender para:
- Al recibir un `PATCH` con `urlList` modificado, detectar items PDF eliminados (items que estaban en el `urlList` anterior con `documentUrl` y ya no están en el nuevo) y borrar sus objetos R2 (mejor esfuerzo — si falla, log + no aborta el patch).
- Al detectar un item PDF con `documentUrl` cambiado para el mismo `itemId`, borrar el objeto R2 anterior (mejor esfuerzo).

```ts
// En UpdateQrUseCase.execute, antes de persistir:
const oldUrlList = currentQr.data?.urlList ?? [];
const newUrlList = updateQrDto.data?.urlList ?? oldUrlList;

// Items PDF eliminados (estaban antes, ya no están)
const removedPdfItems = oldUrlList.filter(
  (old) => old.typeUrl === 'pdf' && old.documentUrl &&
    !newUrlList.find((nw) => nw.itemId === old.itemId),
);
for (const item of removedPdfItems) {
  if (item.documentUrl) {
    await this.storageService.deleteObject(item.documentUrl); // mejor esfuerzo
  }
}

// Items PDF con documentUrl reemplazado
for (const newItem of newUrlList) {
  if (newItem.typeUrl === 'pdf' && newItem.documentUrl) {
    const oldItem = oldUrlList.find((old) => old.itemId === newItem.itemId);
    if (oldItem?.documentUrl && oldItem.documentUrl !== newItem.documentUrl) {
      await this.storageService.deleteObject(oldItem.documentUrl); // mejor esfuerzo
    }
  }
}
```

> [!info] Dependencia de módulo
> `QrModule` ya importa `StorageModule` (desde SPEC-002). `UpdateQrUseCase` ya tiene acceso a `StorageService`.

#### 4.1.7 Mapper de persistencia

`infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts` (y su spec): propagar los campos nuevos en ambas direcciones:
- `toDomain`/`toEntity`: incluir `itemId` y `documentUrl` de cada item de `urlList`. Si un item no tiene `itemId`, generar uno al vuelo (`randomUUID()`) para que los items existentes tengan identificador estable.
- `toPersistence`: incluir `itemId` y `documentUrl` al guardar.

Sin esto, los campos no viajarían del schema a las entidades/usecases.

### 4.2 Frontend — `qr-app/`

#### 4.2.1 Servicio — `services/qr.service.ts`

```ts
export interface QrUrlListItem {
  itemId?: string;            // ⬅ NUEVO
  vcard?: unknown;
  url?: string;
  documentUrl?: string | null; // ⬅ NUEVO
  typeUrl: string;
}

// En QrService:
async uploadListPdf(
  idQr: string,
  itemId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ documentUrl: string; size: number; itemId: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('idQr', idQr);
    formData.append('itemId', itemId);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).message ?? `Error ${xhr.status}`)); }
        catch { reject(new Error(`Error ${xhr.status} al subir el PDF`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Error de red subiendo el PDF'));
    xhr.open('POST', `${this.baseUrl}/qr/list-pdf`);
    xhr.send(formData); // NO setear Content-Type: el boundary lo genera el navegador
  });
}
```

> [!note] API route nueva del frontend
> Crear `src/app/api/qr/list-pdf/route.ts` siguiendo el patrón de `src/app/api/qr/list-image/route.ts`: verifica el JWT con `getAuthUser()` (jose/cookies), reenvía el FormData al backend con `Authorization: Bearer` (sin header `Content-Type` manual para que multer reciba el boundary), y devuelve la respuesta del backend.

```ts
// src/app/api/qr/list-pdf/route.ts (esquema)
export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const formData = await request.formData();
  const token = await getTokenFromCookie();
  const headers: HeadersInit = { Authorization: token ? `Bearer ${token}` : '' };

  const response = await fetch(`${baseUrl}/qr/list-pdf`, {
    method: 'POST',
    headers,                    // sin 'Content-Type' — multer necesita el boundary del FormData
    body: formData,
  });
  // ...propaga status/JSON del backend...
}
```

#### 4.2.2 Componente de upload — `components/qr/ListPdfUploader.tsx` (nuevo)

Componente reusable con props:

```ts
interface ListPdfUploaderProps {
  idQr?: string;            // undefined en CreateQrForm (aún no existe QR)
  itemId: string;           // identificador del item (generado por el form)
  currentPdfUrl?: string | null;
  fileName?: string;        // nombre del archivo actual (para mostrar en el botón)
  onChange: (url: string | null) => void;
  onFileSelected?: (file: File | null) => void;  // para el flujo de creación
  onError: (msg: string) => void;
}
```

Renderiza:
- Si `currentPdfUrl` existe: **botón ancla** `<a href={currentPdfUrl} target="_blank" rel="noopener noreferrer">` con icono `file-text` y nombre del archivo + botón "Eliminar" (trash icon) → `onChange(null)`.
- Si no existe: drop zone con `Input type="file" accept="application/pdf,.pdf"`.
- Al seleccionar archivo:
  1. Validar tipo/tamaño en cliente (≤2 MB; si no es PDF → `onError` inmediato).
  2. Si `idQr` existe → `qrService.uploadListPdf(idQr, itemId, file, onProgress)` → `onChange(publicUrl)`.
  3. Si `idQr` no existe (creación) → mantener `File` en estado; el upload real se dispara en el `handleSubmit` de `CreateQrForm` después de crear el QR. Ver §4.2.3.
- Barra de progreso (1–100%) usando el `onProgress` de `uploadListPdf`.
- Muestra el `documentUrl` devuelto (o error 415/413/422 con mensaje claro del backend).

#### 4.2.3 Creación de QR — `CreateQrForm.tsx` + `ListUrlForm.tsx`

> [!warning] Secuencia en creación
> En el flujo de **crear nuevo QR**, el `idQr` se genera en el cliente (UUID v4). **El QR se crea PRIMERO y los PDFs se suben DESPUÉS** (el endpoint `POST /qr/list-pdf` valida que el QR exista). Flujo:
> 1. `handleSubmit`: `createQr({ ..., data: { ..., urlList: [...], typeQr: 'list' } })`. Los items PDF en el `urlList` se envían con `documentUrl: null` (aún sin archivo).
> 2. Por cada item PDF pendiente → `uploadListPdf(idQr, itemId, file, onProgress)` → el endpoint persiste la URL.
> 3. Si falla alguna subida → el QR queda creado sin ese PDF y se muestra toast de warning (se puede agregar después desde editar).

`ListUrlForm.tsx`:
- El `Select` de tipo de enlace agrega la opción **"PDF"** (`value: 'pdf'`).
- Al seleccionar 'pdf', se renderiza `<ListPdfUploader />` en lugar del `Input` de URL.
- Se genera un `itemId` (UUID v4) para el item al seleccionar 'pdf'.
- El `updateUrlList` agrega el item con `{ itemId, typeUrl: 'pdf', documentUrl: null }` (sin `url` ni `vcard`).

#### 4.2.4 Edición de QR — `dashboard/qr/edit/[id]/page.tsx`

- Carga el QR con `qrService.getQrById(id)`, obtiene `data.urlList`.
- Para items con `typeUrl === 'pdf'`, renderiza `<ListPdfUploader idQr={id} itemId={item.itemId} currentPdfUrl={item.documentUrl} onChange=... />`.
- En submit, envía `PATCH /api/qr?id` → `PATCH /qr/{id}` con `data: { ..., urlList }`. Si un item PDF se eliminó del array → backend borra R2 (RF-15).

#### 4.2.5 Página pública — `components/qr/UrlList.tsx`

Actualizar el render de items para soportar `typeUrl === 'pdf'`:

```tsx
{urls && urls.map((item, index) => {
  const itemKey = item.itemId || item.url || item.vcard?.fn || `url-${index}`;

  // SPEC-005: item PDF — botón ancla con color distintivo
  if (item.typeUrl === 'pdf' && item.documentUrl) {
    return (
      <a
        key={itemKey}
        href={item.documentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 px-6 py-4 rounded-lg
                   text-white font-medium transition-all duration-200
                   bg-red-600 hover:bg-red-700"
      >
        <Icon name="file-text" className="w-6 h-6" />
        <span>Descargar PDF</span>
      </a>
    );
  }

  // Si el item es PDF pero no tiene documentUrl, no se renderiza (RF-19)
  if (item.typeUrl === 'pdf' && !item.documentUrl) {
    return null;
  }

  // ... resto del render (vcard, url) sin cambios ...
})}
```

> [!note] Icono
> Se asume que el componente `Icon` soporta `name="file-text"` (lucide-react). Si no, agregar el icono al mapa de iconos.

> [!note] Sin fallback
> Si el PDF no carga (404/403/red), el navegador nativo mostrará su mensaje. No se implementa fallback custom.

#### 4.2.6 Tipos compartidos

**`interfaces/qr.ts`** (página pública):

```ts
export interface QrUrlListItem {
  itemId?: string;            // ⬅ NUEVO
  vcard?: unknown;
  url?: string;
  documentUrl?: string | null; // ⬅ NUEVO
  typeUrl: string;
}
```

**`interfaces/qr.interface.ts`** (dashboard): tipar los campos nuevos en el tipo `Qr`/`QrResponse` correspondiente.

### 4.3 Constantes

**`qr-app/src/constants/qrTypes.ts`** — agregar `'pdf'` al tipo de enlace si existe un enum/const de tipos.

**`qr-app/src/constants/social.const.ts`** — agregar entrada para 'pdf' con icono `file-text` y color `bg-red-600` (si el sistema de detección de tipos usa este array).

---

## 5. Variables de entorno (`.env`)

### 5.1 Backend `backend-portaqr/.env`

```env
# ───────── Cloudflare R2 (compartido con SPEC-002) ─────────
# Ya configuradas en SPEC-002:
# CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY,
# CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL

# ───────── SPEC-005: PDFs ─────────
# Límite de tamaño del PDF de entrada en bytes (default 2 MB)
PDF_MAX_UPLOAD_SIZE=2097152
# Máximo de items PDF por QR multilink (default 5)
MAX_PDF_ITEMS_PER_QR=5
```

Actualizar `backend-portaqr/.env.example` con estas claves (valores placeholder).

### 5.2 Frontend `qr-app/.env.local`

```env
# SPEC-005: límite de items PDF por QR (debe coincidir con el backend)
NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR=5
```

> [!note] Sincronización de límites
> El frontend usa `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR` para bloquear la UI al alcanzar el límite. El backend valida con `MAX_PDF_ITEMS_PER_QR`. Ambos deben tener el mismo valor. Si difieren, el backend tiene la última palabra (responde 400).

### 5.3 Docker Compose `desarrollo-qr/docker-compose.yml`

El servicio `backend-portaqr` ya carga sus variables vía `env_file: ./backend-portaqr/backendPortaqr.env`. Añadir las claves nuevas:

```env
PDF_MAX_UPLOAD_SIZE=2097152
MAX_PDF_ITEMS_PER_QR=5
```

> [!note] En producción (Railway)
> Añadir las mismas variables de entorno del servicio en Railway (secrets).

---

## 6. Configuración Docker (instalar Ghostscript)

### 6.1 Dockerfile de `backend-portaqr`

Agregar `ghostscript` al Dockerfile. Si el Dockerfile actual usa una imagen base `node:XX-slim` o `node:XX-alpine`, agregar:

**Para `node:XX-slim` (Debian-based):**
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ghostscript && rm -rf /var/lib/apt/lists/*
```

**Para `node:XX-alpine`:**
```dockerfile
RUN apk add --no-cache ghostscript
```

> [!warning] Verificar Dockerfile actual
> Revisar `desarrollo-qr/backend-portaqr/Dockerfile` (o el que use docker-compose) para aplicar la capa correcta. La imagen base determina el gestor de paquetes.

### 6.2 Verificación de instalación

En el contenedor, verificar:
```bash
gs --version
# Debe responder con la versión (ej. 10.01.2)
```

### 6.3 Cloudflare R2 (sin cambios)

SPEC-002 ya configuró el bucket `portaqr-assets` y las credenciales. SPEC-005 reutiliza el mismo bucket, solo cambia el prefijo de los objetos (`qr-multilink-pdf/` en vez de `qr-multilink/`).

**Política a nivel de bucket**: extender la política de solo lectura pública para `qr-multilink-pdf/*` (además de `qr-multilink/*`).

**Lifecycle (opcional, recomendado)**: regla de lifecycle para `qr-multilink-pdf/` sin uso en 90 días → `DeleteObject` (limpieza de PDFs huérfanos de QRs/items eliminados).

---

## 7. Plan de implementación (tareas)

> [!todo] Tareas
> Registrar como tareas en `docs/tareas/SPEC-005-tareas.json` (formato Taskmaster-compatible). Estimación ~4-5 días.

| ID | Tarea | Capa | Estimación |
| --- | --- | --- | --- |
| T-005-01 | Instalar `ghostscript` en Dockerfile del backend + verificar `gs --version` | Infra | 0.25d |
| T-005-02 | `PdfSanitizerService` (spawn gs) + tests unitarios (mock spawn) | Backend | 0.5d |
| T-005-03 | Extender `StorageService.uploadPdf` + `extractKeyFromUrl` para `qr-multilink-pdf/` | Backend | 0.25d |
| T-005-04 | Schema + DTO + entity: campos `itemId`, `documentUrl` en `urlList[]` + validador de exclusividad por item | Backend | 0.75d |
| T-005-05 | Endpoint `POST /qr/list-pdf` (multipart + FileInterceptor + gs + R2) + validación owner/tipo/limite | Backend | 1d |
| T-005-06 | `UpdateQrUseCase`: borrar R2 al eliminar/reemplazar item PDF + mapper `qr-mongo.mapper.ts` (itemId al vuelo) | Backend | 0.5d |
| T-005-07 | API route `/api/qr/list-pdf` (proxy con jose/cookies) + `uploadListPdf` en `qr.service.ts` | Frontend | 0.5d |
| T-005-08 | `ListPdfUploader.tsx` + integración en `ListUrlForm` (opción 'pdf' en Select) | Frontend | 1d |
| T-005-09 | Integrar en `edit/[id]/page.tsx` (editar/eliminar PDF) | Frontend | 0.5d |
| T-005-10 | Render en `UrlList.tsx` (botón ancla rojo para typeUrl === 'pdf') + tipos (`interfaces/qr.ts`, `qr.interface.ts`) | Frontend | 0.25d |
| T-005-11 | Tests unitarios `PdfSanitizerService` (mock spawn de gs) + `StorageService.uploadPdf` (mock S3 client) | Backend | 0.5d |
| T-005-12 | Tests integración endpoint multipart (supertest, sin tocar R2 real ni gs real) | Backend | 0.5d |
| T-005-13 | Tests unitarios `ListPdfUploader` (mock `uploadListPdf`) + API route proxy | Frontend | 0.5d |
| T-005-14 | Tests E2E: subir PDF real, verificar sanitización (sin JS, sin metadata) | QA | 0.5d |
| T-005-15 | Docs Obsidian + este spec polish | Docs | 0.25d |

---

## 8. Testing

### 8.1 Backend

- **Unitarios `PdfSanitizerService`** mockeando `child_process.spawn`:
  - PDF válido → buffer sanitizado no vacío.
  - gs exit code ≠ 0 → `422 Unprocessable PDF`.
  - gs spawn error (binario no encontrado) → `422` con mensaje "No se pudo ejecutar Ghostscript".
  - Buffer vacío de salida → `422`.
- **Unitarios `StorageService.uploadPdf`** mockeando `S3Client.send`:
  - `uploadPdf` genera `publicUrl` + `key` correcto (`qr-multilink-pdf/{idQr}-{itemId}.pdf`) y llama `PutObjectCommand` con `ContentType: 'application/pdf'`.
  - `deleteObject` extrae key correcto del `publicUrl` (con prefijo `qr-multilink-pdf/`) y llama `DeleteObjectCommand`.
- **Integración `POST /qr/list-pdf`** con supertest (multipart, sin tocar R2 real ni gs real — mock de `StorageService` y `PdfSanitizerService`):
  - 200 para owner legítimo con QR `list` (respuesta `{ documentUrl, size, itemId }`).
  - 403 si `userId` no coincide y no es admin.
  - 400 si `typeQr !== 'list'`.
  - 400 si excede `MAX_PDF_ITEMS_PER_QR`.
  - 413 si el archivo excede 2 MB.
  - 415 si MIME no es `application/pdf`.
  - 422 si gs no puede procesar el PDF (mock que lanza `UnprocessableEntityException`).
- **`UpdateQrUseCase`**: si se elimina un item PDF del `urlList`, invoca `deleteObject` de su `documentUrl` (mejor esfuerzo); si se reemplaza `documentUrl` para el mismo `itemId`, invoca `deleteObject` del anterior.

### 8.2 Frontend

- **`ListPdfUploader`** con mock de `qrService.uploadListPdf`:
  - archivo válido → muestra botón ancla con la URL devuelta.
  - archivo > 2 MB → `onError('…')`, no llama al backend.
  - extensión no PDF → `onError`.
  - botón "Eliminar" → `onChange(null)`.
  - error de red / 413 / 415 / 422 del backend → `onError` y `onChange` no se llama.
- **API route `/api/qr/list-pdf`**: 401 sin cookie válida; reenvía FormData al backend y propaga status/errores.
- **`UrlList`** renderiza botón ancla rojo solo si `typeUrl === 'pdf'` y `documentUrl` existe; si `documentUrl` no existe, el item no se renderiza.

### 8.3 E2E (Playwright, `e2e-tests-portaqr/`)

- Flujo crear QR multilink CON item PDF → verificar URL pública incluye el botón ancla rojo (mock del endpoint `/api/qr/list-pdf` con interceptor).
- Flujo editar QR existente y eliminar item PDF → verificar `PATCH` body incluye `urlList` sin el item PDF.
- **Test de sanitización real** (opcional, requiere gs real): subir un PDF con JavaScript embebido y metadata, descargar el PDF sanitizado de R2, verificar con `pdfinfo` que no tiene `/JS` ni `/Author`.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Ghostscript no instalado en el contenedor | Media | Alto | Dockerfile layer + verificación `gs --version` en healthcheck |
| Subida de PDFs grandes consume memoria del backend (multipart `memoryStorage`) | Media | Medio | `limits.fileSize: 2MB` + `fileFilter` allowlist |
| Usuario sube un PDF con `Content-Type` falseado o corrupto | Media | Medio | gs valida el binario real (parsing) → `422`; el MIME falseado no supera el re-renderizado |
| Objetos R2 huérfanos (item eliminado sin borrar PDF viejo) | Media | Bajo | `UpdateQrUseCase` borra al detectar eliminación + lifecycle rule §6.3 |
| Fallo entre `PutObjectCommand` y el PATCH a Mongo (objeto subido sin URL persistida) | Baja | Bajo | Orden del flujo: primero R2, luego Mongo; si el PATCH falla queda objeto huérfano → lifecycle |
| Latencia de gs (~1-3s por upload) bloquea el event loop | Media | Medio | gs corre en subprocess (no bloquea el event loop de Node); para alta concurrencia futuro: pool de procesos (§11.4) |
| Abuso: usuario sube muchos PDFs (hasta el límite) repetidamente | Baja | Medio | `MAX_PDF_ITEMS_PER_QR` (default 5) + rate limit por usuario (futuro §11.5) |
| `itemId` colisiona entre items (si el frontend genera duplicados) | Baja | Bajo | UUID v4 evita colisiones; el backend valida unicidad al persistir |
| Items existentes (pre-SPEC-005) sin `itemId` | Alta | Bajo | Mapper genera `itemId` al vuelo (`randomUUID()`) — no requiere migración masiva |

---

## 10. Observabilidad

- **Logs backend** en el endpoint `POST /qr/list-pdf`:
  - `INFO`: `pdf_upload_received` con `{ userId, idQr, itemId, originalSize }`.
  - `INFO`: `pdf_sanitized` con `{ idQr, itemId, inputBytes, outputBytes }` (tras gs).
  - `INFO`: `pdf_uploaded` con `{ idQr, itemId, key, bytes }` (tras PutObjectCommand).
  - `WARN`: `pdf_upload_rejected` con motivo (`not_owner` / `wrong_type` / `bad_mime` / `too_large` / `limit_exceeded` / `sanitize_failed`).
- **Logs backend** en `UpdateQrUseCase` cuando hace `deleteObject` de un item PDF:
  - `INFO`: `r2_pdf_deleted` con `{ oldKey, itemId }`.
  - `ERROR`: si `deleteObject` falla — no abortar el patch; registrar.
- **Métricas** (cuando existan):
  - `qr_list_pdf_uploads_total{userId}`
  - `qr_list_pdf_upload_errors_total{reason}`
  - `gs_processing_seconds` (histograma de latencia de gs)
  - `r2_failed_delete_total`

---

## 11. Trabajo futuro (out of scope)

### 11.1 Imágenes como items de lista
Por ahora solo PDF (decisión 2026-08-07). Para extender a imágenes, agregar `typeUrl: 'image'` con `documentUrl` apuntando a un WebP procesado con sharp (reusar `ImageProcessorService` de SPEC-002). El key R2 sería `qr-multilink-media/{idQr}-{itemId}.webp`.

### 11.2 Preview/visualización inline del PDF
Integrar `pdf.js` o `react-pdf` para renderizar el PDF dentro de la landing en vez de un botón de descarga. Mayor peso en el frontend pero mejor UX. Requiere que el PDF se sirva con `Content-Disposition: inline` (no `attachment`).

### 11.3 OCR / extracción de texto
Extraer texto del PDF para búsqueda o indexación. Requiere `pdftotext` (poppler) o Tesseract.

### 11.4 Pool de procesos Ghostscript
Para alta concurrencia, mantener un pool de procesos gs pre-iniciados (evita el overhead de spawn por upload). Evaluar con `workerpool` o similar.

### 11.5 Rate limiting por usuario
Limitar subidas de PDF por usuario (ej. 10 subidas/hora) para prevenir abuso, además del límite por QR.

### 11.6 Límite total de items en urlList
Hoy no se limita el total de items (solo PDFs). Si se necesita, definir `MAX_URLLIST_ITEMS_PER_QR` (env var).

### 11.7 Versionado de PDFs
Al reemplazar un PDF, guardar la versión anterior con timestamp en el key R2. Requeriría UI de historial y limpieza de versiones.

### 11.8 Watermarking
Agregar watermark con el `idQr` o logo de portaqr al PDF sanitizado (con `pdftk` o gs overlay).

---

## 12. Glosario

| Término | Significado |
| --- | --- |
| **QR multilink** | Tipo de QR con `typeQr === 'list'`; su `data.urlList` es un array de enlaces (URLs, vCards o PDFs) que la página pública muestra como botones. |
| **Item PDF** | Item de `urlList[]` con `typeUrl === 'pdf'` y `documentUrl` (URL pública R2 del PDF sanitizado). |
| **`itemId`** | Identificador único del item dentro de `urlList[]` (UUID v4 generado en el frontend). Estable: no cambia al editar. |
| **`documentUrl`** | URL pública R2 del PDF sanitizado, persistida en el item de `urlList[]`. |
| **Ghostscript (`gs`)** | Intérprete de PostScript/PDF, estándar de la industria. Re-renderiza el PDF descartando JS, acciones, metadata y re-comprimiendo. |
| **R2** | Servicio de almacenamiento de objetos compatible con S3 de Cloudflare. Sin egress fees entre servicios de CF. |
| **`idQr`** | UUID v4 generado en el cliente al crear el QR (ver `CreateQrDto.idQr`). |
| **`MAX_PDF_ITEMS_PER_QR`** | Límite configurable (env var) de items PDF por QR multilink. Default 5. |

---

## 13. Referencias

- [[SPEC-001-migracion-monolito-modular]] — arquitectura hexagonal de `backend-portaqr/`.
- [[SPEC-002-qr-multilink-imagen]] — infraestructura R2 + `StorageService` + `ImageProcessorService` (reutilizada).
- [[SPEC-003-auditoria-dependencias-qr-app]] — impacto en auth (cookies httpOnly + jose) y puerto del backend (:3004).
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- AWS SDK v3 client-s3 (PutObject/DeleteObject): https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
- Ghostscript docs: https://www.ghostscript.com/documentation/
- Ghostscript pdfwrite options: https://www.ghostscript.com/doc/current/VectorDevices.htm#PDFWRITE
- Schema QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/schemas/qr.schema.ts`
- Mapper QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts`
- StorageService: `backend-portaqr/src/modules/storage/storage.service.ts`
- ImageProcessorService (patrón a seguir): `backend-portaqr/src/modules/storage/image-processor.service.ts`
- Controller QR (endpoint list-image patrón): `backend-portaqr/src/modules/qr/presentation/controllers/qr.controller.ts`
- API route frontend (patrón): `qr-app/src/app/api/qr/list-image/route.ts`
- Componente UrlList: `qr-app/src/components/qr/UrlList.tsx`
- Componente ListUrlForm: `qr-app/src/components/qr/forms/ListUrlForm.tsx`
- Componente ListImageUploader (patrón a seguir): `qr-app/src/components/qr/ListImageUploader.tsx`
