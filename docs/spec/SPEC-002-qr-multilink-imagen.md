---
title: "SPEC-002: Imagen de portada para QR Multilink (Cloudflare R2)"
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
status: implementado
aliases:
  - SPEC-002
  - Imagen QR Multilink
  - Portada Multilink R2
---

# SPEC-002: Imagen de portada para QR Multilink (Cloudflare R2)

> [!abstract] Decisión clave
> Agregar un campo **`listImageUrl`** a `QrData` (exclusivo del `typeQr: 'list'`) que almacena la **URL pública** de una imagen de portada/logo. El navegador sube el archivo al backend (**multipart/form-data**); el backend lo **sanitiza y re-encodea a WebP** con `sharp` (sin EXIF, sin scripts embebidos, redimensionado a máx. 512×512px) y lo sube a **Cloudflare R2**. Solo la URL pública final se persiste en MongoDB. La imagen se muestra únicamente en la página pública **`portaqr.cl/qr/{idQr}`** (componente `UrlList`) por encima del `name`. **No hay miniatura en el dashboard** (decisión 2026-08-07).

> [!info] Metadatos
> - **Estado:** Implementado
> - **Fecha:** 2026-08-07
> - **Autor:** Equipo Plataforma QR
> - **Componentes afectados:** `backend-portaqr/` (puerto 3004 en docker-compose; el `.env.example` declara 3001), `qr-app/` (puerto 3000)
> - **Alcance:** Solo QR tipo `list` (multilink). No aplica a `dynamic`, `static`, `whatsapp`, `email`, `call`, `wifi`, `texto`, `vcard`, `pet`, `phone`, `map`.
> - **Página pública destino:** `https://portaqr.cl/qr/{idQr}` (ej. `https://portaqr.cl/qr/89302960-7799-43fe-b5a0-45d2295d539f`).
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]], [[SPEC-003-auditoria-dependencias-qr-app]]
>
> [!warning] Impacto de SPEC-003 (implementada 2026-08-07)
> Tras SPEC-003 el frontend usa **JWT directo con cookies httpOnly + `jose`** (sin next-auth): el navegador **no tiene el token**, por lo que **toda llamada autenticada debe pasar por una API route del frontend** (`/api/*`) que lee la cookie y reenvía al backend con `Authorization: Bearer`. El endpoint de subida de imagen se expone como `POST /api/qr/list-image` (frontend) → `POST /qr/list-image` (backend). Además `backend-portaqr` corre en el puerto **3004** en docker-compose (las API routes usan `NEXT_PUBLIC_BFF_URL || 'http://localhost:3001'`).

---

## 1. Objetivo

Permitir que cada QR **multilink** (`typeQr: 'list'`) tenga **una sola imagen de portada** (logo, foto de perfil, banner o avatar de marca) — además del `name` textual ya existente — que se muestra en la landing pública del QR (`portaqr.cl/qr/{idQr}`). **El dashboard no muestra miniatura** (decisión 2026-08-07).

> [!info] Cardinalidad: una imagen por QR
> Cada QR multilink puede tener **exactamente 0 o 1 imagen** de portada persistida en `data.listImageUrl`. No se soporta múltiple imágenes ni galería. Reemplazar la imagen sobrescribe el mismo objeto R2 (mismo `key`, ver RF-11). Eliminar la imagen la borra de R2 y setea el campo en `null`.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-002 |
| --- | --- | --- |
| Identidad visual del QR multilink | Solo nombre textual | Nombre + imagen de portada |
| Hosting de imágenes | Inexistente (no se almacena nada en BD de imágenes) | Cloudflare R2 (CDN, escala, coste bajo) |
| Acoplamiento backend-archivo | n/a | Backend No almacena binarios — solo la URL pública |
| Tamaño de BD MongoDB | sin cambio | sin cambio (solo un string por QR) |

### 1.2 Out of scope (no incluido en este spec)

- Imágenes para otros tipos de QR (`vcard`, `pet`, `dynamic`, etc.).
- Editor visual/recorte de la imagen en el navegador (crop/rotate).
- Galería nihistorial de versiones de imágenes.
- Optimización responsive automática via Image Resizing de Cloudflare (se evalúa como mejora futura, §11).
- Watermarking ni moderación automática de contenido.

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

#### Modelo de datos

- **RF-1**. Agregar el campo **`listImageUrl: string | null`** al subobjeto `data` del QR (junto a `urlList`), **solo cuando `typeQr === 'list'`**. Es **opcional** (`null` si no se sube imagen). No confundir con el campo a nivel del `Qr` raíz.
  > [!note] Ubicación del campo
  > El campo se modela **a nivel del `QrData`** (junto a `urlList`, no dentro de cada item de la lista). Se llama **`listImageUrl` en runtime y en Mongo** (mismo nombre en entity, DTOs, schema y tipos del frontend — ver ADR-002.1 §3.1).
- **RF-2**. El campo almacena la **URL pública** (`https://...`) devuelta por Cloudflare R2 tras la subida. No se almacena el binario en MongoDB.
- **RF-3**. El campo es **mutable**: se puede subir, cambiar y eliminar (setear `null`) en cualquier momento vía `PATCH /qr?id=`.
- **RF-4**. El `validator` actual del schema (que exige exclusividad por `typeQr`) **no debe rechazar** la presencia de `listImageUrl`. Solo se valida que si `typeQr !== 'list'`, el campo se ignore (no se persiste aunque venga en el payload).

#### Formatos y límites de entrada

- **RF-5**. El frontend permitirá al usuario seleccionar una imagen desde su dispositivo (input `file`, `accept` amplio). **Formatos de entrada aceptados**: JPG, PNG, WebP, HEIC, AVIF, GIF (primer frame), BMP. **La salida es SIEMPRE WebP** (ver RF-9): el formato original solo sirve como fuente de decodificación.
  - > [!note] HEIC en iOS
  > Safari móvil (iOS) reporta `.heic` como `image/heic`. El backend `sharp` actual (precompilado en npm) **no** soporta HEIC por defecto → rechazar con `415 Unsupported Media Type` y pedir JPG/PNG al usuario. Documentar como limitación. Futuro: integrar `heic-convert` o build de sharp con libheif (ver §11.7).
  - AVIF: `sharp` precompilado sí decodifica AVIF (libvips).
  - GIF: solo se codifica el primer frame (se descarta la animación).
  - **SVG queda EXCLUIDO** (riesgo de scripts embebidos): el backend nunca lo acepta.
- **RF-6**. Tamaño máximo de archivo de **entrada**: **5 MB** (validado en frontend antes de subir y revalidado en backend via `limits.fileSize` de multer). Si excede → `413 Payload Too Large`. Justificación: el límite cubre fotos típicas de celular (JPG/HEIC de 12 MP ≈ 2–5 MB); el archivo **final** procesado queda ≤ 512×512 px en WebP (~≤ 80 KB), por lo que el tamaño de entrada solo protege la **red/banda ancha del backend** durante la subida multipart (el procesamiento ocurre en el backend, no en el navegador).

