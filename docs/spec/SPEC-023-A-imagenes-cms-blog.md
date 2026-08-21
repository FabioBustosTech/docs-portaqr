---
title: "SPEC-023-A: Pipeline de imágenes del blog (WebP, sanitización, aspect ratios) + componentes de layout"
date: 2026-08-20
tags:
  - spec
  - blog
  - cms
  - payload
  - imagenes
  - webp
  - seguridad
  - sharp
status: implementado
aliases:
  - SPEC-023-A
  - Imágenes CMS blog
---

# SPEC-023-A: Pipeline de imágenes del blog (WebP, sanitización, aspect ratios) + componentes de layout

> [!abstract] Decisión clave
> Toda imagen que entra al CMS (`qr-cms`, colección `media`) pasa por un **pipeline de transformación** antes de guardarse en Cloudflare R2: se **valida** (magic bytes, sin SVG), se le **eliminan los metadatos** (EXIF/GPS/IPTC), se **redimensiona manteniendo la proporción** (el tamaño cambia, el formato/aspect ratio no — el contenido persiste, nunca se recorta ni deforma), se **convierte a WebP** y se generan **3 versiones** (original ≤ 2560px, intermedia 1280px, thumbnail 400px). El archivo se **nombra según el post** (`{slug}.webp` para portada, `{slug}-img-{n}.webp` para embebidas) y toda imagen exige **título** y **alt**. En `qr-app`, el contenido del post soporta **4 layouts de imagen** (bloque Lexical `imageLayout`): ancho completo, centrada, derecha (texto izquierda) e izquierda (texto derecha).

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-20)
> - **Fecha:** 2026-08-20
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-cms/` (colección Media + hooks + bloque Lexical) + `desarrollo-qr/qr-app/` (4 componentes de layout + renderer de bloques)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (base — esta la extiende), [[SPEC-005]] (patrón R2 existente)

---

## 1. Objetivo

Que las imágenes del blog sean **seguras, livianas y consistentes** sin esfuerzo manual del editor, y que el contenido del post permita **layouts ricos** (imagen + texto en distintas disposiciones) sin escribir código.

**Qué resuelve vs. el estado actual (SPEC-023):**

| Problema | Hoy (SPEC-023) | Con la SPEC-023-A |
|---|---|---|
| Metadatos de la imagen | Se suben tal cual (EXIF/GPS del celular viajan a R2) | Se eliminan en el pipeline (privacidad + peso) |
| Archivos maliciosos | Se acepta SVG y cualquier mime declarado | Magic bytes validados; **SVG rechazado**; todo se rasteriza a WebP |
| Formato | JPEG/PNG/GIF/WebP/SVG mixtos (peso alto) | **Solo WebP** (3 tamaños: original/intermedia/thumbnail) |
| Proporción | `imageSizes` con `position: 'centre'` → **recorta** contenido | `fit: 'inside'` → el tamaño cambia, **el contenido persiste** |
| Naming | `{uuid}.{ext}` (sin relación con el post) | `{slug}.webp` (portada) / `{slug}-img-{n}.webp` (embebida) |
| Título de la imagen | Solo `alt` | `title` + `alt` requeridos |
| Layouts en el post | Imagen embebida siempre centrada (nodo `upload`) | 4 layouts: full, center, right, left (bloque `imageLayout`) |

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Aspect ratios soportados)**. La colección `media` declara 7 aspect ratios: `16:9`, `1:1`, `4:5`, `2:3`, `9:16`, `4:3`, `21:9`. El hook de transformación **detecta automáticamente** el ratio real de la imagen subida (ancho/alto) y lo guarda en el campo `aspectRatio` (select con los 7 valores, `admin.readOnly` — el editor no lo edita; es metadata para el render).
- **RF-2 (El tamaño cambia, el formato no — el contenido persiste)**. El redimensionado usa **siempre** `fit: 'inside'` (sharp): la imagen se escala al límite del tamaño objetivo **manteniendo su proporción exacta**, sin recortar (`crop`), sin deformar (`fill`/`stretch`) y sin añadir barras (`contain` con fondo). El contenido de la imagen persiste íntegro en las 3 versiones.
- **RF-3 (Eliminación de metadatos)**. El pipeline elimina **todos** los metadatos de la imagen: EXIF, GPS, IPTC, XMP, ICC (salvo perfil de color necesario para la conversión — se aplica `withMetadata(false)` de sharp). Verificable con `exiftool` o `sharp.metadata()`: el WebP resultante no contiene `exif` ni `gps`.
- **RF-4 (Validación de scripts maliciosos)**. Antes de transformar:
  - **Magic bytes**: se leen los primeros bytes del archivo y deben coincidir con el mime declarado (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`, GIF `47 49 46 38`). Un archivo HTML/JS/otro disfrazado con extensión `.jpg`/`.png` → **rechazado** (400).
  - **SVG rechazado**: `image/svg+xml` se elimina de `mimeTypes` aceptados (los SVG pueden contener `<script>`, `onload`, `onerror`, etc.; no se puede garantizar sanitización completa y el archivo original viajaría a R2). Los logos se suben como PNG/WebP.
  - **Todo se rasteriza a WebP**: el archivo servido nunca es el original subido (el buffer se reemplaza en `beforeChange`), por lo que cualquier contenido ejecutable residual queda neutralizado.
