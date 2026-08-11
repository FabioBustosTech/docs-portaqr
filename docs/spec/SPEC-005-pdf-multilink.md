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
status: implementado
revision: 2026-08-11
aliases:
  - SPEC-005
  - PDF QR Multilink
  - PDF Item Multilink
  - Documento Multilink R2
---

# SPEC-005: PDF adjunto por item para QR Multilink (Cloudflare R2 + Ghostscript)

> [!abstract] Decisión clave
> Permitir que cada item del array `data.urlList[]` de un QR multilink (`typeQr: 'list'`) sea de **tipo PDF** (`typeUrl: 'pdf'`) con un archivo adjunto. El navegador sube el PDF al backend (**multipart/form-data**); el backend lo **sanitiza con Ghostscript** (`gs -dPDFSETTINGS=/screen -dCompatibilityLevel=1.7`) — eliminando JavaScript embebido, acciones automáticas (`/OpenAction`, `/AA`), metadata de autor/creador, embedded files y re-comprimiendo a 72 DPI — y lo sube a **Cloudflare R2** con key `qr-multilink-pdf/{idQr}-{itemId}.pdf`. Solo la URL pública final se persiste en el campo `documentUrl` del item de `urlList`. La página pública `portaqr.cl/qr/{idQr}` renderiza el item como un **botón ancla** (`<a>`) con color distintivo que descarga/abre el PDF. El dashboard permite subir, descargar y eliminar el PDF (el eliminado borra el objeto R2). Límite: **2 MB** por archivo, **`MAX_PDF_ITEMS_PER_QR`** items PDF por QR (configurable vía env, default 2).