#### Procesamiento en backend (sanitización + optimización)

> [!important] Principio de seguridad
> El backend **no confía en el binario** que recibe. Lo decodifica con `sharp`, descarta todos los metadatos, y re-encodea a WebP. Como resultado:
> - **EXIF / IPTC / XMP** eliminados (GPS, cámara, autor, etc.).
> - **Scripts embebidos** (SVG con `<script>`, payloads XSS en comentarios JPEG, polyglot GIF/JS) eliminados — `sharp` solo re-encodea los píxeles decodificados, no propaga contenido no-pixel.
> - **Pixels inválidos / corruptos** → `sharp` lanza error → endpoint responde `422 Unprocessable Image`.

- **RF-7**. La imagen se procesa con `sharp` en backend, ejecutando este pipeline canónico:

  ```ts
  await sharp(buffer)
    .resize({
      width: 512,                // ancho máximo
      height: 512,               // alto máximo
      fit: 'inside',             // mantiene aspect ratio, no recorta
      withoutEnlargement: true,  // no escala hacia arriba si original < 512
    })
    .webp({
      quality: 82,               // balance calidad/peso típico
      effort: 4,                 // esfuerzo de compresión (0-6, default 4)
      smartSubsample: true,
    })
    .toBuffer();
  ```

  > [!success] Rotación: decisión tomada (2026-08-07)
  > **No se aplica NINGUNA rotación** — ni `rotate()` (auto-orient EXIF) ni ángulos manuales. Solo se redimensiona. Consecuencia aceptada por el usuario: fotos de móvil con orientación EXIF ≠ 1 pueden verse giradas en la landing ("se redimensiona, no se rota").

- **RF-8**. **Dimensiones máximas de salida**: 512×512 px (`fit: 'inside'`). Mantener **aspect ratio** (no recortar). Justificación:
  - La página pública `portaqr.cl/qr/{idQr}` muestra la imagen con un ancho máximo renderizado de **512px** (definido en RF-19).
  - Subir una imagen más grande solo engorda el WebP sin ganancia visual en el destino.
  - Con `withoutEnlargement: true`, si el usuario sube una imagen < 512px no se escala hacia arriba (se conserva tal cual, solo re-encodeada a WebP).
  - Peso resultante típico: ≤ 80 KB a calidad 82 (vs. ~150 KB a 1024px). Importante en 3G/móvil.
  - Futura variante `srcset` para alta densidad (DPR 2–3) en §11.6.
- **RF-9**. **Formato de salida siempre WebP** (calidad 82, `smartSubsample`). Se descarta el formato original. El objeto R2 resultante tiene siempre extensión `.webp` y `Content-Type: image/webp`.
- **RF-10**. La imagen procesada (WebP) se sube al bucket R2 **desde el backend** con `PutObjectCommand` (SDK S3). **El objeto R2 NO se hace público hasta después de la subida exitosa**: si `PutObjectCommand` falla, el endpoint responde error y **no se persiste nada** en MongoDB (no queda URL huérfana apuntando a un objeto inexistente).
- **RF-11**. El nombre del objeto en R2 sigue el patrón:
  `qr-multilink/{idQr}.webp`
  - `qr-multilink/`: **carpeta/prefijo** dedicada a las imágenes de portada de QRs multilink. Aísla este tipo de asset de futuros uploads (otros features usarán otros prefijos como `vcard-photos/`, `pet-photos/`, `banners/`, etc. — ver §11.5).
  - `{idQr}`: UUID v4 del QR. **Único por QR**: al cambiar la imagen se sobrescribe el mismo objeto (mismo `key`), lo que simplifica identificación y auditoría. No hay archivos huérfanos con timestamps.
  - Extensión siempre `.webp`.

  > [!note] Sobrescritura y auditoría
  > Al sobrescribir el objeto (mismo `key`) no se acumulan versiones huérfanas en el bucket. La auditoría se logra por (a) el `idQr` en el nombre y (b) logs del backend (`r2_object_put` con `{ idQr, userId, size }`). No se guardan versiones previas (out of scope, ver §11).
  >
  > Si se necesita diferenciar entre QRs eliminados y re-creados con mismo UUID (caso muy improbable, los UUID son únicos), el `DeleteObjectCommand` al eliminar la imagen (RF-14) asegura que no quede un objeto para un QR sin imagen.

#### Flujo de subida y persistencia

- **RF-12**. La subida se hace **vía backend** (multipart/form-data). Cadena completa:
  1. Frontend: validación cliente (tipo/tamaño ≤5MB). Genera preview local con `URL.createObjectURL`.
  2. Frontend: `POST /api/qr/list-image` (API route del frontend, lee cookie httpOnly y reenvía) → `POST /qr/list-image` (backend) con `multipart/form-data` (campo `idQr` en form-text, campo `file` en form-file).
  3. Backend: `@UseInterceptors(FileInterceptor)` de `@nestjs/platform-express` + `multer` con `limits.fileSize: 5MB`, `storage: memoryStorage()` (no toca disco), `fileFilter` con allowlist de MIME types (RF-5).
  4. Backend: verificar owner (JWT) + `typeQr === 'list'` del QR identificado por `idQr`.
  5. Backend: pipeline `sharp` (RF-7) genera buffer WebP sanitizado.
  6. Backend: `PutObjectCommand` a R2 con `ContentType: 'image/webp'` (RF-10).
  7. Backend: `PATCH` interno a MongoDB → `data.listImageUrl = <publicUrl>`.
  8. Backend responde `200 { listImageUrl, size, width, height }`.
  9. Frontend actualiza estado y preview.

  > [!success] Por qué multipart vía backend y NO presigned URL directa (decisión confirmada 2026-08-07)
  > Si el browser subiera directo a R2, el backend nunca vería el binario y **no podría sanitizar ni re-encodear a WebP** (el requisito central de este spec: eliminar EXIF/scripts embebidos y garantizar salida WebP ≤512px). El backend **debe** recibir el binario para procesarlo con `sharp`. Trade-off aceptado: el backend consume memoria/banda durante la subida; se mitiga con `memoryStorage` + `limits.fileSize: 5MB` + `fileFilter`. El ADR-002.2 (§3.2) fue revisado en consecuencia (la decisión original de presigned quedó obsoleta).

- **RF-13**. La URL pública `listImageUrl` se compone de `CLOUDFLARE_R2_PUBLIC_URL` + key (ver RF-11).
- **RF-14**. Eliminación de imagen: al hacer `PATCH /api/qr?id={idQr}` (frontend) → `PATCH /qr/{idQr}` (backend) con `data.listImageUrl: null`, el backend:
  - **Borra el objeto R2 anterior** (si había URL no nula) vía `DeleteObjectCommand` — la imagen se elimina también del storage, no solo de MongoDB.
  - Persiste `null` en `data.listImageUrl` en MongoDB.
  - Si `DeleteObjectCommand` falla (red, no existe, etc.), se registra `ERROR` log (`r2_failed_delete`) pero **no aborta** el `PATCH` (la URL queda `null` en Mongo y el objeto R2 queda huérfano — lifecycle rule §6.4 lo limpiará).