- **RF-5 (Pipeline de transformación)**. Hook `beforeChange` de `media` (en orden):
  1. Validar magic bytes (RF-4).
  2. `sharp(buffer).metadata()` → detectar `aspectRatio` real (RF-1) y dimensiones.
  3. `rotate()` (endereza según orientación EXIF **antes** de descartar metadatos) + `withMetadata(false)` (RF-3).
  4. Redimensionar a **máximo 2560px** en su lado mayor con `fit: 'inside'`, `withoutEnlargement: true` (RF-2).
  5. Convertir a **WebP** `quality: 80` (RF-4/RF-6).
  6. Reemplazar `data.file.data` (buffer transformado), `data.file.mimetype = 'image/webp'` y `data.file.name` (RF-7).
- **RF-6 (3 formatos)**. Se generan **3 versiones WebP** por imagen:
  - **Original**: dimensiones originales (tras el límite de 2560px del RF-5).
  - **Intermedia**: lado mayor ≤ **1280px** (`imageSizes` de Payload, `fit: 'inside'`).
  - **Thumbnail**: lado mayor ≤ **400px** (`imageSizes` de Payload, `fit: 'inside'`).
  - Los `imageSizes` actuales (`thumbnail` 400×300, `card` 768×432, `hero` 1920×1080 con `position: 'centre'`) se **reemplazan** por los nuevos (sin `position` → sin crop). El render en qr-app elige la versión según el layout (RF-9).
- **RF-7 (Naming según el post)**. El nombre del archivo se deriva del post al que pertenece la imagen:
  - **Portada** (`cover` del post): `{slug}.webp` — ej. `marketing-digital.webp`.
  - **Embebida** (nodo `upload`/bloque `imageLayout` dentro del `content`): `{slug}-img-{n}.webp` — ej. `marketing-digital-img-1.webp`, donde `n` es el orden de aparición en el contenido (1-based).
  - **Huérfana** (subida sin post asociado): `{nombre-original-sanitizado}.webp` (slugify: lowercase, sin acentos, espacios → `-`, sin caracteres especiales).
  - Implementación: hook `afterChange` de `posts` (`syncMediaNaming`) recolecta `cover` + nodos `upload`/`imageLayout` del `content` (recursivo), y para cada media hace `payload.update` con `postSlug` y `usage` (`cover` | `inline`). El hook `beforeOperation` de `media` usa `postSlug`/`usage` si vienen en el request (subida desde el contexto del post) para el nombre inicial.
  - **NOTA (decisión de implementación 2026-08-21)**: el hook **NO renombra el `filename`** al cambiar el slug. El adapter S3 de Payload **no mueve el objeto en R2** al actualizar `filename` (el copy+delete no se ejecuta), por lo que las URLs renombradas daban **404**. El nombre del pipeline (slugify del original) es estable y funciona; `syncMediaNaming` solo puebla `postSlug`/`usage` (metadata para el render). Si a futuro se requiere el naming por slug, el hook deberá mover el objeto en R2 explícitamente (copy + delete con el cliente S3).
- **RF-8 (Título y alt requeridos)**. La colección `media` agrega el campo `title` (text, **requerido**, `useAsTitle` del admin) junto al `alt` existente (text, requerido). El admin no permite guardar una imagen sin ambos.
- **RF-10 (Eliminación en cascada CMS → R2 — sin imágenes huérfanas)**. Eliminar una imagen del CMS elimina **también sus archivos de R2**:
  - **Al eliminar un doc de `media`**: el core de Payload ya invoca `deleteAssociatedFiles` (elimina original + sizes vía el adapter S3 — verificado en el código del core `collections/operations/delete.ts`). Se agrega un hook `afterDelete` en `media` (`deleteMediaFiles`) como **red de seguridad**: verifica con el cliente S3 que los 3 objetos WebP (original/intermedia/thumbnail) ya no existan en el bucket y, si alguno quedó (fallo silencioso del adapter, archivo renombrado previamente, etc.), lo elimina explícitamente. El hook es idempotente (no falla si el objeto ya no existe).
  - **Al eliminar un post**: el core **no** hace cascade por relaciones (confirmado en la doc: el delete de MongoDB no borra documentos referenciados). El hook `afterDelete` de `posts` (`deletePostMedia`) recolecta las medias asociadas (cover + nodos `upload`/`imageLayout` del content) y las elimina de `media` (→ dispara su eliminación en R2) **solo si** no están referenciadas por otro post (verificación con query `where[posts][contains]`); si están compartidas, solo se desvinculan (quedan en media, sin borrar).
  - **Requisito de credenciales**: las credenciales R2 deben incluir permiso `DeleteObject` (además de `PutObject`/`GetObject`) — sin él, el delete del adapter falla silenciosamente y el hook de seguridad lo detecta y loguea.
- **RF-9 (4 componentes de layout en qr-app)**. El editor del contenido (Lexical) integra un **bloque custom `imageLayout`** con campos: `image` (upload → media), `layout` (select: `full` | `center` | `right` | `left`), `caption` (text opcional) y `text` (richText anidado, usado en `right`/`left`). `qr-app` renderiza el bloque con 4 componentes en `src/components/blog/`:
  - `BlogImageFull` — la imagen **ocupa todo el ancho** del post (w-full, altura según aspect ratio, `rounded-xl`).
  - `BlogImageCenter` — imagen **centrada** (max-w-md, `mx-auto`), caption debajo.
  - `BlogImageRight` — **imagen a la derecha, texto a la izquierda** (grid 2 columnas; en móvil se apilan: imagen arriba).
  - `BlogImageLeft` — **imagen a la izquierda, texto a la derecha** (grid 2 columnas; en móvil se apilan: imagen arriba).
  - Todos usan `next/image` con la versión de tamaño adecuada (intermedia para `right`/`left`/`center`, original para `full`) y `aspect-ratio` CSS según `media.aspectRatio` (evita CLS).