> [!info] Metadatos
> - **Estado:** Implementado el **2026-08-11** (tareas T-005-00..15 cerradas; suite backend 138 suites/1015 tests verdes; **E2E 46/46 verdes** incl. 5 tests SPEC-005; validación manual completa en navegador con gs+R2 reales; nota de producción creada — ver [[NOTA-despliegue-produccion-SPEC-005]])
> - **Fecha:** 2026-08-07
> - **Revisión:** 2026-08-11 — validación contra el código + correcciones menores (límite PDFs default 2, claves R2 ya existentes, RF-13 paso 5, label fijo — ver [[#14 Historial de cambios]])
> - **Autor:** Equipo Plataforma QR
> - **Componentes afectados:** `backend-portaqr/` (puerto 3004 en docker-compose), `qr-app/` (puerto 3000)
> - **Alcance:** Solo QR tipo `list` (multilink). No aplica a `dynamic`, `static`, `whatsapp`, `email`, `call`, `wifi`, `texto`, `vcard`, `pet`, `phone`, `map`.
> - **Página pública destino:** `https://portaqr.cl/qr/{idQr}` (ej. `https://portaqr.cl/qr/89302960-7799-43fe-b5a0-45d2295d539f`).
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]], [[SPEC-002-qr-multilink-imagen]], [[SPEC-003-auditoria-dependencias-qr-app]], [[SPEC-004-react-doctor-qr-app]], [[SPEC-004-B-no-giant-component-qr-app]], [[SPEC-008-hardening-sanitizacion-backend-portaqr]]
>
> [!warning] Impacto de SPEC-002 (implementada 2026-08-07)
> SPEC-002 ya implementó la infraestructura de storage R2 reutilizable: `modules/storage/` con `StorageService` (upload/delete R2) e `ImageProcessorService` (pipeline sharp). Esta SPEC-005 **reutiliza** `StorageService` (extendido para PDFs) y agrega un nuevo `PdfSanitizerService` (Ghostscript). El endpoint multipart sigue el patrón de `POST /qr/list-image` pero con `POST /qr/list-pdf`. La API route del frontend sigue el patrón de `/api/qr/list-image` → `/api/qr/list-pdf`.
>
> [!warning] Impacto de SPEC-003 (implementada 2026-08-07)
> Tras SPEC-003 el frontend usa **JWT directo con cookies httpOnly + `jose`** (sin next-auth): el navegador **no tiene el token**, por lo que **toda llamada autenticada debe pasar por una API route del frontend** (`/api/*`) que lee la cookie y reenvía al backend con `Authorization: Bearer`. El endpoint de subida de PDF se expone como `POST /api/qr/list-pdf` (frontend) → `POST /qr/list-pdf` (backend). Además `backend-portaqr` corre en el puerto **3004** en docker-compose (las API routes usan `NEXT_PUBLIC_BFF_URL || 'http://localhost:3001'`).

> [!warning] Validación 2026-08-09 — cambios post redacción (SPEC-004/004-B/006..011)
> Esta spec **no fue implementada** (no hay código ni tareas). Desde su redacción se implementaron otras specs que **cambiaron archivos que esta spec referencia**. La revisión 2026-08-09 actualizó: (a) paths/nombres del frontend (`ListUrlForm` dividido en `ListUrlRow.tsx` + `ListUrlForm.helpers.ts`, edición en `EditQrForm.tsx`, `CreateQrForm` con `.state.ts`/`.helpers.ts`, tipos en `interfaces/qr.ts` con `ListUrlData`/`UrlListItem`), (b) hueco RF-5/CA-10: límite de items PDF también validado en el validador del schema (PATCH), (c) limpieza R2 alineada al patrón real del controller `PATCH /qr/:id` (SPEC-002), (d) compatibilidad con `ValidationPipe` `whitelist:true` de SPEC-008 (declarar `itemId`/`documentUrl` en los DTOs o son eliminados), (e) §5.1: variables `CLOUDFLARE_R2_*` NO están en el `.env` local (corregido), (f) §6.1: Dockerfile `node:20-alpine` multi-stage (gs en development y production). Ver [[#14 Historial de cambios]].

---

## 1. Objetivo

Permitir que cada QR **multilink** (`typeQr: 'list'`) tenga items de tipo **PDF** dentro de su `data.urlList[]` — además de los items de URL/redes sociales/vCard ya existentes y de la imagen de portada (`listImageUrl` de SPEC-002). Cada item PDF se renderiza en la landing pública como un **botón ancla** que descarga/abre el archivo sanitizado.

> [!info] Cardinalidad: items PDF configurables por QR
> Cada QR multilink puede tener **0 a N items PDF** dentro de `urlList[]`, donde N es configurable vía `MAX_PDF_ITEMS_PER_QR` (default 2). Cada item PDF tiene exactamente **1 archivo PDF** persistido en `documentUrl`. Reemplazar el PDF sobrescribe el mismo objeto R2 (mismo `key`). Eliminar el item PDF lo borra de R2 y del array.

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

- **RF-5**. **Límite de items PDF por QR**: máximo `MAX_PDF_ITEMS_PER_QR` items con `typeUrl: 'pdf'` por QR (env var, default `2`). El backend valida en **dos puntos**:
  - (a) **En el validador del schema** `case 'list'` (§4.1.3): al persistir por `POST /qr` o `PATCH /qr/{id}`, si el `urlList` resultante tiene más items PDF que el límite → `400 Bad Request`. Esto cubre el caso de PATCH directo (frontend manipulado o edición que agrega items PDF sin subir archivo).
  - (b) **En `POST /qr/list-pdf`** (§4.1.5 paso 2): antes de sanitizar/subir, si el item es nuevo y el conteo actual ya alcanzó el límite → `400 Bad Request` (no sube nada a R2).
  - El frontend usa el mismo env var (expuesto vía `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR`) para bloquear la UI al alcanzar el límite.

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
  >
  > [!warning] Preservación del itemId en el frontend (revisión 2026-08-09)
  > El `useEffect` de `ListUrlForm.tsx` que sincroniza `urlList` → rows (`{ id: row-${index}, type, url, vcard }`) **descarta campos no mapeados**: si no se agrega `itemId`/`documentUrl` al mapeo, se perderían al cargar un QR existente en edición (el item se vería como "sin archivo" y el itemId se regeneraría). Requisito: el `itemId` debe ser un campo **persistente de la fila** (generado una vez al crear el item, no derivado del índice) y preservado en el sync (§4.2.3).

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

- **RF-15**. **Eliminación de item PDF**: al hacer `PATCH /qr/{idQr}` (frontend) → `PATCH /qr/{idQr}` (backend) con un `urlList` que ya no incluye el item PDF, el backend:
  - **Borra el objeto R2** del item eliminado vía `DeleteObjectCommand` — el PDF se elimina también del storage, no solo de MongoDB.
  - Persiste el `urlList` actualizado en MongoDB.
  - Si `DeleteObjectCommand` falla (red, no existe, etc.), se registra `ERROR` log (`r2_failed_delete`) pero **no aborta** el `PATCH` (la URL queda sin referencia en Mongo y el objeto R2 queda huérfano — lifecycle rule §6.3 lo limpiará).

- **RF-16**. **Reemplazo de PDF**: el endpoint `POST /qr/list-pdf` (vía `/api/qr/list-pdf`) puede invocarse nuevamente con un nuevo `file` para el mismo `{idQr, itemId}`; retorna nueva `documentUrl` (sobrescribe el mismo objeto R2, mismo `key`). El controller `PATCH /qr/:id` (§4.1.6) al recibir un `documentUrl` distinto al actual para el mismo `itemId`, borra el objeto R2 anterior de forma **mejor esfuerzo** (log si falla, no abortar).

#### UI /UX

- **RF-17**. **Crear QR multilink** (`CreateQrForm.tsx` + `.state.ts` → `ListUrlForm.tsx` + `ListUrlRow.tsx` + helpers): el `Select` de tipo de enlace (que itera `socialTypes`) incluye una nueva opción **"PDF"** (`typeUrl: 'pdf'`). Al seleccionarla:
  - Se muestra un input `file` con `accept="application/pdf,.pdf"`.
  - Al seleccionar archivo: validar tipo/tamaño en cliente (≤2 MB; si no es PDF → error inmediato).
  - Se genera un `itemId` (UUID v4) para el item.
  - El upload real se dispara en el `handleSubmit` de `CreateQrForm` después de crear el QR y obtener `idQr` (mismo patrón que SPEC-002 §4.2.3). Si falla la subida → el QR queda creado sin el PDF y se muestra toast de warning (se puede agregar después desde editar).
  - El label del botón es **fijo** ("Descargar PDF"): el modelo del item NO persiste el nombre del archivo (solo `documentUrl`). El nombre del archivo seleccionado solo se muestra en sesión (antes de persistir) — corrección 2026-08-11 (el borrador original mencionaba "name textual del item" que no tiene campo en el modelo).

- **RF-18**. **Editar QR multilink** (`/dashboard/qr/edit/[id]`): mismo bloque, pero:
  - Si el item PDF ya tiene `documentUrl` (ya subido), se muestra un **botón ancla** `<a href={documentUrl} download>` con el nombre del archivo y un botón "Eliminar" (trash icon) que quita el item del array (dispara `PATCH` con `urlList` sin el item → backend borra R2).
  - Si el item PDF no tiene `documentUrl` (item creado pero sin archivo), se muestra el input `file` para subirlo.
  - Se puede cambiar el PDF (nueva subida sobrescribe el mismo `key`).

- **RF-19**. **Página pública** (`https://portaqr.cl/qr/{idQr}` → `UrlList.tsx`): los items con `typeUrl === 'pdf'` se renderizan como un **botón ancla** `<a>` (no `<button>`) con:
  - `href={item.documentUrl}`
  - `target="_blank"` (abre en nueva pestaña) o `download` (descarga directa) — decisión: `target="_blank"` + `rel="noopener noreferrer"` para que el visor nativo del navegador lo abra.
  - **Color distintivo**: `bg-rose-600 hover:bg-rose-700` (revisión 2026-08-09: el `bg-red-600` original colisionaba con `google maps` — ver §4.2.5).
  - **Icono**: `pdf` (entrada `FileText` de lucide-react agregada al mapa de `@/components/icon`).
  - **Label**: fijo **"Descargar PDF"** (corrección 2026-08-11: el modelo no persiste el nombre del archivo — ver RF-17).
  - Si `documentUrl` no existe (item PDF sin archivo subido), el item **no se renderiza** en la página pública (no se muestra botón roto).

  > [!note] Sin fallback
  > Si el PDF no carga por cualquier motivo (404/403, error de red, formato corrupto), el navegador nativo mostrará su mensaje de error. No se implementa fallback custom — el botón ancla simplemente no abrirá el archivo. El usuario puede reintentar.

- **RF-20**. La página pública debe cargar el botón PDF sin optimización especial (es un `<a>`, no un recurso). No se usa `loading="lazy"` (no aplica a links).

### 2.2 Criterios de aceptación (CA)

- **CA-01**. Un usuario autenticado puede crear un QR `list` SIN items PDF y el flujo funciona exactamente igual que hoy (sin regresión).
- **CA-02**. Un usuario autenticado puede crear un QR `list` CON un item PDF: el PDF se sube a R2, la URL queda persistida en `documentUrl` del item, y la página pública `/qr/[id]` muestra un botón ancla rosa (`bg-rose-600`) que abre el PDF.
- **CA-03**. El usuario puede editar un QR `list` existente y agregar un nuevo item PDF: una nueva subida persiste la URL en el item correspondiente.
- **CA-04**. El usuario puede editar un QR `list` existente y **reemplazar** el PDF de un item: una nueva subida con el mismo `{idQr, itemId}` sobrescribe el objeto R2 (mismo `key`) y actualiza `documentUrl`.
- **CA-05**. El usuario puede **eliminar** un item PDF de un QR `list` existente: el `PATCH` con `urlList` sin el item limpia el campo en MongoDB **y borra el objeto correspondiente del bucket R2** (verificar `DeleteObjectCommand` fue invocado con el `key` correcto). La página pública ya no muestra el botón y la URL R2 devuelve `404` tras el borrado.
- **CA-06**. Un usuario NO propietario del QR recibe `403` al llamar `POST /qr/list-pdf` para un `idQr` ajeno.
- **CA-07**. Intentar subir un archivo de tamaño > 2 MB recibe `413 Payload Too Large` (frontend en UI; backend en multer `limits.fileSize`) antes de tocar R2. Un archivo con formato no PDF (p. ej. `.docx`, `.exe`) recibe `415 Unsupported Media Type`.
- **CA-08**. Un binario que Ghostscript no puede procesar (PDF corrupto, falseado, o con estructura inválida) recibe `422 Unprocessable PDF` y **no se persiste ni se sube nada** a R2.
- **CA-09**. La validación del schema (exclusividad por `typeQr` y por tipo de item) sigue pasando: un item con `typeUrl: 'pdf'` solo se persiste si tiene `documentUrl` y no tiene `url` ni `vcard`; un item con `url` no puede tener `documentUrl`.
- **CA-10**. Si el `urlList` resultante tiene más items PDF que `MAX_PDF_ITEMS_PER_QR` (default 2), el backend responde `400 Bad Request` — tanto al persistir (`POST /qr`, `PATCH /qr/{id}` vía validador del schema) como en `POST /qr/list-pdf` antes de tocar R2 — y el frontend bloquea la UI al alcanzar el límite.
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

> [!important] Compatibilidad con SPEC-008 (implementada)
> El `ValidationPipe` global ya corre con `whitelist: true` + `forbidNonWhitelisted` (SPEC-008). **Si `itemId`/`documentUrl` no se declaran en los DTOs, serán eliminados silenciosamente en `PATCH /qr/{id}`** → el backend no podría correlacionar el item con su objeto R2 (bug silencioso). Ambos campos **deben** declararse en `ListUrlData` y en `UrlListItem` (url-item.dto.ts).

**`application/dto/create-qr.dto.ts`** — clase existente `ListUrlData` (el item de `urlList`; en el borrador original se llamaba `QrUrlListItem` — el nombre real es `ListUrlData`):

```ts
export class ListUrlData {
  @IsOptional()
  @IsString()
  itemId?: string;                  // ⬅ NUEVO: identificador estable del item (RF-12)

  @ValidateIf((o) => o.typeUrl === 'pdf')
  @IsOptional()
  @IsUrl({}, { message: 'La URL del documento debe ser válida' })
  documentUrl?: string | null;      // ⬅ NUEVO: URL pública R2 del PDF (solo typeUrl === 'pdf')

  @IsOptional()
  @Matches(/^((https?:\/\/[^\s]+|tel:\+\d{1,3}\d{4,14}))$/, {
    message: 'Debe comenzar con http://, https:// o tel: seguido de un número telefónico válido'
  })
  url?: string;

  @IsOptional()
  @ValidateNested({ message: 'Los datos de la tarjeta de contacto deben ser válidos' })
  @Type(() => VCard)
  vcard?: VCard;

  @IsString({ message: 'El tipo de URL debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El tipo de URL es requerido' })
  typeUrl: string;
}
```

> [!note] itemId/documentUrl no rompen la exclusividad existente
> `itemId` se acepta para cualquier tipo de item (es solo un identificador). `documentUrl` solo aplica cuando `typeUrl === 'pdf'` (via `@ValidateIf`). La exclusividad por tipo (`url`/`vcard`/`documentUrl` mutuamente excluyentes) la garantiza el validador del schema (§4.1.3), no los DTOs.

**`application/dto/url-item.dto.ts`** — la clase `UrlListItem` (respuestas Swagger / redirección pública) también declara los campos nuevos, para que Swagger y el frontend tipen los items con PDF:

```ts
export class UrlListItem {
  @ApiProperty({ required: false, description: 'Identificador estable del item (RF-12)' })
  itemId?: string;

  @ApiProperty({ type: String, required: false, description: 'Datos de vCard si el tipo es VCARD' })
  vcard?: any;

  @ApiProperty({ type: String, required: false, description: 'URL si el tipo no es VCARD' })
  url?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'URL pública R2 del PDF (solo typeUrl === \'pdf\')' })
  documentUrl?: string | null;

  @ApiProperty({ required: true, description: 'Tipo de URL o vCard' })
  typeUrl: string;
}
```

**`application/dto/update-qr.dto.ts`** — `UpdateQrDto extends PartialType(CreateQrDto)` ya existente; verificar que `@IsOptional` no chille con `null` en `documentUrl` (el validador usa `@ValidateIf((o) => o.typeUrl === 'pdf')`, que tolera `null`).

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

Actualizar el `validate.validator` del `data` para el `case 'list'` — agregar validación de exclusividad por item **y el límite `MAX_PDF_ITEMS_PER_QR`** (revisión 2026-08-09: cierra el hueco RF-5/CA-10 en PATCH):

```ts
case 'list': {
  if (!value.urlList) return false;
  let pdfCount = 0;
  // Exclusividad a nivel de item (RF-4) + conteo de items PDF (RF-5)
  for (const item of value.urlList) {
    if (item.typeUrl === 'pdf') {
      // PDF: exige documentUrl, prohíbe url y vcard
      if (!item.documentUrl || item.url || item.vcard) return false;
      pdfCount += 1;
    } else if (item.typeUrl === 'vcard') {
      // vCard: exige vcard, prohíbe url y documentUrl
      if (!item.vcard || item.url || item.documentUrl) return false;
    } else {
      // URL/red social: exige url, prohíbe vcard y documentUrl
      if (!item.url || item.vcard || item.documentUrl) return false;
    }
  }
  // RF-5: límite de items PDF por QR (env MAX_PDF_ITEMS_PER_QR, default 2).
  // El validator es síncrono: leer process.env directo (misma técnica que el controller).
  const maxPdfItems = Number.parseInt(process.env.MAX_PDF_ITEMS_PER_QR ?? '', 10);
  const limit = Number.isFinite(maxPdfItems) && maxPdfItems > 0 ? maxPdfItems : 2;
  if (pdfCount > limit) return false;
  // Exclusividad a nivel de QR (sin cambios)
  return !value.url && !value.whatsappUrl && !value.emailUrl && !value.phoneUrl
    && !value.wifiData && !value.text && !value.vcardData && !value.petData
    && !value.mapUrl;
}
```

> [!warning] Advertencia del validador de schema con límite
> El validador de Mongoose corre en el proceso del backend, por lo que `process.env.MAX_PDF_ITEMS_PER_QR` está disponible (igual que `getListImageMaxUploadSize()` en el controller). **Alternativa preferida**: centralizar la lectura en un helper compartido `getMaxPdfItemsPerQr()` (§4.1.5) importado por ambos (schema y controller) para evitar divergencias de default.

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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
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
      file: { type: 'string', format: 'binary', description: 'PDF (application/pdf, máx PDF_MAX_UPLOAD_SIZE default 2 MB)' },
    },
  },
})
@ApiOperation({ summary: 'Subir PDF de un item de QR multilink (sanitiza con gs y sube a R2)' })
@ApiResponse({ status: 200, description: 'PDF subido. Retorna { documentUrl, size, itemId }' })
@ApiResponse({ status: 403, description: 'Prohibido - no es el propietario' })
@ApiResponse({ status: 400, description: 'El QR no es de tipo list, falta idQr/itemId, o límite excedido' })
@ApiResponse({ status: 413, description: 'Archivo mayor al límite configurado (PDF_MAX_UPLOAD_SIZE, default 2 MB)' })
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

  // 2. Validar límite MAX_PDF_ITEMS_PER_QR (RF-5) y tipo del item (RF-13 paso 5)
  const urlList = qr.data?.urlList ?? [];
  const existingItem = urlList.find((it) => it.itemId === itemId);
  const isReplacement = !!existingItem;
  if (existingItem && existingItem.typeUrl !== 'pdf') {
    // RF-13 paso 5 (corrección 2026-08-11): si el itemId existe pero NO es tipo PDF,
    // rechazar ANTES de sanitizar/subir — evita subir a R2 y luego fallar el PATCH
    // por el validador de exclusividad (objeto R2 huérfano + 400 confuso).
    throw new BadRequestException('El item indicado no es de tipo PDF');
  }
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