- **RF-15**. Reemplazo de imagen: el endpoint `POST /qr/list-image` (vía `/api/qr/list-image`) puede invocarse nuevamente con un nuevo `file`; retorna nueva `listImageUrl` (sobrescribe el mismo objeto R2, mismo `key`). El `UpdateQrUseCase` (o el controller) al recibir `PATCH` con `listImageUrl` distinto al actual, borra el objeto R2 anterior de forma **mejor esfuerzo** (log si falla, no abortar).

#### UI /UX

- **RF-16**. **Crear QR multilink** (`CreateQrForm.tsx` → `ListUrlForm.tsx`): un nuevo bloque "Imagen de portada (opcional)" permite:
  - Arrastrar/seleccionar archivo.
  - Previsualizar la imagen (original) antes de crear el QR.
  - Eliminar la selección (queda sin imagen).
  - El `name` textual sigue siendo opcional; uno no reemplaza al otro.
- **RF-17**. **Editar QR multilink** (`/dashboard/qr/edit/[id]`): mismo bloque, pero muestra la imagen WebP actualmente persistida. Permite cambiarla o quitarla (vía `PATCH /api/qr?id=` → `PATCH /qr/{id}` con `listImageUrl: null`).
- **RF-19**. **Página pública** (`https://portaqr.cl/qr/{idQr}` → `UrlList.tsx`): si `qrData.listImageUrl` existe, renderizar `<img>` centrada entre el `nameData` y la lista de enlaces. Dimensiones: **`w-[80%]` del ancho del contenedor** (decisión 2026-08-07: imagen ≠ ancho del botón, centrada, ocupando el 80% de su padre), `h-auto` (alto proporcional), `rounded-lg`. No reemplaza el `nameData`.
  - > [!note] Optimización móvil
  > El `srcset` y `sizes` no se usan en esta iteración (una sola variante WebP de ≤512px). Para móviles típicos (DPR 2, viewport 375–430px) una imagen ≤80 KB carga bien en 3G. Futura mejora en §11.6.
- **RF-20**. La página pública debe cargar la imagen con `loading="lazy"`, `decoding="async"`, y placeholder gris. **Si la imagen NO carga por cualquier motivo (404/403, error de red, formato corrupto), se oculta por completo sin fallback ni icono de archivo roto**: el bloque `<img>` y su contenedor se desmontan (estado `imageError` en `onError`), sin alt visible ni espacio reservado — la página queda **visualmente idéntica a un QR sin imagen configurada**. No se muestra ninguna imagen de reemplazo.

### 2.2 Criterios de aceptación (CA)

- **CA-01**. Un usuario autenticado puede crear un QR `list` SIN imagen y el flujo funciona exactamente igual que hoy (sin regresión).
- **CA-02**. Un usuario autenticado puede crear un QR `list` CON imagen: la imagen se sube a R2, la URL queda persistida en `data.listImageUrl`, y la página pública `/qr/[id]` muestra la imagen entre el `nameData` y la lista.
- **CA-03**. El usuario puede editar un QR `list` existente y cambiar la imagen: una nueva subida reemplaza el valor de `listImageUrl` (y opcionalmente borra el objeto R2 anterior).
- **CA-04**. El usuario puede eliminar la imagen de un QR `list` existente: el `PATCH` con `listImageUrl: null` limpia el campo en MongoDB **y borra el objeto correspondiente del bucket R2** (verificar `DeleteObjectCommand` fue invocado con el `key` correcto). La página pública ya no muestra imagen y la URL R2 devuelve `404` tras el borrado.
- **CA-05**. El dashboard NO muestra miniatura para QRs `list` (decisión 2026-08-07) — el layout de la tarjeta queda sin cambios.
- **CA-06**. Un usuario NO propietario del QR recibe `403` al llamar `POST /qr/list-image` para un `idQr` ajeno.
- **CA-07**. Intentar subir un archivo de tamaño > 5 MB recibe `413 Payload Too Large` (frontend en UI; backend en multer `limits.fileSize`) antes de tocar R2. Un archivo con formato no soportado (p. ej. `.svg`) recibe `415 Unsupported Media Type`.
- **CA-08**. Un binario que `sharp` no puede decodificar (archivo corrupto o falseado) recibe `422 Unprocessable Image` y **no se persiste ni se sube nada** a R2.
- **CA-09**. La validación del schema (exclusividad por `typeQr`) sigue pasando: `listImageUrl` solo se persiste si `typeQr === 'list'`; se ignora para cualquier otro tipo.
- **CA-10**. La página pública renderiza sin romperse cuando `listImageUrl` apunta a un objeto eliminado o corrupto (404/403/formato inválido): la imagen **se oculta por completo, sin fallback, sin icono de archivo roto ni espacio reservado** — la página queda idéntica a un QR sin imagen configurada.

---

## 3. Decisiones de diseño (con ADR embebido)

### 3.1 ADR-002.1 — Naming y ubicación del campo

> [!question] Contexto
> El schema tiene `QrData` con `urlList?: Array<{...}>` y `typeQr: 'list'` (el tipo multilink). El usuario ya tiene `name?: string` a nivel raíz del QR. Dónde poner el campo imagen nuevo?

> [!tip] Alternativas consideradas
> - **A)** Campo `image?: string` a nivel raíz del `Qr` (junto a `name`). Pros: aplica a todos los tipos futuramente. Contras: scope más amplio del pedido; rompe el "solo multilink".
> - **B)** Campo `imageUrl: string` dentro de cada item de `urlList[]`. Contras: no es "imagen de la lista", sino imagen de cada enlace — diferente semántica.
> - **C)** Campo `listImageUrl?: string` a nivel del `QrData` (junto a `urlList`, no dentro del array). Pros: semánticamente "imagen que acompaña a la lista", respeta scope multilink exclusivo, no afecta otros tipos. ✅

> [!success] Decisión
> **Alternativa C**. Campo `listImageUrl?: string` en `QrData`. En el schema de Mongo se persiste con el mismo nombre (`listImageUrl`). El validador de exclusividad por `typeQr` se extiende para aceptar `listImageUrl` solo cuando `typeQr === 'list'`; los demás tipos lo ignoran (se setea a `undefined` antes de persistir).

> [!warning] Nota sobre `name` existente
> El QR raíz ya tiene `name?: string` y la página pública ya lo muestra como `nameData` (`UrlList.tsx:275-278`). **No se elimina ni se mueve**. La imagen es **complementaria** al nombre, no lo reemplaza.

### 3.2 ADR-002.2 — Estrategia de subida (Backend multipart con `sharp`)

> [!important] Revisión 2026-08-07 — decisión corregida
> La versión original de este ADR decidía **presigned URL directa** (opción B). **Queda OBSOLETA y se revierte**: el requisito central del feature es que el backend **sanitice y re-encodee a WebP** con `sharp` (eliminar EXIF/scripts embebidos, garantizar salida WebP ≤512px). Con presigned directa el backend nunca ve el binario y ese requisito es imposible. **Decisión final: opción A (multipart vía backend)** — coherente con el abstract y RF-5..RF-12.