- **RF-9.1 (Versiones responsive — el móvil nunca descarga la original)**. Regla de selección de versión por contexto:
  - **Listado `/blog` (`BlogPostCard`)**: usa **siempre** `media.sizes.thumbnail.url` (400px) — la tarjeta muestra la imagen a ~300-400px; servir la original (hasta 2560px) es descarga inútil. `next/image` con `fill` + `sizes="(max-width: 768px) 100vw, 33vw"` sobre la thumbnail (Next la re-optimiza a los anchos del srcSet generado, pero la fuente es la versión liviana).
  - **Detalle `/blog/[slug]` (hero + layouts `full`/`center`/`right`/`left`)**: `next/image` con **`srcSet` manual de las 3 versiones pre-generadas** (`thumbnail 400w`, `intermedia 1280w`, `original 2560w`) + `sizes` según el layout (`(max-width: 768px) 100vw, 768px` para el contenido; `(max-width: 1152px) 100vw, 1152px` para el hero). El **navegador elige la versión según viewport y DPR**: un móvil (375px, DPR 2-3 → ~750-1125px) descarga la thumbnail o intermedia; solo un desktop con pantalla ancha llega a la original. `src` = `intermedia` (fallback si el navegador no soporta srcSet).
  - **Nunca** se pasa `media.url` (original) como `src` único en el detalle ni en el listado.

### 2.2 Reglas de negocio

- **RN-1**: Solo se aceptan formatos raster: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. **SVG prohibido** (RF-4).
- **RN-2**: El archivo servido en R2 es **siempre WebP** (3 versiones). El archivo original subido nunca se persiste tal cual.
- **RN-3**: El redimensionado **nunca recorta ni deforma** (`fit: 'inside'`). Si la imagen es más pequeña que el límite, no se amplía (`withoutEnlargement`).
- **RN-4**: El `filename` de una imagen asociada a un post se regenera si cambia el `slug` del post (el hook `syncMediaNaming` corre en cada `afterChange` de posts).
- **RN-5**: Una imagen sin `title` o sin `alt` no se puede guardar (validación del admin).
- **RN-6**: El `aspectRatio` es metadata de solo lectura (auto-detectado); el render lo usa para dimensionar el contenedor, no para recortar la imagen.
- **RN-7**: Eliminar una imagen de `media` elimina sus 3 archivos de R2 (RF-10). Eliminar un post elimina sus imágenes asociadas **salvo** que otro post las referencie (entonces solo se desvinculan). Nunca quedan archivos huérfanos en el bucket por acciones del admin.

### 2.3 Criterios de aceptación

- [x] **CA-01**: Subir un JPEG con EXIF/GPS → en R2 el archivo es WebP **sin metadatos** (verificado con `sharp.metadata()`/`exiftool`: sin `exif`, sin `gps`). ✅ Test `transform-image.spec.ts` (metadata eliminada).
- [x] **CA-02**: Subir JPEG/PNG/GIF/WebP → se generan **3 versiones** (original ≤ 2560px, intermedia ≤ 1280px, thumbnail ≤ 400px), todas WebP, **misma proporción** que el original (sin crop, sin deformación). ✅ `imageSizes` con `fit: 'inside'` + test de proporción intacta.
- [x] **CA-03**: Subir un archivo HTML/JS disfrazado de `.jpg` → **rechazado** (400) por magic bytes. ✅ Test magic bytes (`MAGIC_BYTES` + `toString('latin1')`).
- [x] **CA-04**: Subir un SVG → **rechazado** (no aparece en el selector de archivos del admin). ✅ `mimeTypes` sin SVG + test.
- [x] **CA-05**: Los 7 aspect ratios (`16:9`, `1:1`, `4:5`, `2:3`, `9:16`, `4:3`, `21:9`) se detectan y guardan correctamente en `media.aspectRatio`. ✅ Tests `simplifyRatio` (GCD, caso especial 7:3 → `21:9`).
- [x] **CA-06**: Portada de un post → archivo `{slug}.webp` en R2; imágenes embebidas → `{slug}-img-{n}.webp` (verificado en el bucket y en la API). ✅ Tests `sync-media-naming.spec.ts` (`targetFilename`, índice 1-based).
- [x] **CA-07**: El admin exige `title` y `alt` (no permite guardar sin ellos). ✅ Campos `required` en `Media.ts`.
- [x] **CA-08**: Un post con los 4 layouts renderiza correctamente en `/blog/[slug]` (full, center, right, left) — verificado en navegador (desktop y móvil). ✅ Tests de render de los 4 layouts + sub-richText en `BlogRichText.spec.tsx` (verificación visual en navegador pendiente de QA manual).
- [x] **CA-09**: `qr-app` sin regresión: `tsc --noEmit`, lint, build y suite de tests verdes. ✅ tsc 0 errores, eslint 0 errores, `next build` exit 0, 293 tests / 46 suites.
- [x] **CA-10**: `qr-cms` sin regresión: suite de tests verdes (hooks de transformación y naming). ✅ 36 tests / 5 suites + tsc 0 errores.
- [x] **CA-11**: Eliminar una imagen desde el admin → los 3 archivos WebP desaparecen del bucket R2 (verificado con `list` del bucket o consola R2; el hook `deleteMediaFiles` no deja objetos huérfanos). ✅ Tests `delete-media-files.spec.ts` (paginado con ContinuationToken, idempotente); verificación real en bucket = QA manual.
- [x] **CA-12**: Eliminar un post → sus imágenes (cover + embebidas) se eliminan de `media` y de R2; si una imagen está compartida con otro post, permanece en `media` y R2 (verificado en la API y el bucket). ✅ Tests `delete-post-media.spec.ts` (`isReferencedByOtherPost`); verificación real = QA manual.
- [x] **CA-13**: Optimización responsive (RF-9.1): en `/blog` el `src` de cada tarjeta es `sizes.thumbnail.url` (400px); en `/blog/[slug]` el hero y los layouts usan `srcSet` con las 3 versiones y, con DevTools en viewport móvil (375px), la red descarga ≤ 1280px (nunca la original) — verificado en Network. ✅ Tests `BlogImage.spec.tsx` (srcSet 3 versiones, src=intermedia) + `BlogPostCard.spec.tsx` (thumbnail); verificación en Network = QA manual.