#### 4.1.6 Limpieza R2 en `PATCH /qr/:id` — en el **controller** (patrón SPEC-002)

> [!warning] Revisión 2026-08-09 — ubicación alineada al patrón real
> El borrador original proponía esta lógica en `UpdateQrUseCase`, pero el patrón real de SPEC-002 la implementa en el **controller** (`qr.controller.ts`, `PATCH /qr/:id`, bloque de `listImageUrl` ~líneas 410-425): el controller compara `oldUrl` vs `newUrl` y llama `storageService.deleteObject(oldUrl)` (mejor esfuerzo). **Esta spec sigue el mismo lugar** para mantener una sola convención. `UpdateQrUseCase` no toca R2.

En `presentation/controllers/qr.controller.ts`, método `update` — junto al bloque existente de `listImageUrl`:

```ts
// SPEC-005 RF-15/RF-16: items PDF eliminados o reemplazados → borrar objeto R2 anterior (mejor esfuerzo)
if (currentQr.typeQr === 'list' && Array.isArray(updateQrDto.data?.urlList)) {
  const oldUrlList = currentQr.data?.urlList ?? [];
  const newUrlList = updateQrDto.data.urlList;

  // Items PDF que estaban en el urlList anterior y ya no están (eliminados) → borrar R2
  const removedPdfItems = oldUrlList.filter(
    (old) => old.typeUrl === 'pdf' && old.documentUrl &&
      !newUrlList.find((nw) => nw.itemId === old.itemId),
  );
  for (const item of removedPdfItems) {
    if (item.documentUrl) {
      await this.storageService.deleteObject(item.documentUrl); // mejor esfuerzo (RF-15)
      this.traceService.log(tracking, TraceLayer.CONTROLLER, 'PATCH /qr/:id - pdf item removed', {
        qrid, itemId: item.itemId, oldUrl: item.documentUrl,
      });
    }
  }

  // Items PDF con documentUrl reemplazado para el mismo itemId → borrar el anterior
  for (const newItem of newUrlList) {
    if (newItem.typeUrl === 'pdf' && newItem.documentUrl) {
      const oldItem = oldUrlList.find((old) => old.itemId === newItem.itemId);
      if (oldItem?.documentUrl && oldItem.documentUrl !== newItem.documentUrl) {
        await this.storageService.deleteObject(oldItem.documentUrl); // mejor esfuerzo (RF-16)
        this.traceService.log(tracking, TraceLayer.CONTROLLER, 'PATCH /qr/:id - pdf replaced', {
          qrid, itemId: newItem.itemId, oldUrl: oldItem.documentUrl,
        });
      }
    }
  }
}
```

> [!note] Comparación por `itemId`
> La detección de eliminados/reemplazados compara por `itemId` (RF-12). Si un item viejo no tiene `itemId` (pre-SPEC-005), no se correlaciona y su objeto R2 no se borra en este flujo — queda huérfano y lo limpia el lifecycle rule (§6.3). Aceptable (mejor esfuerzo).

> [!info] Dependencia de módulo
> `QrController` ya inyecta `StorageService` (desde SPEC-002). Solo se agrega `PdfSanitizerService` al constructor (ver §4.1.5).

#### 4.1.7 Mapper de persistencia

> [!note] Revisión 2026-08-09 — el mapper es pass-through de `data`
> `qr-mongo.mapper.ts` copia `data` tal cual (`toEntity` → `data: doc.data`; `toSchemaData` → `data: qr.data as any`). **Los campos `itemId`/`documentUrl` viajan automáticamente** al agregarlos al schema (no requieren cambios de mapeo explícitos).
> Lo único necesario aquí es la **generación de `itemId` al vuelo** para los items existentes sin él: se normaliza `data.urlList` en `toEntity` (o en `GetQrUseCase`) agregando `itemId ?? randomUUID()` a cada item.

`infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts`:

```ts
import { randomUUID } from 'crypto';
import type { Qr } from '../../../../domain/entities/qr.entity';
import type { QrSchema } from '../schemas/qr.schema';

export class QrMongoMapper {
  static toEntity(doc: QrSchema & { _id?: unknown }): Qr {
    // SPEC-005 RF-12: garantizar itemId estable en cada item de urlList (mejor esfuerzo).
    // Los items pre-SPEC-005 no tienen itemId → se genera al vuelo (no se persiste).
    const data = doc.data ? { ...doc.data } : doc.data;
    if (data && Array.isArray(data.urlList)) {
      data.urlList = data.urlList.map((item) => ({
        ...item,
        itemId: item.itemId ?? randomUUID(),
      }));
    }
    return {
      id: doc._id?.toString() || '',
      idQr: doc.idQr,
      userId: doc.userId,
      expiration: doc.expiration,
      quantityUpdateMonth: doc.quantityUpdateMonth,
      description: doc.description,
      data,
      name: doc.name,
      updatedAt: doc.updatedAt,
      active: doc.active,
      isFavorite: doc.isFavorite,
      isOldMode: doc.isOldMode,
      typeQr: doc.typeQr,
      createdAt: doc.createdAt,
    };
  }

  static toSchemaData(qr: Partial<Qr>): Partial<QrSchema> {
    return {
      idQr: qr.idQr,
      userId: qr.userId,
      expiration: qr.expiration,
      quantityUpdateMonth: qr.quantityUpdateMonth,
      description: qr.description,
      data: qr.data as any,
      name: qr.name,
      active: qr.active,
      isFavorite: qr.isFavorite,
      isOldMode: qr.isOldMode,
      typeQr: qr.typeQr,
    };
  }
}
```

> [!note] No perseguir el itemId generado al vuelo
> El itemId al vuelo **no se persiste** (los items pre-SPEC-005 siguen sin itemId en Mongo hasta que el usuario los edite — el frontend los reenvía con itemId nuevo). Esto evita una migración masiva.

### 4.2 Frontend — `qr-app/`

#### 4.2.1 Servicio — `services/qr.service.ts`

> [!note] Revisión 2026-08-09
> `qr.service.ts` **no define interfaces propias** de items: importa `ListUrlData`/`UrlListItem` de `@/interfaces/qr` (que se extienden en §4.2.6). Solo se agrega el método `uploadListPdf` (patrón idéntico a `uploadListImage` real: XHR + `onProgress`, sin `Content-Type` manual):

```ts
// En QrService (el tipo del item viene de @/interfaces/qr → ListUrlData, ya extendido):
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
  fileName?: string;        // nombre del archivo actual SOLO en-sesión (no se persiste — ver RF-17/RF-19)
  onChange: (url: string | null) => void;
  onFileSelected?: (file: File | null) => void;  // para el flujo de creación
  onError: (msg: string) => void;
}
```

Renderiza:
- Si `currentPdfUrl` existe: **botón ancla** `<a href={currentPdfUrl} target="_blank" rel="noopener noreferrer">` con icono `pdf` (del mapa de `@/components/icon`) y el nombre del archivo (solo en-sesión) o el label fijo "Descargar PDF" + botón "Eliminar" (trash icon) → `onChange(null)`.
- Si no existe: drop zone con `Input type="file" accept="application/pdf,.pdf"`.
- Al seleccionar archivo:
  1. Validar tipo/tamaño en cliente (≤2 MB; si no es PDF → `onError` inmediato).
  2. Si `idQr` existe → `qrService.uploadListPdf(idQr, itemId, file, onProgress)` → `onChange(publicUrl)`.
  3. Si `idQr` no existe (creación) → mantener `File` en estado; el upload real se dispara en el `handleSubmit` de `CreateQrForm` después de crear el QR. Ver §4.2.3.
- Barra de progreso (1–100%) usando el `onProgress` de `uploadListPdf`.
- Muestra el `documentUrl` devuelto (o error 415/413/422 con mensaje claro del backend).

#### 4.2.3 Creación de QR — `CreateQrForm.tsx` (con `.state.ts`/`.helpers.ts`) + `ListUrlForm.tsx` + `ListUrlRow.tsx` + `ListUrlForm.helpers.ts`

> [!warning] Estructura real post SPEC-004/004-B (revisión 2026-08-09)
> - `CreateQrForm.tsx` fue refactorizado (SPEC-004): el estado/`handleSubmit` viven en `CreateQrForm.state.ts` y la lógica pura en `CreateQrForm.helpers.ts`. El flujo de subida de PDFs pendientes se integra en el submit del **state** (o se expone como callback desde el componente).
> - `ListUrlForm.tsx` fue dividido (SPEC-004-B): la **fila** es ahora `ListUrlRow.tsx` (Select de tipo + input + trash + drag) y la **lógica pura** está en `ListUrlForm.helpers.ts` (`ListUrlRow` type, `socialTypes`, `detectUrlType`, `formatUrl`, `buildUrlList`). El `Select` de tipos itera `socialTypes` (= `socialConst` de `constants/social.const.ts`).

> [!warning] Secuencia en creación (implementación 2026-08-11 — flujo corregido)
> En el flujo de **crear nuevo QR**, el `idQr` se genera en el cliente (UUID v4). **El QR se crea PRIMERO y los PDFs se suben DESPUÉS** (el endpoint `POST /qr/list-pdf` valida que el QR exista). Flujo:
> 1. `handleSubmit` (en `CreateQrForm.tsx`): `createQr({ ..., data: { ..., urlList: [...], typeQr: 'list' } })`. **Los items PDF SIN `documentUrl` NO se envían en el `urlList` inicial** (corrección 2026-08-11: `buildUrlList` los excluye porque el validador del schema rechaza `pdf` sin `documentUrl` — el borrador original decía "se envían con documentUrl: null", lo que rompía el POST /qr con 400).
> 2. Por cada item PDF pendiente (ref `pendingPdfFilesRef` keyed por `itemId`) → `uploadListPdf(idQr, itemId, file, onProgress)` → el endpoint **agrega el item** al `urlList` con su `documentUrl` real (append en el controller).
> 3. Si falla alguna subida → el QR queda creado sin ese PDF y se muestra toast de warning (se puede agregar después desde editar).

Cambios concretos:

**`constants/social.const.ts`** — agregar la entrada `pdf` a `socialConst` (la iteran el `Select` de `ListUrlRow` y `buildUrlList`):

```ts
{
  id: 'pdf',
  name: 'PDF',
  icon: Icon({ name: 'pdf' }),   // requiere agregar 'pdf' al mapa de @/components/icon
  baseUrl: '',
  pattern: /^$/i,                 // sin pattern: no debe matchear pegado de URLs
},
```

**`components/qr/forms/ListUrlForm.helpers.ts`**:
- Extender el tipo `ListUrlRow` con los campos del item PDF:

```ts
export interface ListUrlRow {
  id: string;
  type: string;
  url: string;
  vcard?: VCardData;
  itemId?: string;          // ⬅ NUEVO (RF-12): estable, generado una vez
  documentUrl?: string | null; // ⬅ NUEVO: URL R2 persistida (edición)
  pdfFile?: File | null;    // ⬅ NUEVO: archivo pendiente (creación)
}
```

- **Modificar `buildUrlList`** para que los items `pdf` no sean filtrados (hoy el filtro exige `row.type && row.url` para no-vcard → un item PDF sin `url` **sería descartado del payload**):

```ts
export const buildUrlList = (currentRows: ListUrlRow[]): ListUrlData[] => {
  const validRows = currentRows.filter(row => {
    if (row.type === 'vcard') return row.vcard;
    if (row.type === 'pdf') return !!row.documentUrl;  // ⬅ NUEVO (implementación 2026-08-11): el item PDF sin documentUrl se EXCLUYE — el validador del schema rechaza pdf sin URL; el endpoint list-pdf agrega el item tras la subida
    if (row.type === 'web' || row.type === 'blog') return true;
    return row.type && row.url;
  });

  const formattedRows: ListUrlData[] = validRows.map(row => {
    if (row.type === 'vcard') {
      return { vcard: row.vcard, typeUrl: 'vcard' };
    }
    if (row.type === 'pdf') {
      return {                                    // ⬅ NUEVO: item PDF sin url (RF-4)
        itemId: row.itemId,
        typeUrl: 'pdf',
        documentUrl: row.documentUrl ?? null,
      };
    }
    return {
      url: formatUrl(row.url, row.type),
      typeUrl: socialTypes.find(s => s.id === row.type)?.name || row.type,
    };
  });
  return formattedRows;
};
```

**`components/qr/forms/ListUrlRow.tsx`** — render condicional para `pdf` (reemplaza el `Input` de URL por el selector de archivo):

```tsx
{row.type === 'vcard' && (
  <Button ... onClick={() => onOpenVCard(index)}>Configurar vCard</Button>
)}
{row.type === 'pdf' && (
  // ⬅ NUEVO: input file + validación cliente (tipo/tamaño ≤2MB) + botón de quitar archivo.
  // Delegar el estado del archivo/URL al padre (ListUrlForm) vía onUrlChange/onRemoveFile.
  <input
    type="file"
    accept="application/pdf,.pdf"
    onChange={(e) => onPdfFileSelected?.(index, e.target.files?.[0] ?? null)}
  />
)}
{row.type !== 'vcard' && row.type !== 'pdf' && (
  <Input ... />
)}
```