> [!question] Contexto
> ¿Cómo subir imágenes a Cloudflare R2? Backend recibe binario (multipart + multer + sharp) vs. frontend sube directo con presigned URL.

> [!tip] Alternativas consideradas
>
> | Criterio | A) Backend multer (multipart) ✅ | B) Presigned URL directa |
> | --- | --- | --- |
> | Sanitización con `sharp` (EXIF, scripts, re-encode WebP) | ✅ **Sí — requisito central del spec** | ❌ No (backend nunca ve el binario) |
> | Salida garantizada WebP ≤512px | ✅ Sí | ❌ No (se sube el original) |
> | Dependencias | `@nestjs/platform-express` + `multer` ya disponibles + `sharp` (nueva) | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
> | Latencia del backend | +procesamiento y subida a R2 desde el server | Mínima (solo firmar) |
> | Concurrencia/escalabilidad | Limitada por tamaño proceso Nest | Ilimitada (R2 absorbe) |
> | Costos de egress en backend | Sí (subida entra a Nest, sale a R2) | No (subida directa al CDN edge) |
> | Complejidad Frontend | Baja (FormData) | Media (PUT con `fetch`/`XHR` + progreso) |
> | Validación de tamaño/tipo | Centralizada en Nest (multer + sharp decodifica el binario real) | Repartida: pre-valida en FE, R2 rechaza si Content-Length/Type no cuadran |
> | Trazabilidad | Backend ve todo el binario (logs de auditoría) | Backend solo ve metadata del presign |
> | Apropiado para imágenes | Sí si backend tiene banda ancha | Sí, estándar de la industria, pero sacrifica sanitización |

> [!success] Decisión
> **Alternativa A: Backend multipart (multer + `sharp`)**. Razones:
> 1. **Sanitización obligatoria**: el backend decodifica el binario con `sharp`, descarta metadatos (EXIF/IPTC/XMP) y re-encodea a WebP. Con presigned directa este requisito es técnicamente imposible (el backend nunca toca el binario).
> 2. **Formato único de salida**: WebP ≤512px garantizado por el pipeline (RF-7..RF-9), sin depender de lo que suba el usuario.
> 3. **Validación real del contenido**: `sharp` falla al decodificar binarios corruptos o falseados (magic bytes) → `422`. Con presigned, solo se validaba el `Content-Type` del header (falseable).
> 4. **Dependencias mínimas**: `@nestjs/platform-express` + `multer` ya están en `backend-portaqr`; solo hay que instalar `sharp`.
> 5. Alinea al backend con el principio "thin API" del SPEC-001, delegando el procesamiento al pipeline sharp (infraestructura).

> [!warning] Trade-off aceptado
> El backend consume **memoria y banda ancha** durante la subida (multipart → `memoryStorage`). Mitigaciones: `limits.fileSize: 5MB` (RF-6), `fileFilter` con allowlist de MIME (RF-5), y como mejora futura procesamiento streaming/offloading (§11.8). Costos de egress: la subida entra al server y sale a R2 — aceptado por el beneficio de sanitización.

### 3.3 ADR-002.3 — SDK y contrato S3-compatible de R2

> [!info] Cloudflare R2
> R2 expone API compatible con S3. Se usa `@aws-sdk/client-s3` configurado con `region: 'auto'` y `endpoint: <CLOUDFLARE_R2_ENDPOINT>`. Las credenciales son `CLOUDFLARE_R2_ACCESS_KEY_ID` + `CLOUDFLARE_R2_SECRET_ACCESS_KEY` (token de API de R2, no IAM de AWS).

> [!success] Configuración
> ```ts
> const r2 = new S3Client({
>   region: 'auto',
>   endpoint: process.env.CLOUDFLARE_R2_ENDPOINT, // https://<account_id>.r2.cloudflarestorage.com
>   credentials: {
>     accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
>     secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
>   },
> });
> ```

---

## 4. Cambios por capa

### 4.1 Backend — `backend-portaqr/`

> [!note] Estructura hexagonal
> SPEC-001 ya aisló el dominio en `domain/`, `application/`, `infrastructure/`, `presentation/`. Este spec respeta esa segmentación.

#### 4.1.1 Dominio — `domain/entities/qr.entity.ts`

```ts
export interface QrData {
  // ...campos actuales...
  urlList?: QrUrlListItem[];
  listImageUrl?: string | null;  // ⬅ NUEVO
  typeQr: string;
}
```

#### 4.1.2 DTOs

**`application/dto/create-qr.dto.ts`** — dentro de la clase `QrData`:

```ts
@ValidateIf((o) => o.typeQr === 'list')
@IsOptional()
@IsUrl({}, { message: 'La URL de la imagen debe ser válida' })
listImageUrl?: string | null;
```

**`application/dto/update-qr.dto.ts`** — ampliación para aceptar patch parcial de `listImageUrl` (merge con `PartialType(CreateQrDto)` ya existente — `UpdateQrDto extends PartialType(CreateQrDto)`; verificar que `@IsOptional` no chille con `null`).

#### 4.1.3 Schema Mongoose — `infrastructure/repository/mongo/schemas/qr.schema.ts`

```ts
urlList: { /* actual */ },
listImageUrl: { type: String, required: false, default: null },  // ⬅ NUEVO
```

> [!note] Tipos TS del schema
> Además del `validator`, actualizar el **tipo TS declarado** de la propiedad `data` en `QrSchema` (líneas ~193-242 de `qr.schema.ts`) agregando `listImageUrl?: string | null`, para que el tipado no rompa.

Actualizar el `validate.validator` del `data` para aceptar `listImageUrl` en `case 'list'` (sin romper la exclusividad de los demás campos). **Aprovechar para corregir el bug preexistente**: el `case 'list'` actual no excluye `mapUrl` (falta `!value.mapUrl`):

```ts
case 'list':
  return value.urlList
    && !value.url && !value.whatsappUrl && !value.emailUrl && !value.phoneUrl
    && !value.wifiData && !value.text && !value.vcardData && !value.petData
    && !value.mapUrl;
  // listImageUrl se permite opcional — no figura en la exclusividad
```

Para los demás `case`, forzar `listImageUrl = undefined` en el hook `pre('save')` o en el use case (no persistir si `typeQr !== 'list'`).

#### 4.1.4 Nuevo módulo R2 — `modules/storage/`

Crear `modules/storage/` (reutilizable por futuros features de imágenes):

```
modules/storage/
├── storage.module.ts
└── storage.service.ts        # @Injectable, expone uploadImage() y deleteObject()
```

**Dependencia nueva**: `sharp` (instalar con `npm i sharp` en `backend-portaqr/`; `@nestjs/platform-express` + `multer` ya están presentes).

`StorageService` expone:

```ts
async uploadImage(input: {
  idQr: string;      // UUID v4 del QR (define el key del objeto)
  buffer: Buffer;    // WebP ya procesado por sharp (RF-7)
  width: number;     // dimensiones del WebP generado (para la respuesta)
  height: number;
}): Promise<{
  publicUrl: string; // URL pública final para guardar en MongoDB
  key: string;       // qr-multilink/{idQr}.webp
  size: number;      // bytes del objeto subido
}>

async deleteObject(publicUrl: string): Promise<void>
```

Lógica:
- `key`: `qr-multilink/${idQr}.webp` — mismo patrón de RF-11 (carpeta `qr-multilink/` + UUID único por QR, sin userId ni timestamps; al cambiar la imagen se **sobrescribe el mismo objeto**).
- `publicUrl`: `${CLOUDFLARE_R2_PUBLIC_URL}/${key}` — se sirve por el dominio público configurado en el bucket (ej. `https://images.portaqr.cl/` o el subdominio de R2).
- `PutObjectCommand` con `ContentType: 'image/webp'` y `Body: buffer`.
- `deleteObject`: extrae el `key` del `publicUrl` (restando `CLOUDFLARE_R2_PUBLIC_URL`) y llama a `DeleteObjectCommand`.

#### 4.1.5 Controller — endpoint multipart

En `presentation/controllers/qr.controller.ts`:

```ts
@Post('list-image')
@Roles('admin', 'user')
@UseInterceptors(FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },           // RF-6 (5 MB)
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'image/gif', 'image/bmp', 'image/heic', 'image/heif',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new UnsupportedMediaTypeException(
        'Formato no soportado. Usa JPG, PNG, WebP, AVIF, GIF, BMP o HEIC',
      ), false);
    }
    cb(null, true);
  },
}))
async uploadListImage(
  @UploadedFile() file: Express.Multer.File,       // multer memoryStorage
  @Body('idQr') idQr: string,
  @GetUser() user: User,
  @Tracking() tracking: TrackingContext,
): Promise<{ listImageUrl: string; size: number; width: number; height: number }> {
  // 1. Cargar el QR y validar que es del usuario y typeQr === 'list'
  const qr = await this.getQrUseCase.execute(idQr);
  if (!qr) throw new NotFoundException('QR no encontrado');
  const isAdmin = user.role === 'admin';
  if (!isAdmin && qr.userId !== user.id) throw new ForbiddenException();
  if (qr.typeQr !== 'list') throw new BadRequestException('Solo QRs multilink admiten imagen');

  // 2. Pipeline sharp (RF-7): resize 512 inside + webp q82 → buffer sanitizado (SIN rotación)
  const { buffer, width, height } = await this.imageProcessor.process(file.buffer);

  // 3. Subir a R2 (mismo key, sobrescribe — RF-11)
  const { publicUrl, size } = await this.storageService.uploadImage({ idQr, buffer, width, height });

  // 4. PATCH interno a MongoDB → data.listImageUrl = publicUrl
  await this.updateQrUseCase.execute(idQr, { data: { ...qr.data, listImageUrl: publicUrl, typeQr: 'list' } }, tracking);

  return { listImageUrl: publicUrl, size, width, height };
}
```

> [!note] Procesador de imagen
> El pipeline `sharp` (RF-7) se encapsula en un helper inyectable `ImageProcessor` (`sharp(buffer).resize({...}).webp({...}).toBuffer()` — sin rotación) dentro de `modules/storage/`, para testearlo unitariamente con buffers de prueba sin tocar R2.

> [!warning] Orden de validación
> `fileFilter` de multer valida el MIME antes de aceptar el archivo (→ `415`). `limits.fileSize` devuelve `413` si excede 5 MB. `sharp` lanza `UnprocessableImageException` (422) si el binario no es decodificable — aun con MIME falseado, sharp valida el contenido real.

#### 4.1.6 Use cases

`UpdateQrUseCase` extender para:
- Setear `listImageUrl = undefined` si `typeQr !== 'list'` (no persistirlo).
- Detectar cambio de `listImageUrl` en `PATCH`: si valor anterior era URL no nula y el nuevo es `null` u otra URL, invocar `storageService.deleteObject(oldUrl)` (mejor esfuerzo — si falla, log + no aborta el patch).

> [!info] Dependencia de módulo
> `QrModule` ahora importa `StorageModule`. No al revés (respetar dirección de dependencias hexagonal).

#### 4.1.7 Mapper de persistencia

`infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts` (y su spec): propagar el campo nuevo en ambas direcciones:
- `toDomain`/`toEntity`: incluir `data.listImageUrl` desde el documento Mongo.
- `toPersistence`: incluir `data.listImageUrl` al guardar (o `undefined` si `typeQr !== 'list'`).

Sin esto, la URL no viajaría del schema a las entidades/usecases (los mappers mapean campo por campo).

### 4.2 Frontend — `qr-app/`

#### 4.2.1 Servicio — `services/qr.service.ts`

```ts
export interface QrData {
  // ...campos actuales...
  listImageUrl?: string | null;  // ⬅ NUEVO
  typeQr: QrType;
}

// En QrService (baseUrl = '/api' — API routes del frontend, ver impacto SPEC-003):
// XMLHttpRequest para acceso a progreso (el POST va al backend vía API route,
// las cookies httpOnly viajan solas por ser same-origin).
async uploadListImage(
  idQr: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ listImageUrl: string; size: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('idQr', idQr);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).message ?? `Error ${xhr.status}`)); }
        catch { reject(new Error(`Error ${xhr.status} al subir la imagen`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Error de red subiendo la imagen'));
    xhr.open('POST', `${this.baseUrl}/qr/list-image`);
    xhr.send(formData); // NO setear Content-Type: el boundary lo genera el navegador
  });
}

// PATCH /api/qr?id ya existe; solo se pasa data.listImageUrl en el body.
```

> [!note] API route nueva del frontend
> Crear `src/app/api/qr/list-image/route.ts` siguiendo el patrón de `src/app/api/qr/route.ts`: verifica el JWT con `getAuthUser()` (jose/cookies), reenvía el FormData al backend con `Authorization: Bearer` (sin header `Content-Type` manual para que multer reciba el boundary), y devuelve la respuesta del backend. `body: formData` en el `fetch` del route handler.

```ts
// src/app/api/qr/list-image/route.ts (esquema)
export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const formData = await request.formData();
  const token = await getTokenFromCookie();
  const headers: HeadersInit = { Authorization: token ? `Bearer ${token}` : '' };

  const response = await fetch(`${baseUrl}/qr/list-image`, {
    method: 'POST',
    headers,                    // sin 'Content-Type' — multer necesita el boundary del FormData
    body: formData,
  });
  // ...propaga status/JSON del backend...
}
```

#### 4.2.2 Componente de upload — `components/qr/ListImageUploader.tsx` (nuevo)

Componente reusable con props:

```ts
interface ListImageUploaderProps {
  idQr?: string;            // undefined en CreateQrForm (aún no existe QR) — ver §4.2.3
  currentImageUrl?: string | null;
  onChange: (url: string | null) => void;
  onError: (msg: string) => void;
}
```