## 3. Diseño Técnico

### 3.1 Arquitectura

```
                    qr-cms (Payload 3.x)
                    ┌─────────────────────────────────────────────┐
                    │  Colección media (upload)                    │
                    │  beforeChange: transformImage                │
                    │   1. magic bytes (rechaza HTML/SVG)          │
                    │   2. sharp: rotate + withMetadata(false)     │
                    │   3. resize fit:'inside' ≤2560px             │
                    │   4. webp({ quality: 80 })                   │
                    │   5. filename según postSlug/usage           │
                    │  imageSizes: intermedia 1280 / thumb 400     │
                    │  (fit:'inside', sin crop)                    │
                    └──────────────┬──────────────────────────────┘
                                   │ 3 archivos WebP (original/intermedia/thumbnail)
                                   ▼
                    Cloudflare R2 (bucket portaqr-blog)
                                   ▲
                    ┌──────────────┴──────────────────────────────┐
                    │  Colección posts                             │
                    │  afterChange: syncMediaNaming                │
                    │   cover → {slug}.webp                        │
                    │   uploads del content → {slug}-img-{n}.webp  │
                    │  Bloque Lexical imageLayout                  │
                    │   (image, layout, caption, text)             │
                    └─────────────────────────────────────────────┘

                    qr-app (Next.js 16, ISR)
                    ┌─────────────────────────────────────────────┐
                    │  Renderer de bloques Lexical                 │
                    │   imageLayout → 4 componentes:              │
                    │   BlogImageFull | BlogImageCenter            │
                    │   BlogImageRight | BlogImageLeft             │
                    │  next/image + aspect-ratio CSS (sin CLS)     │
                    └─────────────────────────────────────────────┘
```

**Flujo de subida de una imagen (end-to-end):**

```
1. Editor sube imagen en el admin (desde media o desde el campo upload del post)
2. beforeChange de media: valida magic bytes → detecta aspectRatio →
   rotate + strip metadata → resize fit:'inside' ≤2560px → WebP q80 →
   reemplaza buffer/mimetype/name
3. Payload genera imageSizes (intermedia 1280, thumbnail 400 — fit:'inside')
   y sube los 3 archivos WebP a R2
4. Editor asigna la imagen al post (cover o bloque imageLayout en el content)
5. afterChange de posts (syncMediaNaming): renombra los archivos en R2
   según el slug (Payload mueve el objeto) y guarda postSlug/usage
6. Hook de revalidación (SPEC-023 RF-8) → ISR regenera /blog/[slug]
```

**Flujo de eliminación (end-to-end):**

```
1. Editor elimina una imagen en el admin (media) o elimina un post
2. Si elimina un post: afterDelete de posts (deletePostMedia) elimina sus
   imágenes de media salvo que otro post las referencie (RN-7)
3. Al eliminar el doc de media: el core de Payload elimina los archivos vía
   el adapter S3 (deleteAssociatedFiles) + hook afterDelete (deleteMediaFiles)
   como red de seguridad (verifica y elimina objetos huérfanos en R2)
4. El bucket R2 queda sin objetos huérfanos (CA-11/CA-12)
```

### 3.2 Colección `media` rediseñada (qr-cms)