**`components/qr/forms/ListUrlForm.tsx`**:
- `handleTypeChange`: al seleccionar `'pdf'`, limpiar `url` y generar `itemId` (UUID v4) si no existe:

```ts
if (value === 'pdf') {
  newRows[index].url = '';
  newRows[index].pdfFile = null;
  newRows[index].itemId = newRows[index].itemId ?? crypto.randomUUID(); // RF-12
}
```

- `useEffect` de sync (`urlList` → rows): **preservar `itemId` y `documentUrl`** (si no, se pierden al cargar el QR en edición — revisión 2026-08-09):

```ts
useEffect(() => {
  if (urlList && urlList.length > 0) {
    setRows(urlList.map((item, index) => ({
      id: item.itemId ?? `row-${index}`,           // id estable = itemId (RF-12)
      type: socialTypes.find(s => s.name === item.typeUrl)?.id || item.typeUrl,
      url: item.url || '',
      vcard: item.vcard,
      itemId: item.itemId,                         // ⬅ NUEVO: preservar
      documentUrl: item.documentUrl ?? null,       // ⬅ NUEVO: preservar
    })));
  } else {
    setRows([{ id: `row-${Date.now()}`, type: '', url: '' }]);
  }
}, [urlList]);
```

- Integrar `<ListPdfUploader />` en la fila `pdf` (o el input file directo si la fila no sube el archivo hasta el submit). Mismo patrón que `ListImageUploader` con `idQr` (undefined en creación → `onFileSelected` guarda el `File` pendiente en `row.pdfFile`).

**`CreateQrForm.state.ts`** — en el submit, tras `createQr(...)` exitoso, iterar los `row.pdfFile` pendientes y llamar `qrService.uploadListPdf(idQr, itemId, file, onProgress)` (paso 2 de la secuencia). Los `itemId` de los items del QR creado deben coincidir con los de las filas (el `urlList` enviado al crear ya los incluye).

#### 4.2.4 Edición de QR — `dashboard/qr/edit/[id]/EditQrForm.tsx` (con `editQrForm.state.ts` + `editQrForm.helpers.ts`)

> [!note] Revisión 2026-08-09
> La página `dashboard/qr/edit/[id]/page.tsx` es ahora un wrapper: el formulario vive en `EditQrForm.tsx` (split de SPEC-004-B) con estado en `editQrForm.state.ts` y helpers en `editQrForm.helpers.ts`. Los cambios de esta spec van en esos archivos.

- Carga el QR con `qrService.getQrById(id)` (en `editQrForm.state.ts`), obtiene `data.urlList`.
- Para items con `typeUrl === 'pdf'`, renderiza `<ListPdfUploader idQr={id} itemId={item.itemId} currentPdfUrl={item.documentUrl} onChange=... />`.
- En submit, envía `PATCH /api/qr?id` → `PATCH /qr/{id}` con `data: { ..., urlList }`. Si un item PDF se eliminó del array o su `documentUrl` cambió → el **controller** borra R2 (RF-15/RF-16, §4.1.6).
- Recordatorio: `EditQrForm` debe **preservar `itemId`/`documentUrl`** en su estado de rows (mismo requisito que §4.2.3).

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
                   bg-rose-600 hover:bg-rose-700"
      >
        <Icon name="pdf" className="w-6 h-6" />
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

> [!note] Icono (revisión 2026-08-09)
> El componente `Icon` de `@/components/icon` usa un **mapa de nombres propios** (`facebook`, `vcard`, `map2`, `web`…), no nombres lucide directos. Hay que agregar la entrada `pdf` al mapa (icono `file-text`/`FileText` de lucide-react). El render de `UrlList` NO usa `socialConst` para el icono: usa `getIconForType(type)` → agregar `case 'pdf': return 'pdf'` y `case 'pdf': return 'bg-rose-600 hover:bg-rose-700'` en `getColorForType` (o incluir el item en el `switch`).

> [!note] Color (revisión 2026-08-09)
> El borrador original proponía `bg-red-600`. Se cambia a **`bg-rose-600`** porque `bg-red-500 hover:bg-red-600` ya está asignado a `google maps` en `getColorForType` — el rojo genérico confundiría ambos items.

> [!note] Keys deterministas
> Hoy las keys son `${typeUrl}-${url || vcard?.fn}` con contador `#n` para duplicados. Con `itemId` como primer candidato (`itemKey = item.itemId || ...`) la key es estable y única — el orden de prioridad del borrador es correcto.

> [!note] Sin fallback
> Si el PDF no carga (404/403/red), el navegador nativo mostrará su mensaje. No se implementa fallback custom.

#### 4.2.6 Tipos compartidos — `interfaces/qr.ts`

> [!note] Revisión 2026-08-09
> `interfaces/qr.interface.ts` **ya no existe**: fue fusionado en `interfaces/qr.ts` (fuente única, header del archivo). Los tipos reales del item son **`ListUrlData`** (dashboard/formularios) y **`UrlListItem`** (página pública) — ambos se actualizan:

```ts
// Formularios/dashboard — agregar itemId y documentUrl
export interface ListUrlData {
  itemId?: string;               // ⬅ NUEVO (RF-12)
  url?: string;
  vcard?: VCardData;
  documentUrl?: string | null;   // ⬅ NUEVO (solo typeUrl === 'pdf')
  typeUrl: string;
}

// Página pública del QR — agregar itemId y documentUrl
export interface UrlListItem {
  itemId?: string;               // ⬅ NUEVO (RF-12)
  url?: string;
  vcard?: VCardData;
  documentUrl?: string | null;   // ⬅ NUEVO (solo typeUrl === 'pdf')
  typeUrl: string;
}
```

> [!warning] Impacto en `buildUrlList` y `detectUrlType`
> `buildUrlList` (en `ListUrlForm.helpers.ts`) construye `ListUrlData[]` desde las rows: para `pdf` debe emitir `{ itemId, typeUrl: 'pdf', documentUrl }` **sin `url`** (ver §4.2.3). `detectUrlType` no aplica a `pdf` (no es una URL) — el tipo solo se asigna desde el `Select`.

### 4.3 Constantes

**`qr-app/src/constants/social.const.ts`** — agregar la entrada `'pdf'` a `socialConst` (es el array que alimenta el `Select` de `ListUrlRow` vía `socialTypes`):

```ts
{
  id: 'pdf',
  name: 'PDF',
  icon: Icon({ name: 'pdf' }),  // requiere agregar 'pdf' al mapa de @/components/icon
  baseUrl: '',
  pattern: /^$/i,               // no matchea pegado de URLs (el tipo solo se elige en el Select)
},
```

> [!note] `constants/qrTypes.ts` NO se modifica (revisión 2026-08-09)
> `qrTypes.ts` contiene tipos de **QR** (`QR_TYPES`/`QR_TYPE_LABELS`: dynamic, list, vcard…), no de items de lista. El `typeUrl: 'pdf'` de los items vive en `socialConst`/`socialTypes`, no aquí.

**`qr-app/src/components/icon` (mapa de iconos)** — agregar la entrada `'pdf'` (icono `FileText`/`file-text` de lucide-react) para: el `Select` de `ListUrlRow`, el botón ancla de `UrlList.tsx` y el `ListPdfUploader`.

---

## 5. Variables de entorno (`.env`)

### 5.1 Backend `backend-portaqr/.env`

> [!warning] Revisión 2026-08-11 — las claves R2 YA están configuradas localmente
> Verificado 2026-08-11: `backendPortaqr.env`, `.env` y `.env.example` **ya contienen las variables `CLOUDFLARE_R2_*` completas** (valores reales en dev, placeholders en el example). Esta spec solo necesita agregar `PDF_MAX_UPLOAD_SIZE` y `MAX_PDF_ITEMS_PER_QR` (T-005-00).

```env
# ───────── Cloudflare R2 (compartido con SPEC-002) ─────────
# ✅ Ya configuradas en .env / backendPortaqr.env / .env.example (verificado 2026-08-11):
CLOUDFLARE_R2_ACCESS_KEY_ID=tu_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=tu_secret_key
CLOUDFLARE_R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
CLOUDFLARE_R2_BUCKET_NAME=portaqr-assets
CLOUDFLARE_R2_PUBLIC_URL=https://<custom-domain-o-subdominio>.r2.dev
CLOUDFLARE_R2_MAX_UPLOAD_SIZE=5242880   # 5 MB (SPEC-002, default)

# ───────── SPEC-005: PDFs ─────────
# Límite de tamaño del PDF de entrada en bytes (default 2 MB)
PDF_MAX_UPLOAD_SIZE=2097152
# Máximo de items PDF por QR multilink (default 2)
MAX_PDF_ITEMS_PER_QR=2
```

