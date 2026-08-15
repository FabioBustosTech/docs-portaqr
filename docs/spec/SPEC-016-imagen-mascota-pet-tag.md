---
title: "SPEC-016: Imagen de la mascota en QR PetTag (Cloudflare R2)"
date: 2026-08-14
tags:
  - spec
  - backend
  - frontend
  - pet-tag
  - cloudflare
  - r2
  - imagen
status: implementado
aliases:
  - SPEC-016
  - imagen mascota pet tag
---

# SPEC-016: Imagen de la mascota en QR PetTag (Cloudflare R2)

> [!abstract] Decisión clave
> Agregar una **foto de la mascota** al QR PetTag: el navegador sube la imagen al backend (**multipart**), este la **sanitiza y re-encodea a WebP ≤512×512px** con el `ImageProcessorService` existente (SPEC-002) y la sube a **Cloudflare R2** en la **carpeta (prefijo) `pet-tag/`** con key **`pet-tag/{idQr}.webp`**. Solo la **URL pública** se persiste en `petData.petImageUrl`. La imagen se muestra en la página pública **`portaqr.cl/pet-tag/{idQr}`** (componente `PetInfo`) sobre los datos de la mascota. **No se crea bucket nuevo ni credenciales nuevas**: se reutiliza `portaqr-assets` y las 6 variables `CLOUDFLARE_R2_*` de [[SPEC-002]]; solo se **extiende la política de acceso público al prefijo `pet-tag/*`** (una sola vez, en Cloudflare).

> [!info] Metadatos
> - **Estado:** Implementado (backend + frontend, 2026-08-14 — rama `feat/spec-016-imagen-pet-tag`; **pendiente**: política R2 `pet-tag/*` en producción + E2E)
> - **Fecha:** 2026-08-14
> - **Componente destino:** `desarrollo-qr/backend-portaqr/` (módulo `pet-tag` + módulo `storage`), `desarrollo-qr/qr-app/` (activación + página pública)
> - **Rama:** `feat/spec-016-imagen-pet-tag`
> - **Origen:** Requerimiento del usuario (2026-08-14): "generar una spec nueva para los QR PetTag — agregar una imagen de la mascota que se suba a una carpeta para esos en el bucket de Cloudflare". Reutiliza el pipeline de [[SPEC-002]] (imagen QR Multilink → R2) y [[SPEC-005]] (PDFs → R2, extensión de política).
> - **Bucket:** `portaqr-assets` — prefijo nuevo `pet-tag/` (junto a `qr-multilink/` y `qr-multilink-pdf/`).

---

## 1. Objetivo

1. Que el usuario pueda **subir una foto de su mascota** al activar (o después de activar) su placa PetTag.
2. Que la imagen se **almacene en Cloudflare R2** en una **carpeta dedicada `pet-tag/`** del bucket `portaqr-assets` (no en MongoDB, no en el filesystem del server).
3. Que la **página pública `/pet-tag/{idQr}`** muestre la foto de la mascota de forma destacada sobre la tarjeta de información (`PetInfo`).
4. Que el usuario pueda **reemplazar** la foto (sobrescribe el mismo objeto R2, sin acumular versiones) y **eliminarla** (borra el objeto R2 y limpia la URL en Mongo).
5. Que toda subida pase por el **pipeline de sanitización existente** (sharp → WebP, sin EXIF ni contenido embebido), manteniendo el mismo nivel de seguridad de SPEC-002/005.

### 1.1 Out of scope

- **NO** se sube imagen para QRs tipo `pet` legacy (mode viejo con `data.petData` en `qrs`): solo placas PetTag (`pettags`). Efecto colateral aceptado: si un QR legacy llegara a tener `petImageUrl`, `PetInfo` (compartido) lo mostraría — sin trabajo adicional.
- **NO** se implementa galería ni múltiples imágenes: exactamente **0 o 1** foto por placa (patrón SPEC-002 RF-1).
- **NO** se modifica la activación admin ni el carrito (`/dashboard/admin/qr/activate`).
- **NO** se modifica `bff-service` (deprecado, SPEC-001) ni `user-service`/`qr-service`.
- **NO** se agrega edición de imagen en el dashboard del usuario (la edición del pet-tag activado hoy no tiene vista propia; el reemplazo/borrado queda expuesto por API y en la página de activación — UI de edición futura puede reusar los mismos endpoints).
- **NO** se cambia `ImageProcessorService` (se reutiliza tal cual, 512×512 — ver ADR-016.3).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Backend (monolito `backend-portaqr`)**