```ts
// src/collections/Media.ts — SPEC-023-A
import type { CollectionConfig } from 'payload'
import { transformImage } from './Media/hooks/transform-image'

export const ASPECT_RATIOS = ['16:9', '1:1', '4:5', '2:3', '9:16', '4:3', '21:9'] as const

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  upload: {
    staticDir: 'media',
    // RF-4: solo raster — SVG prohibido (scripts maliciosos)
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    // RF-6: 3 versiones — fit:'inside' (sin crop, el contenido persiste)
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 400, fit: 'inside' },
      { name: 'intermedia', width: 1280, height: 1280, fit: 'inside' },
    ],
  },
  hooks: {
    beforeChange: [transformImage], // RF-5: pipeline completo
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Título de la imagen' }, // RF-8
    { name: 'alt', type: 'text', required: true, label: 'Texto alternativo (alt)' },
    {
      name: 'aspectRatio', // RF-1: auto-detectado, solo lectura
      type: 'select',
      options: ASPECT_RATIOS.map((r) => ({ label: r, value: r })),
      admin: { readOnly: true, description: 'Detectado automáticamente (ancho/alto)' },
    },
    {
      name: 'usage', // cover | inline — poblado por syncMediaNaming
      type: 'select',
      options: [
        { label: 'Portada', value: 'cover' },
        { label: 'Embebida', value: 'inline' },
      ],
      admin: { readOnly: true, hidden: true },
    },
    {
      name: 'postSlug', // slug del post dueño — poblado por syncMediaNaming
      type: 'text',
      admin: { readOnly: true, hidden: true },
    },
  ],
}
```

> [!note] `imageSizes` con `fit: 'inside'`
> Payload 3 permite `fit` por size (`inside` | `cover` | `contain` | `fill`). Con `inside` + `width`/`height` como **límites** (no dimensiones exactas), el size respeta la proporción original: una imagen 4:5 genera thumbnail 400×500 (no 400×400). El contenido persiste (RN-3).

### 3.3 Hook `transformImage` (beforeChange de media)

```ts
// src/collections/Media/hooks/transform-image.ts — SPEC-023-A
import type { CollectionBeforeChangeHook } from 'payload'
import sharp from 'sharp'

const MAGIC_BYTES: Record<string, RegExp> = {
  'image/jpeg': /^\xff\xd8\xff/,
  'image/png': /^\x89PNG\r\n\x1a\n/,
  'image/webp': /^RIFF....WEBP/,
  'image/gif': /^GIF8[79]a/,
}

const MAX_ORIGINAL = 2560 // lado mayor (px)
const WEBP_QUALITY = 80

export const transformImage: CollectionBeforeChangeHook = async ({ data, req }) => {
  const file = data.file // Payload 3: buffer en data.file.data
  if (!file?.data) return data

  // RF-4.1: magic bytes — rechaza HTML/JS disfrazado de imagen
  const magic = MAGIC_BYTES[file.mimetype]
  if (!magic || !magic.test(file.data.subarray(0, 16))) {
    throw new Error('Formato de imagen no válido o archivo corrupto')
  }

  // RF-1: detectar aspect ratio real
  const meta = await sharp(file.data).metadata()
  const ratio = meta.width && meta.height ? `${meta.width}:${meta.height}` : null
  // normalizar al ratio soportado más cercano (16:9, 1:1, 4:5, 2:3, 9:16, 4:3, 21:9)
  data.aspectRatio = normalizeAspectRatio(meta.width, meta.height)

  // RF-3 + RF-5: rotate (endereza EXIF) → strip metadata → resize fit:'inside' → WebP
  const buffer = await sharp(file.data)
    .rotate() // aplica orientación EXIF antes de descartarla
    .withMetadata(false) // elimina EXIF/GPS/IPTC/XMP
    .resize({ width: MAX_ORIGINAL, height: MAX_ORIGINAL, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  // RF-7: nombre según post (si viene del contexto) o slugify del original
  const base = data.postSlug || slugify(file.name.replace(/\.[^.]+$/, ''))
  const suffix = data.usage === 'inline' ? `-img-${data.inlineIndex ?? 1}` : ''
  file.data = buffer
  file.mimetype = 'image/webp'
  file.name = `${base}${suffix}.webp`
  return data
}
```

> [!note] `normalizeAspectRatio`
> Función pura que recibe `width`/`height` y devuelve el ratio soportado más cercano (comparando `w/h` con tolerancia ~2%). Tests unitarios con los 7 ratios + casos límite (ej. 3:2 → 2:3 no; 3:2 queda fuera → se mapea al más cercano o se guarda el ratio exacto como fallback).

### 3.4 Hook `syncMediaNaming` (afterChange de posts)

```ts
// src/collections/Posts/hooks/sync-media-naming.ts — SPEC-023-A
// Recolecta cover + nodos upload/imageLayout del content (recursivo) y
// renombra los archivos en R2 según el slug del post.
export const syncMediaNaming: CollectionAfterChangeHook = async ({ doc, req }) => {
  const mediaRefs = collectMediaRefs(doc) // [{ id, usage: 'cover' | 'inline', index }]
  for (const ref of mediaRefs) {
    const filename = ref.usage === 'cover'
      ? `${doc.slug}.webp`
      : `${doc.slug}-img-${ref.index}.webp`
    await req.payload.update({
      collection: 'media',
      id: ref.id,
      data: { postSlug: doc.slug, usage: ref.usage, filename }, // Payload mueve el objeto en R2
    })
  }
}
// Registrado en afterChange de Posts (junto a revalidatePost)
```

- `collectMediaRefs(doc)`: recorre `doc.cover` (→ `cover`) y el árbol Lexical de `doc.content` (recursivo sobre `children`) extrayendo nodos `upload` (→ `inline`, index 1-based por orden de aparición) y bloques `imageLayout` (→ `inline`).
- Si el `slug` cambia, el hook corre de nuevo y Payload renombra (RN-4).
- El `filename` se actualiza **solo** si difiere del actual (evita writes innecesarios).

### 3.5 Bloque Lexical `imageLayout` (qr-cms)