Renderiza:
- Drop zone con `Input type="file" accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.heic,image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/heic,image/heif"` (los 7 formatos de RF-5; HEIC mostrará el aviso de 415 al subir desde iOS).
- Si `currentImageUrl`, muestra preview con botón "Quitar" → `onChange(null)`.
- Al seleccionar archivo:
  1. Validar tipo/tamaño en cliente (≤5 MB; fuera de la lista de RF-5 → `onError` inmediato).
  2. Mostrar preview local via `URL.createObjectURL(file)`.
  3. Si `idQr` existe → `qrService.uploadListImage(idQr, file, onProgress)` → `onChange(publicUrl)`.
  4. Si `idQr` no existe (creación) → mantener `File` en estado; el upload real se dispara en el `handleSubmit` de `CreateQrForm` después de crear el QR y obtener `idQr`. Ver §4.2.3.
- Barra de progreso (1–100%) usando el `onProgress` de `uploadListImage`.
- Muestra el `listImageUrl` devuelto (o error 415/413/422 con mensaje claro del backend).

#### 4.2.3 Creación de QR — `CreateQrForm.tsx` + `ListUrlForm.tsx`

> [!warning] Secuencia en creación
> En el flujo de **crear nuevo QR**, el `idQr` se genera en el cliente (UUID v4 — ver `CreateQrForm.tsx` con `uuidv4()` y `CreateQrDto.idQr`). **El QR se crea PRIMERO y la imagen se sube DESPUÉS** (el endpoint `POST /qr/list-image` valida que el QR exista y sea del usuario — no puede validarse un QR inexistente). Flujo:
> 1. `handleSubmit`: `createQr({ ..., data: { ..., listImageUrl: null, typeQr: 'list' } })`.
> 2. Si hay imagen pendiente → `uploadListImage(idQr, file, onProgress)` (vía `/api/qr/list-image` → backend) → el endpoint persiste la URL.
> 3. Si falla la subida → el QR queda creado sin imagen y se muestra toast de warning (se puede agregar después desde editar).

`ListUrlForm.tsx` recibe una nueva prop `listImageUrl` + `onListImageUrlChange` y renderiza `<ListImageUploader />` arriba del bloque de filas de URLs.

#### 4.2.4 Edición de QR — `dashboard/qr/edit/[id]/page.tsx`

- Carga el QR con `qrService.getQrById(id)`, obtiene `data.listImageUrl`.
- Renderiza `<ListImageUploader idQr={id} currentImageUrl={data.listImageUrl} onChange=... />` dentro de la sección del `ListUrlForm`.
- En submit, envía `PATCH /api/qr?id` → `PATCH /qr/{id}` con `data: { ..., listImageUrl }`. Si `null` → backend borra objeto R2 y actualiza (RF-14).

#### 4.2.5 Página pública — `components/qr/UrlList.tsx`

Actualizar props:

```ts
interface UrlListProps {
  urls?: UrlListItem[];
  nameData?: string;
  description?: string;
  listImageUrl?: string | null;  // ⬅ NUEVO
}
```

Insertar entre `nameData` y la lista (después de la descripción). **Patrón con estado** (evita manipular el DOM directo; si la imagen falla, el bloque se desmonta y la página queda como si no hubiera imagen):

```tsx
const [imageError, setImageError] = useState(false);

// ...

{listImageUrl && !imageError && (
  <div className="flex justify-center mb-6">
    <img
      src={listImageUrl}
      alt={nameData ?? 'Imagen del QR'}
      className="w-[80%] h-auto rounded-lg"
      loading="lazy"
      decoding="async"
      onError={() => setImageError(true)}   // oculta TODO el bloque, sin fallback ni icono roto
    />
  </div>
)}
```

> [!note] Sin fallback
> Al dispararse `onError` (404/403/red/formato corrupto) el bloque completo (imagen + contenedor + `mb-6`) desaparece: no hay imagen de reemplazo, no hay icono de archivo roto, no queda espacio reservado. El layout es idéntico al de un QR sin `listImageUrl` (RF-20, CA-10).

Actualizar el consumer en `QrRedirectClient.tsx:156` (tras la migración Next 16 de SPEC-003, la línea cambió de 151) para pasar `listImageUrl={qrData.listImageUrl}`.

> [!note] Next/Image
> Se evalúa `<Image>` de `next/image` para optimización, pero R2 no está en `remotePatterns` del `next.config.js` actual. Para no expandir scope, se usa `<img>` nativo y se deja `<Image>` como mejora futura (§11.2).

### 4.3 Tipos compartidos

**`interfaces/qr.ts`** (página pública):

```ts
export interface QrRedirectData {
  // ...campos actuales...
  listImageUrl?: string | null;  // ⬅ NUEVO
  typeQr: string;
}
```

**`interfaces/qr.interface.ts`** (dashboard, usado por `QrGrid.tsx` y `edit/[id]`): tipar el campo en el tipo `Qr`/`QrResponse` correspondiente para que el response del backend no rompa TS (aunque no se renderice miniatura en el dashboard, el campo viaja en los payloads).

---

## 5. Variables de entorno (`.env`)

### 5.1 Backend `backend-portaqr/.env`

```env
# ───────── Cloudflare R2 ─────────
# Token de API R2 ( crear en Cloudflare Dashboard › R2 › Manage R2 API tokens)
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key
# Endpoint S3 del bucket: https://<account_id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
# Nombre del bucket creado en R2
CLOUDFLARE_R2_BUCKET_NAME=portaqr-assets
# URL pública vinculada al bucket (dominio custom o *.r2.dev provisto por CF)
# Ej prod: https://images.portaqr.cl  |  Ej dev: https://pub-xxxx.r2.dev
CLOUDFLARE_R2_PUBLIC_URL=https://images.portaqr.cl
# Límite de tamaño del archivo de entrada en bytes (opcional, default 5MB)
CLOUDFLARE_R2_MAX_UPLOAD_SIZE=5242880
```

Actualizar `backend-portaqr/.env.example` con estas mismas claves (valores placeholder). **Nunca commitear `.env` real**.

> [!tip] Cómo obtener las credenciales
> 1. Dashboard de Cloudflare > **R2** > **Manage R2 API Tokens** > "Create API Token".
> 2. Permiso: **Object Read & Write** sobre el bucket `portaqr-assets`.
> 3. CF entrega `Access Key ID` + `Secret Access Key` (una sola vez) y el `Account ID` (visible en la barra lateral de CF Dashboard).

### 5.2 Frontend `qr-app/.env.local`

No requiere nuevas variables. El flujo es:
- Subida: `POST /api/qr/list-image` (API route del frontend, misma cookie httpOnly) → `POST /qr/list-image` (backend NestJS). Sin headers manuales de `Content-Type` para que multer reciba el boundary.
- Lectura: la `listImageUrl` llega desde el backend ya con el dominio público R2; el browser la sirve tal cual via `<img>`.
- No hay CORS para subir a R2 (la subida va al backend, no al bucket).
- Solo aplicar `next.config.js` `remotePatterns` si se usa `next/image` (ver §11.2). Para `<img>` nativo no hace falta.