- **RF-1 (campo persistente)**. `PetData` gana el campo **opcional** `petImageUrl?: string | null` (default `null`) en: schema Mongo (`PetDataSchema` en `pet-tag.schema.ts`), entidad de dominio (`pet-tag.entity.ts`), interface frontend y mappers (`pet-tag-mongo.mapper.ts`). Almacena la **URL pública** de R2 — nunca el binario.
- **RF-2 (no escribible vía JSON)**. `petImageUrl` **NO** se agrega a `CreatePetTagDto`/`UpdatePetTagDto`/`ActivatePetTagDto`. El validation pipe global (forbidNonWhitelisted) rechaza el campo si un cliente intenta fijar una URL arbitraria vía `PATCH /pet-tag/:idQr` o `/activate`. La URL solo se escribe por los endpoints de imagen (RF-6/RF-8).
- **RF-3 (nuevo método de repositorio)**. Port `ICanUpdatePetTag` + `mongo-pet-tag.repository.ts` ganan `setPetImageUrl(idQr, userId, url: string | null, tracking)` → `findOneAndUpdate({ idQr, userId }, { $set: { 'petData.petImageUrl': url } })` (**1 round-trip**, patrón SPEC-007; actualiza el **sub-campo** sin pisar el resto del `petData` — a diferencia de `update()` que reemplaza `petData` completo).
- **RF-4 (validación de ownership)**. Los endpoints de imagen validan que la placa existe y **pertenece al usuario** (`petTag.userId === user.id`) o el requester es `admin` → si no, `403 Forbidden`. Placa inexistente → `404`.
- **RF-5 (límite y allowlist de tipos)**. `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: PET_TAG_MAX_UPLOAD_SIZE } })` con `PET_TAG_MAX_UPLOAD_SIZE` (default **5 MB**, misma técnica que `getListImageMaxUploadSize()` de SPEC-002). `fileFilter` allowlist: `image/jpeg`, `image/png`, `image/webp` → otro formato responde `415 Unsupported Media Type`.
- **RF-6 (endpoint de subida/reemplazo)**. `POST /pet-tag/:idQr/image` (`@Roles('admin', 'user')`, `@ApiConsumes('multipart/form-data')`):
  1. Validar ownership (RF-4).
  2. `ImageProcessorService.process(file.buffer)` → WebP ≤512×512, calidad 82 (reutiliza pipeline SPEC-002). Binario corrupto → `422 Unprocessable Image` y **no se sube ni persiste nada**.
  3. `StorageService.uploadPetImage({ idQr, buffer, width, height })` → key **`pet-tag/{idQr}.webp`** (RF-7).
  4. **Solo si el PUT a R2 fue exitoso**: `setPetImageUrl(idQr, userId, publicUrl)` → no queda URL huérfana.
  5. Respuesta `200 { petImageUrl, size, width, height }`.
- **RF-7 (key R2 y sobrescritura)**. Nuevo método `StorageService.uploadPetImage`: key `pet-tag/{idQr}.webp`, `ContentType: 'image/webp'`, `CacheControl: 'public, max-age=31536000, immutable'`, log `r2_object_put { idQr, size, width, height }`. **Re-subir reemplaza el mismo objeto** (sin versiones huérfanas — patrón SPEC-002 RF-11). `extractKeyFromUrl` se extiende al prefijo `pet-tag/` (regex `(?:qr-multilink(?:-pdf)?|pet-tag)\/[\w-]+\.(?:webp|pdf)`).
- **RF-8 (endpoint de borrado)**. `DELETE /pet-tag/:idQr/image` (`@Roles('admin', 'user')`):
  1. Validar ownership (RF-4).
  2. Leer `petData.petImageUrl` actual.
  3. `setPetImageUrl(idQr, userId, null)` → el campo queda `null` en Mongo.
  4. `StorageService.deleteObject(url)` → **mejor esfuerzo** (si falla, log `r2_failed_delete` y no aborta — el lifecycle rule del bucket limpia el huérfano, patrón SPEC-002 RF-14).
  5. Respuesta `200 { petImageUrl: null }`. La página pública deja de mostrar la foto y la URL R2 responde 404.