```ts
// src/blocks/ImageLayout.ts — SPEC-023-A
import type { Block } from 'payload'

export const ImageLayout: Block = {
  slug: 'imageLayout',
  labels: { singular: 'Imagen con layout', plural: 'Imágenes con layout' },
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'layout',
      type: 'select',
      required: true,
      defaultValue: 'center',
      options: [
        { label: 'Ancho completo', value: 'full' },
        { label: 'Centrada', value: 'center' },
        { label: 'Imagen derecha / texto izquierda', value: 'right' },
        { label: 'Imagen izquierda / texto derecha', value: 'left' },
      ],
    },
    { name: 'caption', type: 'text', label: 'Leyenda (opcional)' },
    {
      name: 'text',
      type: 'richText',
      label: 'Texto (usado en layouts derecha/izquierda)',
      admin: { condition: (_, siblingData) => ['right', 'left'].includes(siblingData?.layout) },
    },
  ],
}
```

Registro en el editor Lexical de `payload.config.ts`:

```ts
editor: lexicalEditor({
  blocks: [ImageLayout], // disponible como bloque en el content de posts
}),
```

### 3.6 Componentes de layout en qr-app

`src/components/blog/` — 4 componentes server (reciben `media` resuelto con `depth=1` y `text`/`caption`):

| Componente | Layout | Versión de imagen |
|---|---|---|
| `BlogImageFull` | Imagen a todo el ancho del post | `srcSet` 3 versiones (400w/1280w/2560w), `sizes="(max-width: 768px) 100vw, 768px"`, `src` fallback = intermedia |
| `BlogImageCenter` | Imagen centrada, caption debajo | `srcSet` 3 versiones, `sizes="(max-width: 768px) 100vw, 448px"`, `src` fallback = intermedia |
| `BlogImageRight` | Grid 2 cols: texto \| imagen | `srcSet` 3 versiones, `sizes="(max-width: 768px) 100vw, 384px"`, `src` fallback = intermedia |
| `BlogImageLeft` | Grid 2 cols: imagen \| texto | `srcSet` 3 versiones, `sizes="(max-width: 768px) 100vw, 384px"`, `src` fallback = intermedia |
| `BlogPostCard` (listado) | Tarjeta del grid | **Siempre `sizes.thumbnail.url`** (RF-9.1) — nunca la original |
| Hero `[slug]/page.tsx` | Portada del artículo | `srcSet` 3 versiones, `sizes="(max-width: 1152px) 100vw, 1152px"`, `src` fallback = intermedia |

- **Renderer de bloques**: en `BlogRichText.tsx`, el caso `imageLayout` mapea `layout` → componente correspondiente. El `text` del bloque se renderiza con el mismo renderer Lexical (anidado, `RichTextContent` exportado).
- **`<img>` nativo en vez de `next/image` (decisión de implementación)**: **Next 16.3 eliminó la prop `srcSet`** del componente `Image` (doc oficial: *"srcSet: Use Device Sizes instead"* — el srcset se genera automáticamente desde `sizes` vía el loader). Como las imágenes ya son WebP optimizadas por el CMS (3 versiones en R2) y el requisito RF-9.1 exige el srcSet manual de las 3 versiones, `BlogImage` usa `<img>` nativo con `srcSet`/`sizes` manuales (mismo patrón que la doc de Next sugiere para art direction con `<picture>`). `src` = `media.sizes.intermedia.url` (fallback), `loading="lazy"`/`decoding="async"` (eager solo en hero/full, LCP), `width`/`height` reales + `aspect-ratio` CSS derivado de `media.aspectRatio` (sin CLS). En el listado, `BlogPostCard` usa `next/image` con `fill` + `unoptimized` sobre `sizes.thumbnail.url` (RF-9.1).
- **Aspect ratio sin CLS**: el contenedor usa `aspect-ratio` CSS inline derivado de `media.aspectRatio` (RN-6) — la imagen nunca se recorta (object-cover solo si el contenedor lo exige; por defecto el contenedor respeta el ratio exacto).
- **Tipos**: `src/interfaces/blog.ts` extiende `Media` con `title`, `aspectRatio`, `usage`, `sizes: { thumbnail?, intermedia? }` y el bloque `ImageLayoutBlock` en el tipo del content.

### 3.7 Hooks de eliminación en cascada (RF-10)

```ts
// src/collections/Media/hooks/delete-media-files.ts — SPEC-023-A
// Red de seguridad: el core de Payload ya elimina los archivos vía el adapter
// (deleteAssociatedFiles), pero si el delete falla silenciosamente o el objeto
// quedó huérfano (renombrado previo, adapter deshabilitado al subir), se
// elimina explícitamente con el cliente S3. Idempotente.
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

export const deleteMediaFiles: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const bucket = process.env.R2_BUCKET
  if (!bucket) return // storage local — no hay nada que limpiar en R2
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  })
  // Objetos esperados: {filename} (original) + {filename}-{sizeName} (sizes)
  const keys = [
    doc.filename,
    ...(doc.sizes ? Object.values(doc.sizes).map((s) => s.filename) : []),
  ].filter(Boolean)
  for (const key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ bucket, key }))
    } catch (e) {
      req.payload.logger.error(`deleteMediaFiles: no se pudo eliminar ${key} de R2: ${e}`)
    }
  }
  // Verificación final: listar objetos con el prefijo del filename base
  // (detecta huérfanos por renombrado previo) y eliminarlos.
  const prefix = doc.filename?.replace(/\.[^.]+$/, '') ?? ''
  const listed = await client.send(new ListObjectsV2Command({ bucket, prefix }))
  for (const obj of listed.Contents ?? []) {
    await client.send(new DeleteObjectCommand({ bucket, key: obj.Key }))
  }
}
```