Actualizar `backend-portaqr/.env`, `backend-portaqr/backendPortaqr.env` (env_file del compose) y `.env.example` con las claves de PDFs (las `CLOUDFLARE_R2_*` ya existen — valores placeholder en el example).

### 5.2 Frontend `qr-app/.env.local`

```env
# SPEC-005: límite de items PDF por QR (debe coincidir con el backend)
NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR=2
# SPEC-005: tamaño máximo del PDF de entrada en bytes (debe coincidir con PDF_MAX_UPLOAD_SIZE del backend; default 2 MB = 2097152)
NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE=2097152
```

> [!note] Sincronización de límites
> El frontend usa `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR` para bloquear la UI al alcanzar el límite y `NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE` (bytes) para la validación cliente de tamaño (ambas leídas en `ListUrlForm.helpers.ts` — constantes `MAX_PDF_ITEMS_PER_QR` y `PDF_MAX_UPLOAD_SIZE`). El backend valida con `MAX_PDF_ITEMS_PER_QR` y `PDF_MAX_UPLOAD_SIZE`. Deben coincidir; si difieren, el backend tiene la última palabra (responde 400/413).

### 5.3 Docker Compose `desarrollo-qr/docker-compose.yml`

El servicio `backend-portaqr` ya carga sus variables vía `env_file: ./backend-portaqr/backendPortaqr.env`. Añadir las claves nuevas:

```env
PDF_MAX_UPLOAD_SIZE=2097152
MAX_PDF_ITEMS_PER_QR=2
```

> [!note] En producción (Railway)
> Añadir las mismas variables de entorno del servicio en Railway (secrets).

---

## 6. Configuración Docker (instalar Ghostscript)

### 6.1 Dockerfile de `backend-portaqr`

> [!warning] Revisión 2026-08-09 — Dockerfile real es `node:20-alpine` **multi-stage**
> El Dockerfile actual tiene **3 etapas**: `builder` (compila), `development` (dev con hot-reload — la que usa docker-compose con `target: development`), `production` (ejecuta `dist/main.js`). **Ghostscript debe instalarse en las etapas `development` y `production`** (las que ejecutan la app; `builder` no lo necesita para compilar).

**Etapa `development`** (después del `RUN apk add --no-cache python3 make g++` existente):

```dockerfile
# SPEC-005: Ghostscript para sanitización de PDFs (PdfSanitizerService)
RUN apk add --no-cache ghostscript
```

**Etapa `production`** (idéntico):

```dockerfile
RUN apk add --no-cache ghostscript
```

> [!note] Tamaño de imagen
> `ghostscript` en Alpine agrega ~30-40 MB a la imagen. Aceptado (ADR-005.2, trade-off del borrador).
>
> ⚠️ Si en el futuro se cambia la base a `node:XX-slim` (Debian): `RUN apt-get update && apt-get install -y --no-install-recommends ghostscript && rm -rf /var/lib/apt/lists/*`.

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
>
> ⚠️ **Revisión 2026-08-09**: el JSON de tareas aún NO existe — es la primera tarea a ejecutar. Estimaciones actualizadas según los refactors de SPEC-004/004-B (paths y archivos reales).

| ID | Tarea | Capa | Estimación |
| --- | --- | --- | --- |
| T-005-00 | Crear `docs/tareas/SPEC-005-tareas.json` + configurar env local: `PDF_MAX_UPLOAD_SIZE`, `MAX_PDF_ITEMS_PER_QR`, `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR` (las claves `CLOUDFLARE_R2_*` ya existen — verificado 2026-08-11) | Infra | 0.25d |
| T-005-01 | Instalar `ghostscript` en Dockerfile del backend (etapas `development` y `production` — multi-stage `node:20-alpine`) + verificar `gs --version` | Infra | 0.25d |
| T-005-02 | `PdfSanitizerService` (spawn gs) + tests unitarios (mock spawn) | Backend | 0.5d |
| T-005-03 | Extender `StorageService.uploadPdf` + `extractKeyFromUrl` para `qr-multilink-pdf/` | Backend | 0.25d |
| T-005-04 | Schema + DTOs + entity: campos `itemId`, `documentUrl` en `urlList[]` — validador de exclusividad por item **y límite `MAX_PDF_ITEMS_PER_QR` en `case 'list'`** + declarar campos en `ListUrlData` (create-qr.dto) y `UrlListItem` (url-item.dto) — **obligatorio por whitelist de SPEC-008** | Backend | 1d |
| T-005-05 | Endpoint `POST /qr/list-pdf` (multipart + FileInterceptor + gs + R2) + validación owner/tipo/limite | Backend | 1d |
| T-005-06 | `PATCH /qr/:id` en controller: borrar R2 al eliminar/reemplazar item PDF (patrón SPEC-002, §4.1.6) + mapper `qr-mongo.mapper.ts` (itemId al vuelo en `toEntity`) | Backend | 0.5d |
| T-005-07 | API route `/api/qr/list-pdf` (proxy con jose/cookies) + `uploadListPdf` en `qr.service.ts` | Frontend | 0.5d |
| T-005-08 | `ListPdfUploader.tsx` + integración en el form de lista: `social.const.ts` (entrada pdf), `ListUrlRow.tsx` (input file condicional), `ListUrlForm.helpers.ts` (tipo `ListUrlRow` + `buildUrlList` sin filtrar pdf), `ListUrlForm.tsx` (handleTypeChange + useEffect preservando itemId/documentUrl), mapa de iconos (`pdf`) | Frontend | 1.5d |
| T-005-09 | Integrar en `EditQrForm.tsx` (+ `editQrForm.state.ts`/`.helpers.ts`) — editar/eliminar PDF; integración de subidas pendientes en `CreateQrForm.state.ts` (creación) | Frontend | 0.75d |
| T-005-10 | Render en `UrlList.tsx` (botón ancla `bg-rose-600` para `typeUrl === 'pdf'` + `getIconForType`/`getColorForType`) + tipos (`interfaces/qr.ts`: `ListUrlData` y `UrlListItem`) | Frontend | 0.25d |
| T-005-11 | Tests unitarios `PdfSanitizerService` (mock spawn de gs) + `StorageService.uploadPdf` (mock S3 client) + validador schema (exclusividad + límite) | Backend | 0.5d |
| T-005-12 | Tests integración endpoint multipart (supertest, sin tocar R2 real ni gs real) | Backend | 0.5d |
| T-005-13 | Tests unitarios `ListPdfUploader` (mock `uploadListPdf`) + `buildUrlList` (item pdf no filtrado) + API route proxy | Frontend | 0.5d |
| T-005-14 | Tests E2E: subir PDF real, verificar sanitización (sin JS, sin metadata) | QA | 0.5d |
| T-005-15 | Docs Obsidian + este spec polish + `docs/tareas/SPEC-005-tareas.json` con status done | Docs | 0.25d |

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
  - 400 si el `itemId` corresponde a un item existente que NO es `typeUrl: 'pdf'` (corrección 2026-08-11 — RF-13 paso 5).
  - 413 si el archivo excede 2 MB.
  - 415 si MIME no es `application/pdf`.
  - 422 si gs no puede procesar el PDF (mock que lanza `UnprocessableEntityException`).
- **Validador del schema (case 'list')**: item `pdf` sin `documentUrl` → inválido; item `pdf` con `url` o `vcard` → inválido; `urlList` con > `MAX_PDF_ITEMS_PER_QR` items pdf → inválido; items legacy (url/vcard) siguen pasando (sin regresión).
- **Controller `PATCH /qr/:id`**: al eliminar un item PDF del `urlList` invoca `deleteObject` de su `documentUrl` (mejor esfuerzo); al reemplazar `documentUrl` para el mismo `itemId` invoca `deleteObject` del anterior; si `deleteObject` falla no aborta el patch (mock de `StorageService.deleteObject` lanzando).

### 8.2 Frontend

- **`ListPdfUploader`** con mock de `qrService.uploadListPdf`:
  - archivo válido → muestra botón ancla con la URL devuelta.
  - archivo > 2 MB → `onError('…')`, no llama al backend.
  - extensión no PDF → `onError`.
  - botón "Eliminar" → `onChange(null)`.
  - error de red / 413 / 415 / 422 del backend → `onError` y `onChange` no se llama.
- **`buildUrlList`** (`ListUrlForm.helpers.ts`): una row `{ type: 'pdf', itemId, documentUrl: null }` **es filtrada** (excluida del payload — corrección de implementación 2026-08-11: el validador del schema rechaza `pdf` sin `documentUrl`, así que el PDF se sube después vía `POST /qr/list-pdf` que agrega el item; el caso `{ type: 'pdf', itemId, documentUrl: '<url>' }` emite `{ itemId, typeUrl: 'pdf', documentUrl }` sin `url`); las rows url/vcard existentes no cambian su salida (regresión).
- **API route `/api/qr/list-pdf`**: 401 sin cookie válida; reenvía FormData al backend y propaga status/errores.
- **`UrlList`** renderiza botón ancla `bg-rose-600` solo si `typeUrl === 'pdf'` y `documentUrl` existe; si `documentUrl` no existe, el item no se renderiza; la key usa `itemId` si existe.