**Bloque B — Frontend (`qr-app`)**

- **RF-9 (API route proxy)**. Nueva `src/app/api/pet-tag/[idQr]/image/route.ts` con `POST` (multipart → monolito, `Content-Type` automático con boundary) y `DELETE`, autenticada (patrón API routes de `pet-tag/activate`). Errores del monolito (403/404/413/415/422) se propagan tal cual.
- **RF-10 (métodos de servicio)**. `pet-tag.service.ts`:
  - `uploadPetImage(idQr, file: File)` → `POST /api/pet-tag/${idQr}/image` con `FormData` (`{ file }`) → `{ petImageUrl, size, width, height }`.
  - `deletePetImage(idQr)` → `DELETE /api/pet-tag/${idQr}/image`.
- **RF-11 (formulario de activación)**. `PetTagActivateForm` gana la sección **"Foto de la Mascota (Opcional)"**: input `file` (`accept="image/png,image/jpeg,image/webp"`), **preview** con `URL.createObjectURL` (thumbnail circular), botón "Quitar foto" y validación client-side de tamaño (≤5 MB) y tipo. **Flujo de submit en 2 pasos**: (1) activar placa (flujo JSON existente); (2) si `success` y hay archivo seleccionado → `uploadPetImage`. Si la subida falla tras una activación exitosa → **toast warning no bloqueante** ("Placa activada, pero la foto no se pudo subir — puedes reintentar"): la placa queda activa con su data; la imagen se puede re-subir invocando el mismo endpoint.
- **RF-12 (página pública)**. `PetInfo` (`components/qr/PetInfo.tsx`) muestra la foto si `data.petImageUrl` existe: `<img>` **circular** (`rounded-full`, `object-cover`, ~128-160px, `border`), centrada sobre el título "Información de la Mascota", con `alt={data.petName}` y `loading="lazy"`. Sin foto → render idéntico al actual (sin placeholder).
- **RF-13 (interfaz)**. `PetData` en `src/interfaces/qr.ts` gana `petImageUrl?: string | null`.

### 2.2 Reglas de negocio

- **RN-1**. Cada placa tiene **exactamente 0 o 1 foto**. Re-subir reemplaza (misma key R2). Eliminar la deja en 0.
- **RN-2**. Solo el **dueño** (`petTag.userId`) o un **admin** pueden subir/reemplazar/borrar la foto de una placa.
- **RN-3**. La foto se **sube del navegador al backend** y el backend la sube a R2 vía SDK (nunca upload directo del browser a R2): el backend debe ver el binario para sanitizar (misma justificación que SPEC-002 ADR-002.2).
- **RN-4**. El borrado de R2 es **mejor esfuerzo** (no bloquea la operación ni deja estados inconsistentes en Mongo: la URL se limpia siempre).
- **RN-5**. `petImageUrl` solo se escribe desde los endpoints de imagen (RF-6/RF-8); **ningún DTO JSON lo expone** (RF-2). Previene persistir URLs arbitrarias que no pasaron por sharp/R2.
- **RN-6**. La key incluye el `idQr` (no datos personales). La URL pública no expone el nombre del dueño ni de la mascota.
- **RN-7**. Si se re-suben fotos con el mismo idQr, no se acumulan objetos en el bucket (sobrescritura). Los logs `r2_object_put`/`r2_failed_delete` permiten auditar (patrón SPEC-002).

### 2.3 Criterios de aceptación (CA)