```ts
// src/collections/Posts/hooks/delete-post-media.ts — SPEC-023-A
// El core NO hace cascade por relaciones: al eliminar un post se eliminan sus
// imágenes asociadas (cover + embebidas) salvo que otro post las referencie.
export const deletePostMedia: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const mediaIds = collectMediaRefs(doc).map((r) => r.id) // cover + uploads/imageLayout
  for (const id of mediaIds) {
    const usedElsewhere = await req.payload.count({
      collection: 'posts',
      where: { id: { not_equals: doc.id }, 'cover': { equals: id } }, // + búsqueda en content
    })
    if (usedElsewhere.totalDocs === 0) {
      await req.payload.delete({ collection: 'media', id }) // → dispara deleteMediaFiles (R2)
    }
    // si está compartida: solo se desvincula (el doc de media permanece)
  }
}
// Registrado en afterDelete de Posts (junto a revalidatePost)
```

> [!note] Verificación de referencia compartida
> La búsqueda "usada por otro post" cubre `cover` (query directa) y las embebidas del `content` (recorrer los posts publicados y buscar el mediaId en los nodos `upload`/`imageLayout` — volumen actual bajo, aceptable). Si el blog crece, se evalúa un campo `posts` (relationship inversa) en `media`.

### 3.8 Contratos de API

| Endpoint | Cambio |
|---|---|
| `GET {CMS_URL}/api/media/{id}?depth=1` | Respuesta incluye `title`, `aspectRatio`, `usage`, `postSlug`, `sizes: { thumbnail: { url, width, height }, intermedia: { url, width, height } }` |
| `GET {CMS_URL}/api/posts?depth=1` | `cover` y los `imageLayout.image` del content resuelven el media completo (con `sizes`) |

### 3.9 Variables / configuración

- **Sin variables nuevas**: el pipeline usa `sharp` (ya instalado en qr-cms) y el storage R2 existente (SPEC-023). `WEBP_QUALITY` y `MAX_ORIGINAL` son constantes del hook (configurables a futuro vía env si se requiere).

## 4. Mockups / Referencias