### 8.3 E2E (Playwright, `e2e-tests-portaqr/`)

- Flujo crear QR multilink CON item PDF → verificar URL pública incluye el botón ancla rosa (`bg-rose-600`) (mock del endpoint `/api/qr/list-pdf` con interceptor).
- Flujo editar QR existente y eliminar item PDF → verificar `PATCH` body incluye `urlList` sin el item PDF.
- **Test de sanitización real** (opcional, requiere gs real): subir un PDF con JavaScript embebido y metadata, descargar el PDF sanitizado de R2, verificar con `pdfinfo` que no tiene `/JS` ni `/Author`.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Ghostscript no instalado en el contenedor | Media | Alto | Dockerfile layer + verificación `gs --version` en healthcheck |
| Subida de PDFs grandes consume memoria del backend (multipart `memoryStorage`) | Media | Medio | `limits.fileSize: 2MB` + `fileFilter` allowlist |
| Usuario sube un PDF con `Content-Type` falseado o corrupto | Media | Medio | gs valida el binario real (parsing) → `422`; el MIME falseado no supera el re-renderizado |
| Objetos R2 huérfanos (item eliminado sin borrar PDF viejo) | Media | Bajo | Controller `PATCH /qr/:id` borra al detectar eliminación (§4.1.6) + lifecycle rule §6.3 |
| Fallo entre `PutObjectCommand` y el PATCH a Mongo (objeto subido sin URL persistida) | Baja | Bajo | Orden del flujo: primero R2, luego Mongo; si el PATCH falla queda objeto huérfano → lifecycle |
| Latencia de gs (~1-3s por upload) bloquea el event loop | Media | Medio | gs corre en subprocess (no bloquea el event loop de Node); para alta concurrencia futuro: pool de procesos (§11.4) |
| Abuso: usuario sube muchos PDFs (hasta el límite) repetidamente | Baja | Medio | `MAX_PDF_ITEMS_PER_QR` (default 2) + rate limit por usuario (futuro §11.5) |
| `itemId` colisiona entre items (si el frontend genera duplicados) | Baja | Bajo | UUID v4 evita colisiones; el backend valida unicidad al persistir |
| Items existentes (pre-SPEC-005) sin `itemId` | Alta | Bajo | Mapper genera `itemId` al vuelo (`randomUUID()`) — no requiere migración masiva |
| **`whitelist:true` de SPEC-008 elimina `itemId`/`documentUrl` en PATCH si no están en los DTOs** (revisión 2026-08-09) | Alta | Alto | Declarar ambos campos en `ListUrlData` (create-qr.dto) y `UrlListItem` (url-item.dto) — §4.1.2; test de integración PATCH con items PDF |
| **`buildUrlList` filtra items sin `url` → el item PDF no llega al payload al crear** (revisión 2026-08-09) | Alta | Alto | Modificar el filtro y el tipo `ListUrlRow` (§4.2.3) + test unitario de `buildUrlList` |
| **PATCH directo supera `MAX_PDF_ITEMS_PER_QR` sin validación** (revisión 2026-08-09) | Media | Medio | Validación del límite en el validador del schema `case 'list'` (§4.1.3) + test |
| **`itemId`/`documentUrl` se pierden en el sync `urlList`→rows del form** (revisión 2026-08-09) | Media | Medio | Preservar campos en el `useEffect` de `ListUrlForm.tsx` (§4.2.3) |
| **Env de PDFs sin configurar (`PDF_MAX_UPLOAD_SIZE`/`MAX_PDF_ITEMS_PER_QR`)** (revisión 2026-08-11; las claves `CLOUDFLARE_R2_*` ya existen localmente) | Baja | Bajo | T-005-00: agregar las 3 claves de PDFs a `.env`/`backendPortaqr.env`/`.env.example` + `.env.local` (§5.1/§5.2) |

---

## 10. Observabilidad

> [!note] Revisión 2026-08-09 — patrón unificado
> El patrón real del codebase: **`TraceService`/`TraceLayer` para logs de request-scoped** (controller: `this.traceService.log/warn(tracking, TraceLayer.CONTROLLER, ...)`) y **`Logger` de NestJS para logs de servicios internos** (`PdfSanitizerService`, `StorageService`). Se mantiene ese patrón.

- **Logs request-scoped** (TraceService) en el endpoint `POST /qr/list-pdf` (controller):
  - `INFO`: `pdf_upload_received` con `{ userId, idQr, itemId, originalSize }`.
  - `INFO`: `pdf_uploaded` con `{ idQr, itemId, key, bytes }` (tras PutObjectCommand).
  - `WARN`: `pdf_upload_rejected` con motivo (`not_owner` / `wrong_type` / `bad_mime` / `too_large` / `limit_exceeded` / `sanitize_failed`).
- **Logs request-scoped** en `PATCH /qr/:id` (controller) cuando limpia R2:
  - `INFO`: `PATCH /qr/:id - pdf item removed` / `- pdf replaced` con `{ qrid, itemId, oldUrl }`.
  - `ERROR`: si `deleteObject` falla — no abortar el patch; registrar (`StorageService` ya logea `r2_failed_delete`).
- **Logs de servicios** (Logger):
  - `PdfSanitizerService`: `INFO` `pdf_sanitized` con `{ idQr, itemId, inputBytes, outputBytes }` (tras gs); `WARN` `gs exited with code ...` / `ERROR` `gs spawn error`.
  - `StorageService.uploadPdf`: `INFO` `r2_object_put { idQr, itemId, size }` (mismo formato que `uploadImage`).
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
| **`MAX_PDF_ITEMS_PER_QR`** | Límite configurable (env var) de items PDF por QR multilink. Default 2. |

---

## 13. Referencias

- [[SPEC-001-migracion-monolito-modular]] — arquitectura hexagonal de `backend-portaqr/`.
- [[SPEC-002-qr-multilink-imagen]] — infraestructura R2 + `StorageService` + `ImageProcessorService` (reutilizada) + patrón de limpieza R2 en controller.
- [[SPEC-003-auditoria-dependencias-qr-app]] — impacto en auth (cookies httpOnly + jose) y puerto del backend (:3004).
- [[SPEC-004-react-doctor-qr-app]] — refactor de `CreateQrForm` (`CreateQrForm.state.ts` + `CreateQrForm.helpers.ts`).
- [[SPEC-004-B-no-giant-component-qr-app]] — split de `ListUrlForm` (`ListUrlRow.tsx` + `ListUrlForm.helpers.ts`) y `EditQrForm` (`editQrForm.state.ts` + `editQrForm.helpers.ts`).
- [[SPEC-008-hardening-sanitizacion-backend-portaqr]] — `ValidationPipe` con `whitelist:true` + `forbidNonWhitelisted` (obliga a declarar `itemId`/`documentUrl` en DTOs).
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- AWS SDK v3 client-s3 (PutObject/DeleteObject): https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
- Ghostscript docs: https://www.ghostscript.com/documentation/
- Ghostscript pdfwrite options: https://www.ghostscript.com/doc/current/VectorDevices.htm#PDFWRITE
- Schema QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/schemas/qr.schema.ts`
- Mapper QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts`
- StorageService: `backend-portaqr/src/modules/storage/storage.service.ts`
- ImageProcessorService (patrón a seguir): `backend-portaqr/src/modules/storage/image-processor.service.ts`
- Controller QR (patrones list-image + limpieza R2 en PATCH): `backend-portaqr/src/modules/qr/presentation/controllers/qr.controller.ts`
- DTOs: `backend-portaqr/src/modules/qr/application/dto/create-qr.dto.ts` (`ListUrlData`) y `url-item.dto.ts` (`UrlListItem`)
- API route frontend (patrón): `qr-app/src/app/api/qr/list-image/route.ts`
- Servicio QR (patrón `uploadListImage`): `qr-app/src/services/qr.service.ts`
- Componente UrlList: `qr-app/src/components/qr/UrlList.tsx`
- Form de lista (post SPEC-004-B): `qr-app/src/components/qr/forms/ListUrlForm.tsx` + `ListUrlRow.tsx` + `ListUrlForm.helpers.ts`
- Constantes de tipos de item: `qr-app/src/constants/social.const.ts`
- Tipos compartidos: `qr-app/src/interfaces/qr.ts` (`ListUrlData`, `UrlListItem`)
- Componente ListImageUploader (patrón a seguir): `qr-app/src/components/qr/ListImageUploader.tsx`
- Edición QR (post SPEC-004-B): `qr-app/src/app/dashboard/qr/edit/[id]/EditQrForm.tsx` (+ `editQrForm.state.ts` + `editQrForm.helpers.ts`)
- Creación QR (post SPEC-004): `qr-app/src/components/qr/CreateQrForm.tsx` (+ `CreateQrForm.state.ts` + `CreateQrForm.helpers.ts`)