- **CA-01**: activar una placa con foto → `POST /api/pet-tag/activate` OK y luego `POST /pet-tag/:idQr/image` → `200 { petImageUrl: "https://<PUBLIC_URL>/pet-tag/<idQr>.webp", size, width, height }`; en Mongo `petData.petImageUrl` persiste la URL y `petData` del documento conserva el resto de campos intactos (verificado con `mongosh`).
- **CA-02**: la URL pública responde `200` con `Content-Type: image/webp` (Public Access del prefijo `pet-tag/*` habilitado).
- **CA-03**: página pública `/pet-tag/<idQr>` con foto → `PetInfo` muestra la imagen circular sobre los datos; sin foto → layout idéntico al actual.
- **CA-04**: re-subir foto → mismo key `pet-tag/<idQr>.webp` sobrescrito (no hay un segundo objeto; verificar en R2 que `LastModified` cambió).
- **CA-05**: `DELETE /pet-tag/:idQr/image` → `200 { petImageUrl: null }`; la URL R2 responde `404`; Mongo tiene `petData.petImageUrl: null`.
- **CA-06**: usuario NO dueño (rol `user`) → `403` en POST/DELETE image; placa inexistente → `404`.
- **CA-07**: archivo > 5 MB → `413`; formato `.svg`/`.pdf`/`.gif` → `415`; binario corrupto → `422` y **no** hay objeto R2 ni URL persistida.
- **CA-08**: `PATCH /pet-tag/:idQr` con `petData: { petImageUrl: "https://evil.example/x.webp" }` → `400` (forbidNonWhitelisted) — la URL no se puede escribir por JSON.
- **CA-09**: activar placa con foto + falla simulada de R2 en la subida (mock `uploadPetImage` rechaza) → la placa queda ACTIVA con sus datos, toast warning al usuario, y **no** hay URL persistida.
- **CA-10**: `tsc --noEmit`, lint y suites de tests verdes (unit backend `pet-tag` + `storage`, unit frontend, E2E). Sin regresión en SPEC-002/005/009 (multipart, R2, activación).

---

## 3. Baseline del problema (verificado 2026-08-14)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| `PetData` (pet-tag) | `ownerName, address, phone, petName, birthDate, breed, gender, species, dietFrequency, diseases, vaccines, observations` (schema `pet-tag.schema.ts` L4-47) | + `petImageUrl?: string \| null` (RF-1) |
| Página pública `/pet-tag/[idQr]` | `PetTagClient` → `PetInfo(data)` con tarjeta de texto (nombre, especie, raza, vacunas…) — sin imagen | Foto circular de la mascota sobre la tarjeta (RF-12) |
| Formulario de activación | `PetTagActivateForm` — campos dueño + mascota + PIN, submit JSON (`petTagData`, `pin`) | + selector de foto con preview; submit en 2 pasos (activar → subir) (RF-11) |
| `StorageService` | `uploadImage` (`qr-multilink/{idQr}.webp`), `uploadPdf` (`qr-multilink-pdf/…`), `deleteObject`, `extractKeyFromUrl` (regex solo `qr-multilink(?:-pdf)?`) | + `uploadPetImage` (`pet-tag/{idQr}.webp`) y regex extendido a `pet-tag/` (RF-7) |
| `ImageProcessorService` | WebP ≤512×512, calidad 82, sin rotación (SPEC-002 RF-7) | **Sin cambios** (reutilizado, ADR-016.3) |
| R2 (bucket `portaqr-assets`) | Prefijos públicos: `qr-multilink/`, `qr-multilink-pdf/` | + política pública `pet-tag/*` (producción, §7) |
| `ICanUpdatePetTag` + repo | `update()` (reemplaza `petData` completo), `activate()` | + `setPetImageUrl()` (sub-campo, 1 round-trip, RF-3) |
| Endpoints pet-tag | `admin/generate`, `admin/reserved`, `public/status/:idQr`, `update/:petTagId`, `activate`, `PATCH :idQr` | + `POST/DELETE :idQr/image` (RF-6/RF-8) |

---

## 4. Diseño Técnico

### 4.1 Flujo de datos — subida de foto