### 5.3 Docker Compose `desarrollo-qr/docker-compose.yml`

El servicio `backend-portaqr` (puerto 3004) ya carga sus variables vía `env_file: ./backend-portaqr/backendPortaqr.env` (archivo ignorado por git). Por tanto **no se modifica el docker-compose**: basta añadir las claves `CLOUDFLARE_R2_*` a `backendPortaqr.env`:

```env
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_key
CLOUDFLARE_R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
CLOUDFLARE_R2_BUCKET_NAME=portaqr-assets
CLOUDFLARE_R2_PUBLIC_URL=https://images.portaqr.cl
CLOUDFLARE_R2_MAX_UPLOAD_SIZE=5242880
```

> [!note] En producción (Railway)
> Añadir las mismas `CLOUDFLARE_R2_*` como variables de entorno del servicio en Railway (secrets).

---

## 6. Configuración Cloudflare R2

### 6.1 Creación de bucket

- Nombre: `portaqr-assets`.
- Region: **auto** (Cloudflare decide).

### 6.2 Token de API

Crear un token de API de R2 con permisos:
- Object Read & Write sobre el bucket `portaqr-assets`.
- Genera `Access Key ID` + `Secret Access Key` → van a `.env`.

### 6.3 Acceso público

- Configurar dominio público vinculado al bucket (subdominio `images.portaqr.cl` o el dominio `*.r2.dev` provisto por Cloudflare).
- Política a nivel de bucket: **solo lectura pública** para `qr-multilink/*` (no para todo el bucket).
- **No se requiere CORS en el bucket**: el navegador nunca hace PUT/GET directo a R2 — la subida pasa por el backend (multipart) y la lectura es un `<img>` simple (no cross-origin fetch). El CORS del bucket queda vacío.

### 6.4 Lifecycle (opcional, recomendado)

Regla de lifecycle para `qr-multilink/` sin uso en 90 días → `DeleteObject` (limpieza de imágenes huérfanas de QRs eliminados). Re-evaluar si el patrón de uso lo requiere.

---

## 7. Plan de implementación (tareas)

> [!todo] Tareas
> Registrar como tareas en `docs/tareas/SPEC-002-tareas.json` (formato Taskmaster-compatible). Estimación ~3.5-4.5 días.

| ID | Tarea | Capa | Estimación |
| --- | --- | --- | --- |
| T-002-01 | Config bucket + creds + `.env` | Infra | 0.5d |
| T-002-02 | `npm i sharp` + `StorageModule` + `StorageService` (uploadImage + deleteObject) | Backend | 0.5d |
| T-002-03 | Schema + DTO + entity: campo `listImageUrl` + validadores (+ fix `mapUrl` en `case 'list'`) | Backend | 0.5d |
| T-002-04 | Endpoint `POST /qr/list-image` (multipart + FileInterceptor + sharp + R2) + validación owner/tipo | Backend | 1d |
| T-002-05 | `UpdateQrUseCase`: respetar `typeQr` + borrar imagen vieja al cambiar/limpiar + mapper `qr-mongo.mapper.ts` | Backend | 0.5d |
| T-002-06 | API route `/api/qr/list-image` (proxy con jose/cookies) + `uploadListImage` en `qr.service.ts` | Frontend | 0.5d |
| T-002-07 | `ListImageUploader.tsx` + integración en `CreateQrForm`/`ListUrlForm` (crear) | Frontend | 1d |
| T-002-08 | Integrar en `edit/[id]/page.tsx` (editar/limpiar) | Frontend | 0.5d |
| T-002-09 | Render en `UrlList.tsx` + `QrRedirectClient.tsx` + tipos (`interfaces/qr.ts`, `qr.interface.ts`) | Frontend | 0.25d |
| T-002-10 | Tests unitarios `StorageService` (mock S3 client) + `ImageProcessor` (sharp) | Backend | 0.5d |
| T-002-11 | Tests integración endpoint multipart (supertest, sin tocar R2 real) | Backend | 0.5d |
| T-002-12 | Tests unitarios `ListImageUploader` (mock `uploadListImage`) + API route proxy | Frontend | 0.5d |
| T-002-13 | Docs Obsidian + este spec polish | Docs | 0.25d |

---

## 8. Testing

### 8.1 Backend

- **Unitarios `StorageService`** mockeando `S3Client.send`:
  - `uploadImage` genera `publicUrl` + `key` correcto (`qr-multilink/{idQr}.webp`) y llama `PutObjectCommand` con `ContentType: image/webp`.
  - `deleteObject` extrae key correcto del `publicUrl` y llama `DeleteObjectCommand`.
- **Unitarios `ImageProcessor`** (pipeline sharp con buffers de prueba):
  - JPG/PNG/WebP/AVIF/GIF/BMP válidos → buffer WebP, dimensiones ≤512×512, aspect ratio preservado.
  - Imagen < 512px no se amplía (`withoutEnlargement`).
  - Binario corrupto / no-imagen → lanza error → `422`.
  - GIF animado → solo primer frame.
- **Integración `POST /qr/list-image`** con supertest (multipart, sin tocar R2 real — mock de `StorageService`):
  - 200 para owner legítimo con QR `list` (respuesta `{ listImageUrl, size, width, height }`).
  - 403 si `userId` no coincide y no es admin.
  - 400 si `typeQr !== 'list'`.
  - 413 si el archivo excede 5 MB.
  - 415 si MIME no está en la allowlist (p. ej. `.svg`).
  - 422 si el binario no es decodificable por sharp (MIME falseado).
- **`UpdateQrUseCase`**: si `typeQr !== 'list'`, `listImageUrl` queda en `undefined` aunque venga en el DTO; si cambia/limpia URL, invoca `deleteObject` de la anterior (mejor esfuerzo).

### 8.2 Frontend

- **`ListImageUploader`** con mock de `qrService.uploadListImage`:
  - archivo válido → genera preview local + termina con `onChange(url)`.
  - archivo > 5 MB → `onError('…')`, no llama al backend.
  - extensión no soportada → `onError`.
  - botón "Quitar" → `onChange(null)`.
  - error de red / 413 / 415 / 422 del backend → `onError` y `onChange` no se llama.
- **API route `/api/qr/list-image`**: 401 sin cookie válida; reenvía FormData al backend y propaga status/errores.
- **`UrlList`** renderiza `<img>` solo si `listImageUrl` truthy; si `onError` se dispara (404/403/red/formato), el bloque se desmonta vía `imageError` y no queda icono roto ni espacio reservado (verifica que la página quede como sin imagen).

### 8.3 E2E (Playwright, `e2e-tests-portaqr/`)