---

## 14. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-07 | Equipo | Borrador inicial. Modelo del item PDF en `urlList[]` (`typeUrl: 'pdf'` + `documentUrl`), sanitización con Ghostscript, key R2 `qr-multilink-pdf/{idQr}-{itemId}.pdf`, límites `PDF_MAX_UPLOAD_SIZE` (2 MB) y `MAX_PDF_ITEMS_PER_QR` (5), endpoint `POST /qr/list-pdf`, ADRs 005.1-005.3 |
| 2026-08-09 | Equipo | **Validación arquitectónica post-desarrollo** (SPEC-004, SPEC-004-B, SPEC-006..011 implementadas; SPEC-005 NO implementada — sin código ni tareas). Actualizaciones: (1) paths/nombres frontend: `ListUrlForm` dividido (`ListUrlRow.tsx` + `ListUrlForm.helpers.ts`), edición en `EditQrForm.tsx`, creación en `CreateQrForm.state.ts`/`.helpers.ts`, tipos en `interfaces/qr.ts` (`ListUrlData` + `UrlListItem`, `qr.interface.ts` eliminado); (2) DTOs: clase real `ListUrlData` (no `QrUrlListItem`) + `UrlListItem` en `url-item.dto.ts`; (3) hueco RF-5/CA-10 cerrado: límite `MAX_PDF_ITEMS_PER_QR` también validado en el validador del schema `case 'list'` (cubre PATCH directo); (4) limpieza R2 de items PDF movida al **controller** `PATCH /qr/:id` (patrón SPEC-002, no `UpdateQrUseCase`); (5) compatibilidad `whitelist:true` de SPEC-008: `itemId`/`documentUrl` declarados en DTOs o serán eliminados; (6) `buildUrlList` modificado para no filtrar items PDF sin `url`; (7) preservación de `itemId`/`documentUrl` en el sync `urlList`→rows; (8) §5.1 corregido: claves `CLOUDFLARE_R2_*` NO existen en el `.env` local (T-005-00 las agrega); (9) §6.1: Dockerfile `node:20-alpine` multi-stage → gs en etapas `development` y `production`; (10) color botón PDF `bg-rose-600` (evita colisión con `google maps` `bg-red-500`); (11) icono `pdf` agregado al mapa de `@/components/icon`; (12) §4.1.7: mapper es pass-through de `data` (solo itemId al vuelo en `toEntity`); (13) plan de tareas T-005-00..15 actualizado (paths reales + estimaciones). Estado: **sigue `borrador`** — pendiente de desarrollo |
| 2026-08-11 | Equipo | **Reducción del límite de items PDF por QR**: `MAX_PDF_ITEMS_PER_QR` cambia de default `5` a **default `2`** (máximo 2 PDFs por QR multilink, configurable vía env). Actualizado en: abstract (§resumen), §2.1 RF-5, CA-10, §4.1.3 (validador schema `case 'list'` — fallback `: 2`), §4.1.5 (`getMaxPdfItemsPerQr` — fallback `: 2`), §5.1/§5.2/§5.3 (valores de env `MAX_PDF_ITEMS_PER_QR=2` y `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR=2`), §9 (riesgo abuso), §12 (glosario). Estado: **sigue `borrador`** — pendiente de desarrollo |
| 2026-08-11 | Equipo | **Correcciones menores post-revisión contra el código** (verificación 2026-08-11): (1) §5.1: las claves `CLOUDFLARE_R2_*` **YA existen** en `.env`/`backendPortaqr.env`/`.env.example` — se corrige el warning, T-005-00 y la fila de riesgo §9 (solo faltan las 3 claves de PDFs); (2) RF-13 paso 5 implementado en el controller (§4.1.5): si el `itemId` existe pero no es `typeUrl: 'pdf'` → `400` ANTES de sanitizar/subir (evita objeto R2 huérfano) + test en §8.1; (3) RF-15: se elimina "(o lo incluye sin `documentUrl`)" — contradice RF-4 (validador rechaza PDF sin URL); (4) RF-15: referencia §6.4 → **§6.3** (lifecycle); (5) RF-17/RF-19/§4.2.2: label fijo **"Descargar PDF"** — el modelo no persiste el nombre del archivo (solo en-sesión); (6) cosméticos: CA-02 "rojo" → "rosa (`bg-rose-600`)", ApiResponse 413 y ApiBody con límite configurable `PDF_MAX_UPLOAD_SIZE`. Estado: **sigue `borrador`** — pendiente de desarrollo |
| 2026-08-11 | Equipo | **IMPLEMENTADA** (T-005-00..15 cerradas). Desviaciones de implementación registradas: (1) **flujo de creación corregido**: `buildUrlList` filtra items PDF sin `documentUrl` (el validador del schema los rechaza) → el QR se crea sin items PDF y `POST /qr/list-pdf` hace **append** del item con `documentUrl` real (§4.2.3 actualizado, §8.2 corregido); (2) uploads pendientes en `CreateQrForm` iteran `pendingPdfFilesRef` keyed por `itemId` (no `state.urlList` — fix 2026-08-11 tras hallazgo E2E); (3) `try/catch` adicional alrededor de `deleteObject` en el bloque PATCH (§4.1.6, defensa en profundidad — el servicio ya no relanza); (4) `pdfSanitizer` inyectado al final del constructor del controller (no rompe mocks posicionales); (5) helper compartido `pdf-limits.helper.ts` (`getMaxPdfItemsPerQr`, fallback 2) usado por schema y controller; (6) T-005-13: `qr-app` no tiene framework de tests (Next 16.3/TS 6.0.3) → verificación estática + ejecución dinámica de `buildUrlList` (8/8 casos) — pendiente de runner (sugerencia: vitest con validación previa de compatibilidad TS 6); (7) T-005-14: E2E escritos (4 tests + fixture PDF + soporte pdf en `utils/db.ts`), compilan y listan; ejecución quedó **skipped** porque `backend-portaqr` estaba caído (Mongo reiniciado) — re-ejecutar con el contenedor sano; (8) cobertura backend: pdf-sanitizer 100%, storage 100% (branch 100%), helper 100%, schema 92.18%, controller ~74% (todas las líneas SPEC-005 cubiertas; el resto son endpoints preexistentes) — suite completa **138 suites / 1015 tests PASS**. Ramas: `feat/spec-005` en backend-portaqr, qr-app y e2e-tests-portaqr |
| 2026-08-11 | Equipo | **Fixes post-implementación + validación final completa**: (1) **fix sync `urlList`→rows por firma JSON** (`ListUrlForm.tsx` — el eco de `buildUrlList` creaba un array nuevo con el mismo contenido en cada keystroke y pisaba filas locales; se re-sincroniza solo cuando el contenido cambia — encontrado por E2E); (2) **`pendingPdfCount` en el estado de `CreateQrForm`** — la validación LIST habilita el submit cuando solo hay PDFs pendientes (los items pdf sin `documentUrl` se excluyen del payload); (3) uploads post-creación iteran `pendingPdfFilesRef` keyed por `itemId` (no `state.urlList`); (4) **`NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE`** (§5.2): el peso de 2 MB ya no está hardcodeado en el frontend (constante `PDF_MAX_UPLOAD_SIZE` en `ListUrlForm.helpers.ts`, mensajes y validación derivados de la env); (5) icono `pdf` definitivo: SVG FontAwesome file-pdf (monocromo, sin `<text>` dependiente de fuentes); (6) **E2E: 5 tests verdes** (crear con PDF, página pública, eliminar→PATCH, límite 2 PDFs, peso >2MB rechazado en cliente sin llamar al backend) — **suite completa 46/46 PASS**; (7) validación manual en navegador con gs real (10.06.0) + R2 real: PDF inválido → 422, PDF válido → 200 y botón "Descargar PDF" `bg-rose-600` en página pública con href R2 `qr-multilink-pdf/{idQr}-{itemId}.pdf`; (8) **nota de producción creada**: [[NOTA-despliegue-produccion-SPEC-005]] (4 variables: `PDF_MAX_UPLOAD_SIZE`, `MAX_PDF_ITEMS_PER_QR`, `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR`, `NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE` — las NEXT_PUBLIC requieren rebuild; gs en imagen; policy R2 `qr-multilink-pdf/*`); (9) infra: servicios deprecados comentados en docker-compose (user-service/bff-service/qr-service — SPEC-001) y `qr-app.depends_on` → `backend-portaqr: service_healthy`; fallbacks de API routes `:3001` → `:3004`. Estado: **implementado** |