```
[Navegador: PetTagActivateForm]
  1. Usuario selecciona archivo → preview (URL.createObjectURL) → valida ≤5MB y MIME
  2. Submit: POST /api/pet-tag/activate (JSON, flujo existente) → placa ACTIVA
  3. Si success y hay archivo: POST /api/pet-tag/{idQr}/image (multipart FormData)
        │
        ▼
[qr-app: API route /api/pet-tag/[idQr]/image/route.ts]  (proxy, auth)
        │
        ▼
[backend-portaqr: PetTagController.POST :idQr/image]    @Roles('admin','user')
  4. FileInterceptor('file', memoryStorage, 5MB, allowlist jpeg|png|webp) → 413/415
  5. Buscar placa por idQr → 404 si no existe
  6. Ownership: admin || petTag.userId === user.id → 403
  7. ImageProcessorService.process(buffer) → WebP ≤512×512 q82 → 422 si corrupto
  8. StorageService.uploadPetImage({ idQr, buffer, width, height })
       key = pet-tag/{idQr}.webp   (sobrescribe — RF-7)
  9. setPetImageUrl(idQr, userId, publicUrl) → $set 'petData.petImageUrl'
        │
        ▼
  10. 200 { petImageUrl, size, width, height }
```

**Flujo de datos — borrado de foto**

```
DELETE /api/pet-tag/{idQr}/image → controller
  1. Ownership (admin || dueño) → 403
  2. Leer petData.petImageUrl actual (null → 200 idempotente)
  3. setPetImageUrl(idQr, userId, null)   ← siempre se limpia Mongo
  4. StorageService.deleteObject(url)      ← mejor esfuerzo, log si falla
  5. 200 { petImageUrl: null } → página pública sin foto, URL R2 404
```

### 4.2 Contratos de API

```
POST /pet-tag/:idQr/image          (Bearer JWT, admin|user, multipart/form-data)
  Body (multipart): file=<binario>
  Éxito:  200 { petImageUrl: string, size: number, width: number, height: number }
  403 no propietario | 404 placa inexistente | 413 >5MB | 415 MIME no permitido |
  422 imagen corrupta | 400 sin archivo

DELETE /pet-tag/:idQr/image         (Bearer JWT, admin|user)
  Éxito:  200 { petImageUrl: null }
  403 no propietario | 404 placa inexistente

PATCH /pet-tag/:idQr                (sin cambios de contrato)
  petImageUrl en body → 400 (forbidNonWhitelisted, RF-2)
```

### 4.3 Cambios por archivo — Backend

| Archivo | Cambio |
| --- | --- |
| `modules/storage/storage.service.ts` | `uploadPetImage()` + regex `extractKeyFromUrl` con `pet-tag/` (RF-7) |
| `modules/storage/storage.service.spec.ts` | Tests de key/ContentType/sobrescritura/borrado prefijo pet-tag (CA-04/05) |
| `modules/pet-tag/infrastructure/repository/mongo/schemas/pet-tag.schema.ts` | `@Prop({ type: String, default: null }) petImageUrl?: string \| null` en `PetDataSchema` (RF-1) |
| `modules/pet-tag/domain/entities/pet-tag.entity.ts` | `petImageUrl?: string \| null` en `PetData` (RF-1) |
| `modules/pet-tag/infrastructure/repository/mongo/mappers/pet-tag-mongo.mapper.ts` | mapear el campo nuevo (RF-1) |
| `modules/pet-tag/domain/ports/queries/pet-tag.port.ts` | `ICanUpdatePetTag.setPetImageUrl(idQr, userId, url, tracking)` (RF-3) |
| `modules/pet-tag/infrastructure/repository/mongo/mongo-pet-tag.repository.ts` | `setPetImageUrl()` con `$set: { 'petData.petImageUrl': url }`, `new: true` (RF-3) |
| `modules/pet-tag/application/use-cases/pet-tag-image.usecase.ts` (nuevo) | `UploadPetImageUseCase` / `DeletePetImageUseCase`: ownership → storage → persistencia, con `TraceService` (RF-4/6/8) |
| `modules/pet-tag/presentation/controllers/pet-tag.controller.ts` | `POST/DELETE :idQr/image` con `FileInterceptor` (memoryStorage, `PET_TAG_MAX_UPLOAD_SIZE`, allowlist) (RF-5/6/8) |
| `modules/pet-tag/pet-tag.module.ts` | importar `StorageModule` (o `StorageService`) + `ImageProcessorService` |
| `application/dto/*` | **Sin cambios**: `petImageUrl` NO se agrega a ningún DTO JSON (RF-2) |
| `backend-portaqr/.env`, `backendPortaqr.env`, `.env.example` | `PET_TAG_MAX_UPLOAD_SIZE=5242880` (default si falta; `CLOUDFLARE_R2_*` ya existen — **NO** agregar) |
| Tests | `pet-tag.controller.spec.ts` (CA-01/04-09), `pet-tag-image.usecase.spec.ts`, repo spec, mapper spec |