- Flujo crear QR multilink CON imagen → verificar URL pública incluye la imagen (mock del endpoint `/api/qr/list-image` con interceptor).
- Flujo editar QR existente y quitar imagen → verificar `PATCH` body incluye `listImageUrl: null`.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Subida de archivos grandes consume memoria del backend (multipart `memoryStorage`) | Media | Medio | `limits.fileSize: 5MB` + `fileFilter` allowlist + procesamiento streaming futuro (§11.8) |
| Usuario sube un archivo con `Content-Type` falseado o binario corrupto | Media | Medio | `sharp` valida el binario real (decodificación) → `422`; el MIME falseado no supera la decodificación |
| Objetos R2 huérfanos (QR eliminado sin borrar imagen vieja) | Media | Bajo | Lifecycle rule §6.4 + log de huérfanos semanal |
| Fallo entre `PutObjectCommand` y el PATCH a Mongo (objeto subido sin URL persistida) | Baja | Bajo | Orden del flujo: primero R2, luego Mongo; si el PATCH falla queda objeto huérfano → lifecycle §6.4 |
| `sharp` no soporta HEIC (iOS) | Alta | Bajo | `415` con mensaje claro pidiendo JPG/PNG; futuro `heic-convert` (§11.7) |
| `next.config.js` no permite dominio R2 para `next/image` | Baja | Bajo | Se usa `<img>` nativo inicialmente; `next/image` queda como futura (§11.2) |
| Costos de R2 inesperados por abuso de uploads | Baja | Medio | Límite por usuario (configurable): máximo 10 subidas/hora/usuario en rate-limit del endpoint |
| Pérdida de la imágen cuando el QR todavía no se crea (flujo crear) | Baja | Bajo | El upload se hace tras `POST /qr`; si el usuario abandona, el objeto R2 queda huérfano → lifecycle |

---

## 10. Observabilidad

- **Logs backend** en el endpoint `POST /qr/list-image`:
  - `INFO`: `image_upload_received` con `{ userId, idQr, originalMime, size }`.
  - `INFO`: `image_processed` con `{ userId, idQr, width, height, webpBytes }` (tras sharp).
  - `INFO`: `image_uploaded` con `{ userId, idQr, key, bytes }` (tras PutObjectCommand).
  - `WARN`: `image_upload_rejected` con motivo (`not_owner` / `wrong_type` / `bad_mime` / `too_large` / `decode_failed`).
- **Logs backend** en `UpdateQrUseCase` cuando hace `deleteObject`:
  - `INFO`: `r2_object_deleted` con `{ oldKey, newKey | null }`.
  - `ERROR`: si `deleteObject` falla — no abortar el patch; registrar.
- ** Métricas** (cuando existan):
  - `qr_list_image_uploads_total{userId}`
  - `qr_list_image_upload_errors_total{reason}`
  - `r2_failed_delete_total`

---

## 11. Trabajo futuro (out of scope)

### 11.1 Imágenes para otros tipos de QR
El campo `listImageUrl` está limitado a `typeQr === 'list'`. Para extender a otros tipos, mover el campo a nivel del `Qr` raíz (ver ADR-002.1 alt A) y/o introducir `coverImageUrl` con reglas de render por tipo.

### 11.2 `next/image` con dominio R2
Migrar `<img>` a `next/image` (con `remotePatterns` para `images.portaqr.cl` o `*.r2.dev`) para optimización responsive, lazy nativo y blur placeholder. Evaluar Image Resizing de Cloudflare.

### 11.3 Validación profunda de imágenes (magic bytes) — ya cubierto
Con el flujo multipart + `sharp`, la validación real del binario ya ocurre en el backend (sharp decodifica y falla con binarios corruptos/falseados → `422`). Este ítem queda **resuelto** por la decisión del ADR-002.2 (revisado 2026-08-07). A lo sumo se puede añadir un chequeo explícito de magic bytes antes de sharp para mensajes de error más precisos.

### 11.4 Recorte/preview en el navegador
Integrar `react-easy-crop` o `react-image-crop` para forzar aspecto 1:1 (logo) o 16:9 (banner). Mejora UX pero replica foto → más ancho de banda.

### 11.5 Migración de imágenes de vCard (`vcard.photo`)
El schema ya tiene `vcardData.photo`. Unificar con Cloudflare R2 como storage único: futura migración para mover todos los `photo` existentes al bucket y reemplazar URLs externas.
### 11.6 Variantes responsive (out of scope definitivo)
No se generan variantes ni `srcset`. **Una sola imagen WebP ≤512px por QR**, servida en la landing pública. Razones: (a) cardinalidad del feature es "una sola imagen por QR" (ver §1), (b) 512px es suficiente para mobile rendering, (c) Cloudflare R2 no cobra egress entre servicios CF. Generar miniaturas adicionales queda diferido permanentemente salvo cambio explícito.

### 11.7 Soporte HEIC/AVIF de entrada
Integrar `heic-convert` o compilar `sharp` con libheif para decodificar HEIC/HEIF de iOS en el backend (hoy: `415` con mensaje claro). AVIF ya decodifica con el sharp precompilado.

### 11.8 Offloading del procesamiento de imágenes
Con multipart, el backend procesa la imagen de forma síncrona (memoria + CPU). Futuro: cola de trabajo (BullMQ) o procesamiento streaming para no bloquear el event loop en cargas concurrentes altas.

---

## 12. Glosario

| Término | Significado |
| --- | --- |
| **QR multilink** | Tipo de QR con `typeQr === 'list'`; su `data.urlList` es un array de enlaces (URLs o vCards) que la página pública muestra como botones. |
| **`listImageUrl`** | Campo nuevo a nivel del `QrData` con la URL pública de la imagen de portada del QR multilink (mismo nombre en runtime y Mongo). |
| **Multipart/form-data** | Codificación HTTP para subir archivos desde el navegador al backend (campo `file` + `idQr`). El backend lo recibe con multer. |
| **sharp** | Librería de procesamiento de imágenes (decodifica, redimensiona, re-encodea a WebP; descarta metadatos y contenido no-pixel). |
| **R2** | Servicio de almacenamiento de objetos compatible con S3 de Cloudflare. Sin egress fees entre servicios de CF. |
| **`idQr`** | UUID v4 generado en el cliente al crear el QR (ver `CreateQrDto.idQr`). |

---

## 13. Referencias

- [[SPEC-001-migracion-monolito-modular]] — arquitectura hexagonal de `backend-portaqr/`.
- [[SPEC-003-auditoria-dependencias-qr-app]] — impacto en auth (cookies httpOnly + jose) y puerto del backend (:3004).
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- AWS SDK v3 client-s3 (PutObject/DeleteObject): https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
- sharp docs: https://sharp.pixelplumbing.com/
- `QR_TYPES` constant: `qr-app/src/constants/qrTypes.ts`
- Schema QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/schemas/qr.schema.ts`
- Mapper QR: `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts`
- API route frontend (patrón a seguir): `qr-app/src/app/api/qr/route.ts`
- Componente `UrlList`: `qr-app/src/components/qr/UrlList.tsx`
- `QrRedirectClient`: `qr-app/src/app/qr/[id]/QrRedirectClient.tsx:156`