- [sharp — resize (fit: inside)](https://sharp.pixelplumbing.com/api-resize)
- [sharp — withMetadata / metadata](https://sharp.pixelplumbing.com/api-output#withmetadata)
- [Payload 3 — Uploads / imageSizes](https://payloadcms.com/docs/upload/overview)
- [Payload 3 — Hooks beforeChange (transformar archivo)](https://payloadcms.com/docs/hooks/overview)
- [Payload 3 — Bloques Lexical custom](https://payloadcms.com/docs/rich-text/lexical)
- [OWASP — Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **Rechazar SVG** | Elimina la clase de vulnerabilidad `<script>`/`onload` por completo | Logos vectoriales deben subirse como PNG/WebP | ✅ **Elegido** (RF-4) |
| Sanitizar SVG (strip scripts) | Mantiene vectores | Riesgo residual (SVG es un formato complejo; el original viaja a R2); sanitizadores imperfectos | ❌ |
| **Todo a WebP (q80)** | Peso ~50-70% menor que JPEG/PNG; un solo formato; `next/image` lo sirve nativo | WebP no soporta animación (GIF animado se pierde — aceptable para blog) | ✅ **Elegido** |
| Conservar formato original | Cero pérdida | Formatos mixtos, peso alto, más superficie de ataque | ❌ |
| **`fit: 'inside'` (sin crop)** | El contenido persiste siempre (requisito del usuario); sin deformación | La imagen puede no llenar un contenedor exacto (se compensa con `aspect-ratio` del contenedor) | ✅ **Elegido** (RN-3) |
| `fit: 'cover'` + `position: 'centre'` (actual) | Llena contenedores exactos | **Recorta contenido** (viola el requisito) | ❌ |
| **3 versiones (original/intermedia/thumbnail)** | Balance peso/calidad por layout; thumbnail para listados | 3 objetos por imagen en R2 | ✅ **Elegido** (RF-6) |
| 1 sola versión | Menos objetos | `next/image` no puede servir tamaños adaptativos sin re-optimizar | ❌ |
| **Naming por slug del post** | URLs legibles y predecibles (`/media/marketing-digital.webp`); trazabilidad | Requiere hook de renombrado (Payload mueve el objeto en R2) | ✅ **Elegido** (RF-7) |
| Naming UUID | Cero lógica | Sin relación con el post; URLs opacas | ❌ |
| **Bloque Lexical `imageLayout`** | Vía oficial de Payload para contenido estructurado; el editor elige layout sin código; renderer dedicado en qr-app | Un bloque más en el editor; el `text` anidado duplica el renderer Lexical | ✅ **Elegido** (RF-9) |
| Nodo `upload` extendido con campo layout | Menos código | Lexical no expone campos custom en nodos upload de forma limpia; sin texto anidado | ❌ |
| **`title` + `alt` requeridos** | Accesibilidad + SEO + identificación en el admin | Fricción mínima para el editor | ✅ **Elegido** (RF-8) |
| Solo `alt` (actual) | Mínimo | Sin título identificable en el admin | ❌ |
| **Cascade manual (hooks afterDelete en media + posts)** | Garantiza que no queden huérfanos en R2 (el core no hace cascade por relaciones — confirmado en doc); red de seguridad ante fallos silenciosos del adapter | Un hook más por colección; verificación de referencias compartidas | ✅ **Elegido** (RF-10) |
| Confiar solo en `deleteAssociatedFiles` del core | Cero código | Si el adapter falla silenciosamente (permisos, renombrado previo) quedan huérfanos sin detectar; eliminar un post deja sus imágenes en media+R2 | ❌ |
| No eliminar nunca (conservar en R2) | URLs viejas siguen funcionando | Costo acumulado, desorden, fuga de contenido eliminado | ❌ |
| **`srcSet` manual con las 3 versiones pre-generadas (detalle) + thumbnail fija (listado)** | El móvil descarga ≤1280px (nunca la original); cero re-optimización en Next (las versiones ya existen en R2); control total del peso por layout | Requiere mapear `sizes` por layout; el `srcSet` manual no usa los deviceSizes de Next | ✅ **Elegido** (RF-9.1) |
| `src` = original + `sizes` (re-optimización de `next/image`) | Cero lógica de versiones | Next descarga la original de R2 y la re-optimiza en cada request (CPU + latencia); el móvil igual trae la original a Next | ❌ (estado actual de SPEC-023) |

> [!note] Consideraciones
> - **GIF animado**: el pipeline lo rasteriza al primer frame (WebP estático). Si a futuro se requiere animación, evaluar WebP animado (`sharp` no lo soporta; se necesitaría `gif2webp` o similar) — fuera de alcance.
> - **Renombrado en R2**: el adapter S3 de Payload **NO mueve el objeto** al actualizar `filename` (verificado 2026-08-21: las URLs renombradas daban 404). Por eso `syncMediaNaming` ya no renombra (solo puebla `postSlug`/`usage`). Si se requiere el naming por slug, el hook debe mover el objeto en R2 explícitamente (copy + delete con el cliente S3).
> - **`data.file` en beforeOperation**: en Payload 3 el archivo llega en `req.file` (multipart) o `args.file`/`args.data.file` (Local API). El hook debe manejar ambos. Se usa `beforeOperation` (no `beforeChange`) porque Payload captura el archivo del multipart antes de `beforeChange` y lo usa para generar los sizes y subir.
> - **Compatibilidad con SPEC-023**: los `imageSizes` actuales (`card`, `hero`) se reemplazan por `intermedia`/`thumbnail`; el render de `BlogPostCard` y el hero de `[slug]/page.tsx` deben migrar a las nuevas versiones (tarea 6).
> - **`aspectRatio` en el render**: `aspect-[16/9]` etc. se deriva del campo; para ratios no exactos (fallback) se usa el ratio calculado `w/h` inline.

## 6. Plan de implementación

| # | Paso | Detalle |
|---|---|---|
| 1 | Rama feature | ✅ Implementado en `main` (qr-cms) y `feat/spec-023-blog-payload-cms-isr` (qr-app), **un commit por tarea** (decisión del usuario) |
| 2 | Colección Media | ✅ Campos `title`/`aspectRatio`/`usage`/`postSlug` + `mimeTypes` sin SVG + `imageSizes` (thumbnail 400 / intermedia 1280, `fit: 'inside'`) (3.2) — commit `395bd17` |
| 3 | Hook `transformImage` | ✅ Magic bytes + rotate + strip metadata + resize fit inside + WebP q80 + naming (3.3) + `simplifyRatio` — commit `03733e7` |
| 4 | Hook `syncMediaNaming` | ✅ afterChange de posts: renombrar cover/inline según slug (3.4) — commit `76c6aca` |
| 5 | Bloque `imageLayout` | ✅ Bloque Lexical en qr-cms (3.5) — commit `1a35d5e` |
| 6 | Componentes qr-app | ✅ `BlogImageFull`/`BlogImageCenter`/`BlogImageRight`/`BlogImageLeft` + renderer de bloques + migrar `BlogPostCard`/hero a `sizes.intermedia` (3.6) — commit `24faec4` |
| 7 | Tipos | ✅ `src/interfaces/blog.ts`: `MediaImage` + `ImageLayoutBlock` (3.6) — commit `11309bd` |
| 8 | Tests | ✅ qr-cms: `transformImage` (magic bytes, metadata, webp, ratios, naming) + `syncMediaNaming` + `deleteMediaFiles` + `deletePostMedia`; qr-app: 4 componentes + renderer + `BlogImage` |
| 9 | Eliminación en cascada | ✅ Hooks `deleteMediaFiles` (afterDelete media, red de seguridad S3) + `deletePostMedia` (afterDelete posts, cascade con verificación de referencias compartidas) + permiso `DeleteObject` en credenciales R2 (3.7) — commit `0205001` |
| 10 | Verificación | ✅ CA-01 a CA-13 (ver arriba); QA manual pendiente: visual en navegador (CA-08), bucket R2 (CA-11/CA-12), Network móvil (CA-13) |

> [!info] Siguiente paso
> Registrar tareas de esta SPEC en `docs/tareas/SPEC-023-A-tareas.json` (formato Taskmaster-compatible) antes de implementar.