### 4.4 Cambios por archivo — Frontend

| Archivo | Cambio |
| --- | --- |
| `src/app/api/pet-tag/[idQr]/image/route.ts` (nuevo) | `POST` (multipart proxy) + `DELETE` (RF-9) |
| `src/services/pet-tag.service.ts` | `uploadPetImage(idQr, file)` + `deletePetImage(idQr)` (RF-10) |
| `src/components/pet-tag/PetTagActivateForm.tsx` | Sección foto (input file + preview + quitar) + submit en 2 pasos (RF-11) |
| `src/interfaces/qr.ts` | `PetData.petImageUrl?: string \| null` (RF-13) |
| `src/components/qr/PetInfo.tsx` | `<img>` circular condicional (RF-12) |
| Tests | componentes (preview, validación tamaño/tipo, submit 2 pasos con mock de activación y upload) |

### 4.5 ADRs

> [!info] ADR-016.1 — ¿Dónde vive la URL: `petData.petImageUrl` o campo raíz del PetTag?
> **Decisión**: `petData.petImageUrl` (sub-campo de `PetData`).
> - **Pro**: semántica (es atributo de la mascota); `PetInfo` ya recibe `petData` → cero cambios de firma en la página pública; la activación persiste `petData` completo → el campo viaja con el resto de datos.
> - **Contra**: `update()`/`activate()` reemplazan `petData` completo → riesgo de pisar la URL. **Mitigación**: `setPetImageUrl()` actualiza el **sub-campo** con `$set` dedicado (RF-3) y los endpoints de imagen lo usan, no `update()`.

> [!info] ADR-016.2 — ¿Endpoints dedicados o campo en PATCH?
> **Decisión**: endpoints dedicados `POST/DELETE /pet-tag/:idQr/image` (multipart / DELETE explícito).
> - Fijar `petImageUrl` por JSON (PATCH) permitiría persistir **URLs arbitrarias** sin pasar por sharp/R2 (riesgo de hotlink/abuso) → RF-2 lo bloquea explícitamente.
> - Endpoint dedicado: validación de ownership + multipart + procesamiento en un solo lugar, y el borrado limpia R2 de forma explícita (patrón más claro que detectar `null` dentro del PATCH genérico).

> [!info] ADR-016.3 — ¿Reutilizar `ImageProcessorService` (512×512) o permitir más resolución?
> **Decisión**: **reutilizar tal cual** (WebP ≤512×512, calidad 82).
> - La foto se muestra en una tarjeta de ~128-160px en móvil (quien escanea el QR usa el teléfono) → 512px es holgado; más resolución = más peso y CPU de proceso sin ganancia visible.
> - Consistencia de pipeline y caché con SPEC-002; cero cambios en el processor ni en sus tests.
> - Si a futuro se quiere "ver foto en pantalla completa", se sube el límite con un flag (out of scope).

---

## 5. Mockups / Referencias

- Página pública con foto (mockup textual): tarjeta centrada → **foto circular ~128px** (borde `accent`) → título "Información de la Mascota" → datos actuales (sin cambios de layout).
- Referencia de implementación previa: [[SPEC-002]] §4.1 (pipeline imagen R2), [[SPEC-005]] §4.1.4 (extensión de prefijos), [[NOTA-despliegue-produccion-SPEC-002]] (bucket/token R2).

---

## 6. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| **Upload vía backend** (multipart → Nest → sharp → R2) | Sanitización centralizada (WebP, sin EXIF/scripts); control de tamaño/tipo; allowlist MIME | Backend consume memoria/banda (mitigado: 5MB + memoryStorage + fileFilter) | ✅ (patrón SPEC-002) |
| **Presigned URL (browser → R2 directo)** | Cero egress por backend; escala ilimitada | El backend nunca ve el binario → **no sanitiza**; rompe el requisito central | ❌ |
| **512×512 WebP** | Consistente con SPEC-002; ligero en móvil | Menos resolución que el original (suficiente para tarjeta ~160px) | ✅ (ADR-016.3) |
| **Campo en `petData`** | Semántica; PetInfo sin cambios de firma | `update()` pisa `petData` completo → mitigado con `setPetImageUrl()` | ✅ (ADR-016.1) |
| **Endpoints dedicados** | Ownership + multipart + limpieza R2 en un lugar; `petImageUrl` no escribible por JSON | 1 endpoint más en el controller | ✅ (ADR-016.2) |
| **Eliminar = borrar R2** (no solo `null` en Mongo) | Sin objetos huérfanos ni URLs rotas | R2 `DeleteObjectCommand` falla ocasional → mejor esfuerzo + lifecycle rule | ✅ |

---

## 7. Producción / Cloudflare R2 (una sola vez)

1. **Bucket**: reutilizar `portaqr-assets` — **no** crear bucket nuevo (mismo `CLOUDFLARE_R2_*` de [[NOTA-despliegue-produccion-SPEC-002]]).
2. **Política de acceso público**: extender el scope de solo-lectura pública al prefijo **`pet-tag/*`** (junto a `qr-multilink/*` y `qr-multilink-pdf/*`). Sin esto, la URL persistida dará `404` al mostrar la foto.
3. **(Opcional) Lifecycle**: si existe la regla de expiración de SPEC-005, cubre también `pet-tag/` (limpieza de huérfanos tras fallos de borrado).
4. **Secrets Railway**: `CLOUDFLARE_R2_*` ya cargadas (SPEC-002). Nueva **opcional**: `PET_TAG_MAX_UPLOAD_SIZE` (default 5 MB).
5. **No se requiere CORS en el bucket** (la subida va browser → backend → R2, como SPEC-002/005).

> [!note] Verificación post-despliegue
> 1. Activar placa con foto → `POST /pet-tag/:idQr/image` → 200.
> 2. URL `https://<PUBLIC_URL>/pet-tag/<idQr>.webp` → `200`, `Content-Type: image/webp` (si 404 → política `pet-tag/*` no habilitada).
> 3. Página pública muestra la foto; eliminar → URL 404 y Mongo `null`.
> 4. Logs: `r2_object_put { idQr, ... }` y `r2_object_deleted { key: pet-tag/... }`.

---

## 8. Criterios de calidad

- **Backend**: unit tests (controller, use case, repo `setPetImageUrl`, `StorageService.uploadPetImage`, mapper) cubriendo CA-01/04-09; `tsc --noEmit` + lint sin errores.
- **Frontend**: tests de `PetTagActivateForm` (preview, validación, submit 2 pasos), `PetInfo` (con/sin foto) y servicio; `tsc --noEmit` + `next build`.
- **E2E** (`e2e-tests-portaqr`, opcional pero recomendado): activar placa con foto → página pública muestra imagen; reemplazo; borrado → 404.

## 9. Tareas

- [ ] Tareas registradas en `docs/tareas/SPEC-016-tareas.json` (formato Taskmaster).
- [ ] Rama `feat/spec-016-imagen-pet-tag` (backend + frontend + e2e).

## 10. Referencias

- [[SPEC-002]] — pipeline imagen → R2 (`qr-multilink/`), patrón base de esta spec.
- [[SPEC-005]] — extensión de prefijos R2 (`qr-multilink-pdf/`) y política.
- [[SPEC-007]] — `findOneAndUpdate` 1 round-trip, patrón para `setPetImageUrl`.
- [[NOTA-despliegue-produccion-SPEC-002]] — bucket `portaqr-assets`, variables `CLOUDFLARE_R2_*`, Public Access.
- [[NOTA-despliegue-produccion-SPEC-005]] — extensión de política y lifecycle (mismo patrón para `pet-tag/*`).
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/

---

## 11. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-08-14 | **T1-T5 backend implementadas** (rama `feat/spec-016-imagen-pet-tag`): `petData.petImageUrl` (schema/entidad/mapper), `ICanUpdatePetTag.setPetImageUrl` (sub-campo, 1 round-trip, `userId null` = admin) + `getOwner` (port/repo/adapter), `StorageService.uploadPetImage` (key `pet-tag/{idQr}.webp`) + regex extendido, use cases `UploadPetImageUseCase`/`DeletePetImageUseCase` (ownership → sharp → R2 → persistencia; deleteObject mejor esfuerzo con defensa en profundidad), `POST/DELETE /pet-tag/:idQr/image` (FileInterceptor 5MB, allowlist jpeg/png/webp → 415; 422 imagen corrupta; `petData` null → 422), módulo + `PET_TAG_MAX_UPLOAD_SIZE`. Commits: `e36d214`, `5cadc13`, `714db9b`, `ed2610c`. Suite backend **1272 tests PASS** + tsc OK. |
| 2026-08-14 | **T6-T8 frontend implementadas**: API route `api/pet-tag/[idQr]/image` (POST multipart proxy + DELETE, 401/400/propagación de errores), `petTagService.uploadPetImage`/`deletePetImage` (lectura `message` o `error`), `PetTagActivateForm` con foto (preview circular, validación client-side 5MB + formatos, submit 2 pasos: activar → subir; fallo de upload = toast warning no bloqueante), `PetInfo` con `<img>` circular condicional + `PetData.petImageUrl` en interfaz. Commits: `c0cddb5`, `7308167`, `622a72a`. Suite frontend **140 tests PASS** + `next build` OK. |
| 2026-08-14 | **BUGFIX preexistente descubierto en la prueba del flujo**: el registro de scans de PetTags fallaba con `QR no encontrado: <idQr>` — `CreateScanUseCase` valida el idQr SOLO contra `qrs` (SPEC-009 A9) y los PetTags viven en `pettagschemas` sin QR espejo → las estadísticas de escaneo de pet-tags NUNCA se registraban (el `PetTagClient` lo tragaba con try/catch). **Fix** (`83d320f`): fallback en `CreateScanUseCase` — si el idQr no es un QR (404), se resuelve el dueño con `petTagGetter.getOwner()` (port `PET_TAG_GET_PORT` exportado por PetTagModule, importado por ScanModule). Coherente con SPEC-009: el dueño lo toma el backend. Verificado en vivo: scan registrado con `userId` = dueño de la placa. |
| 2026-08-14 | **T9 E2E completada** (rama `feat/spec-016-imagen-pet-tag` en `e2e-tests-portaqr`, commit `3025b1e`): `tests/pet-tag/spec-016-pet-tag-image.spec.ts` con 5 tests — (1) activar placa CON foto desde el formulario → R2 + `petImageUrl` persistida (resto del petData intacto), (2) página pública muestra el `img` circular con la URL R2 (alt = petName), (3) reemplazo vía API → misma key (sobrescribe) y objeto 200, (4) eliminación → `petImageUrl: null` en BD + URL R2 **404** + página sin imagen, (5) 403 para usuario NO dueño (POST y DELETE). **5/5 passed a la primera**; suite `tests/pet-tag` completa 11/11. |
| Pendiente | **T10 producción**: política R2 pública `pet-tag/*` (Cloudflare), verificación post-despliegue ([[NOTA-despliegue-produccion-SPEC-016]]). |

> [!note] Gotchas de implementación
> - `extractKeyFromUrl` cambió de `match[1]` a `match[0]` al migrar el grupo capturador a no-capturante (`(?:...)`) para la alternancia de prefijos — los tests de borrado con dominio ajeno lo detectaron.
> - `userEvent.upload` de Testing Library **valida el atributo `accept`** y descarta archivos no permitidos sin disparar el handler → los tests de formato inválido usan `fireEvent.change` directo.
> - jsdom ignora `size` en `FilePropertyBag`: para simular un archivo > 5 MB hay que crear el contenido real (`new Uint8Array(6MB)`).
> - `setPetImageUrl` con `petData: null` en Mongo falla con `Path collision` → se traduce a 422 con mensaje claro (placas activas sin datos de mascota, 106 docs en local).
