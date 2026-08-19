---
title: "SPEC-022: Título descriptivo para items PDF de QR Multilink"
date: 2026-08-18
tags:
  - spec
  - feature
  - frontend
  - backend
  - qr
  - multilink
  - pdf
  - title
status: borrador
aliases:
  - SPEC-022
  - Título PDF Multilink
  - Título documento PDF
---

# SPEC-022: Título descriptivo para items PDF de QR Multilink

> [!abstract] Decisión clave
> Agregar un campo de texto **`title`** al item PDF de `data.urlList[]` de un QR multilink (`typeQr: 'list'`). El usuario lo llena al **crear** y **editar** el item (ej. "Menú", "Catálogo", "Carta de vinos" — lo que quiera llamar al contenido). La página pública `portaqr.cl/qr/{idQr}` renderiza el botón del PDF con **ese texto** en lugar del título fijo "Descargar PDF" de SPEC-005. El campo es **opcional** (máx. 60 caracteres): si está vacío, la landing muestra el fallback "Descargar PDF" (retrocompatibilidad total con items PDF existentes). En creación, el título viaja en el multipart de `POST /qr/list-pdf` (el item se crea con su título); en edición, viaja en el `PATCH /qr/{id}` dentro del `urlList`. El backend lo **sanitiza con `escapeHtml`** (defensa en profundidad, patrón SPEC-008) y lo valida con `@MaxLength(60)`.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-18
> - **Autor:** Equipo Plataforma QR
> - **Componentes afectados:** `backend-portaqr/` (puerto 3004 en docker-compose), `qr-app/` (puerto 3000)
> - **Alcance:** Solo items `typeUrl: 'pdf'` de QRs `typeQr: 'list'` (multilink). No aplica a otros tipos de item (`url`, `vcard`) ni a otros tipos de QR.
> - **Página pública destino:** `https://portaqr.cl/qr/{idQr}` (componente `UrlList.tsx`).
> - **Relacionado:** [[SPEC-005-pdf-multilink]], [[SPEC-002-qr-multilink-imagen]], [[SPEC-008-hardening-sanitizacion-backend-portaqr]]
>
> [!warning] Dependencia de SPEC-005 (implementada 2026-08-11)
> Esta spec **extiende** el item PDF de SPEC-005 (`{ itemId, typeUrl: 'pdf', documentUrl }`). Todo el pipeline existente (Ghostscript, R2, `POST /qr/list-pdf`, `ListPdfUploader`, límite `MAX_PDF_ITEMS_PER_QR`) queda **sin cambios**; solo se agrega el campo `title` a lo largo de la cadena. El título **no reemplaza** el nombre del archivo (que sigue sin persistirse — ver RF-17 de SPEC-005): es un texto libre del usuario sobre el contenido del documento.
>
> [!warning] Impacto de SPEC-008 (implementada)
> El `ValidationPipe` global corre con `whitelist: true` + `forbidNonWhitelisted`. **Si `title` no se declara en los DTOs, será eliminado silenciosamente** en `PATCH /qr/{id}` y en el body de `POST /qr/list-pdf` → el título nunca se persistiría (bug silencioso). El campo **debe** declararse en `ListUrlData` (create-qr.dto.ts) y en `UrlListItem` (url-item.dto.ts).

---

## 1. Objetivo

Hoy (tras SPEC-005), cada item PDF de un QR multilink se renderiza en la landing pública con el texto **fijo "Descargar PDF"** (`UrlList.tsx:360`) y el modelo no persiste ningún nombre del documento. El usuario quiere poder **nombrar el contenido** de cada PDF (ej. "Menú", "Catálogo", "Lista de precios") al crearlo o editarlo, y que la landing muestre **ese texto** en el botón.

> [!info] Independencia por PDF (2 PDFs por QR)
> El QR multilink acepta hasta **2 items PDF** (`MAX_PDF_ITEMS_PER_QR`, SPEC-005 RF-5). Cada item es **independiente** y tiene su **propio `title`**: el título es **por PDF**, no por QR. Cambiar el título de un PDF no afecta al otro, y cada botón de la landing muestra el título de su propio item.

> [!info] Cardinalidad
> Cada item PDF de `urlList[]` tiene **exactamente 0 o 1 título** (opcional). El título es **mutable** (se puede cambiar en cualquier momento vía `PATCH /qr/{id}` o al reemplazar el PDF). No hay límite de títulos por QR más allá del límite de items PDF existente (`MAX_PDF_ITEMS_PER_QR` = 2).

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-022 |
| --- | --- | --- |
| Identificar el contenido del PDF en la landing | Texto fijo "Descargar PDF" (genérico) | Título personalizado ("Menú", "Catálogo", …) |
| Diferenciar los 2 PDFs del mismo QR | Imposible (ambos dicen "Descargar PDF") | Cada botón muestra el título de su propio PDF |
| Contexto para el visitante | n/a | El visitante sabe qué va a abrir antes de tocar |
| Retrocompatibilidad | n/a | Items existentes sin título → fallback "Descargar PDF" |

### 1.2 Out of scope (no incluido en este spec)

- **Persistir el nombre del archivo original** (sigue siendo solo en-sesión — decisión SPEC-005 RF-17).
- Título para otros tipos de item (`url`, `vcard`) — el campo es exclusivo de `pdf` (ver ADR-022.1).
- Autocompletar el título desde el nombre del archivo (mejora futura, §11).
- i18n / traducción de títulos.
- Emojis o rich text en el título (solo texto plano, máx. 60 caracteres).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

#### Modelo de datos

- **RF-1**. Extender el tipo `QrUrlListItem` (en `qr.entity.ts`) con el campo `title?: string`. El item PDF queda así:
  ```ts
  {
    itemId: string,
    typeUrl: 'pdf',
    documentUrl: string,   // URL pública R2 (SPEC-005)
    title?: string,        // ⬅ NUEVO (SPEC-022 RF-1): texto descriptivo del contenido (opcional)
  }
  ```
  Los items existentes (`url`, `vcard`) y los items PDF pre-SPEC-022 (sin `title`) siguen funcionando sin cambios. **Cada item PDF (hasta 2 por QR) tiene su propio `title` independiente** — el título es por PDF, no por QR.

- **RF-2**. El campo `title` es **opcional** y **mutable**: se puede setear, cambiar y vaciar en cualquier momento vía `PATCH /qr/{id}` (edición) o al subir/reemplazar el PDF vía `POST /qr/list-pdf` (creación y reemplazo). Cambiar el título de un PDF **no afecta** al otro PDF del mismo QR (independencia por item).

- **RF-3**. **Longitud máxima: 60 caracteres** (validado en frontend con `maxLength` en el input y en backend con `@MaxLength(60)`). Si excede → `400 Bad Request`. Justificación: los títulos típicos ("Menú", "Catálogo", "Carta de vinos", "Lista de precios") son cortos; 60 cubre con holgura y evita abuso de payload.

- **RF-4**. **Exclusividad por tipo de item** (extiende RF-4 de SPEC-005 en el validador del schema):
  - `typeUrl === 'pdf'` → `title` **permitido** (opcional); exige `documentUrl`, prohíbe `url` y `vcard`.
  - `typeUrl === 'vcard'` → `title` **prohibido** (si viene → inválido).
  - resto (URL/red social) → `title` **prohibido** (si viene → inválido).
  - El título **no participa** en la exclusividad a nivel de QR (`case 'list'`).

- **RF-5**. **Sanitización**: el backend aplica `escapeHtml` (util existente `common/utils/escape-html.util.ts`, patrón SPEC-008) al título antes de persistir. React ya escapa el texto en el render (el título se pinta como texto, nunca como HTML), pero la sanitización en backend es **defensa en profundidad** contra payloads con `<script>`/HTML que pudieran llegar por otro canal (API directa, scripts, etc.).

#### Flujo de datos

- **RF-6**. **Creación de item PDF con título**: el título viaja como campo de texto del multipart de `POST /qr/list-pdf` (junto a `idQr`, `itemId`, `file`). El controller lo persiste al hacer **append** del item:
  ```ts
  [...urlList, { itemId, typeUrl: 'pdf', documentUrl: publicUrl, title: sanitizedTitle }]
  ```
  Si el título viene vacío/ausente → el item se crea sin `title` (undefined).

- **RF-7**. **Reemplazo de PDF con título**: al invocar `POST /qr/list-pdf` con un `itemId` existente, el título del body **reemplaza** al del item (si el body trae título); si el body no trae título, se **conserva** el existente. Regla:
  ```ts
  title: title !== undefined ? (title.trim() || undefined) : it.title
  ```

- **RF-8**. **Edición del título sin tocar el PDF**: el título viaja en el `PATCH /qr/{id}` dentro del `urlList` (el item PDF ya tiene `documentUrl`). El flujo existente de SPEC-005 (comparación por `itemId`, limpieza R2 al eliminar/reemplazar) **no cambia**: cambiar solo el título no dispara ninguna operación R2.

- **RF-9**. **Eliminación**: al eliminar el item PDF (PATCH sin el item), el título se elimina con él (es parte del item). Sin cambios respecto a SPEC-005 RF-15.

#### UI / UX

- **RF-10**. **Crear QR multilink** (`ListUrlRow.tsx`): cuando `row.type === 'pdf'`, además del `ListPdfUploader` se muestra un **Input de texto** con:
  - Placeholder: `"Ej: Menú, Catálogo…"`.
  - `maxLength={60}`.
  - Label visible: "Título del documento (opcional)".
  - El texto se guarda en la fila (`row.title`) y se propaga al payload vía `buildUrlList` (solo si el item tiene `documentUrl` — mismo filtro de SPEC-005) y al `POST /qr/list-pdf` en el flujo de creación (ver RF-11).
  - Cada fila PDF tiene su propio input: los 2 PDFs del QR tienen títulos **independientes**.

- **RF-11**. **Flujo de creación con título**: el título debe llegar al `POST /qr/list-pdf` aunque el item aún no tenga `documentUrl` (el item se excluye del `urlList` inicial — SPEC-005). Para eso, el estado pendiente del padre (`pendingPdfFilesRef` en `CreateQrForm.tsx`) pasa de `Map<string, File>` a `Map<string, { file: File; title?: string }>`:
  - Al seleccionar archivo → se guarda `{ file, title: '' }`.
  - Al escribir el título (con archivo pendiente) → se actualiza el título del Map (evita desincronización si el usuario escribe el título después de elegir el archivo).
  - En el submit → `uploadPendingPdfs` pasa `{ file, title }` a `qrService.uploadListPdf(idQr, itemId, file, title)`.
  - Si el usuario cambia el tipo de la fila o la elimina → se limpia la entrada del Map (comportamiento existente, sin cambios).
  - Cada entrada del Map es por `itemId` → los 2 PDFs pendientes mantienen sus títulos **independientes**.

- **RF-12**. **Editar QR multilink** (`EditQrForm` → `ListUrlForm`): el input de título se muestra igual; el sync `urlList → rows` (`useListUrlSync.ts`) **preserva `title`** (si no, se perdería al cargar un QR existente en edición — mismo bug que se corrigió para `itemId`/`documentUrl` en SPEC-005). En submit, el título viaja en el `PATCH` con el `urlList`.

- **RF-13**. **Dashboard — ancla del PDF** (`ListPdfUploader.tsx`): el título persistido del item se muestra en el ancla del dashboard cuando existe. Prioridad del texto mostrado: **título persistido** > nombre del archivo en-sesión > "Descargar PDF".

- **RF-14**. **Página pública** (`UrlList.tsx`): el botón ancla del item PDF muestra `item.title?.trim() || 'Descargar PDF'`. Si el título está vacío o ausente → fallback "Descargar PDF" (sin regresión para items existentes). El resto del render (color `bg-rose-600`, icono `pdf`, `target="_blank"`) no cambia. Cada uno de los 2 PDFs muestra **su propio título**.

### 2.2 Criterios de aceptación (CA)

- **CA-01**. Un usuario autenticado puede crear un QR `list` con un item PDF **con título**: el título se persiste en el item (`urlList[]`), y la página pública `/qr/[id]` muestra el botón con **el texto del título** (no "Descargar PDF").
- **CA-02**. Un usuario autenticado puede crear un QR `list` con un item PDF **sin título**: el item se crea sin `title` y la landing muestra el fallback "Descargar PDF" (sin regresión vs. SPEC-005).
- **CA-03**. El usuario puede editar un QR `list` existente y **cambiar el título** de un item PDF (sin re-subir el PDF): el `PATCH` con el `urlList` actualizado persiste el nuevo título y la landing lo refleja. **No se dispara ninguna operación R2** (ni upload ni delete).
- **CA-04**. El usuario puede **vaciar el título** de un item PDF: el item queda sin `title` y la landing vuelve al fallback "Descargar PDF".
- **CA-05**. En el flujo de **creación**, el título escrito junto al archivo pendiente llega al `POST /qr/list-pdf` (multipart field `title`) y el item se crea con él (verificar en Mongo que el item tiene `title`).
- **CA-06**. Un título de más de 60 caracteres es rechazado: `400 Bad Request` en backend (DTO `@MaxLength`) y bloqueado en frontend (`maxLength` en el input).
- **CA-07**. El validador del schema rechaza un item **no-PDF** que traiga `title` (exclusividad RF-4): `400 Bad Request` al persistir.
- **CA-08**. Un título con HTML/scripts (`<script>alert(1)</script>`) se persiste **escapado** (verificar en Mongo que el valor está escapado) y la landing lo renderiza como **texto plano** (sin ejecución).
- **CA-09**. Items PDF existentes (pre-SPEC-022, sin `title`) siguen renderizando "Descargar PDF" y el sync de edición no los rompe (el `title` ausente no genera errores).
- **CA-10**. El `whitelist: true` de SPEC-008 no elimina el campo: un `PATCH` con `title` en un item PDF lo persiste (el campo está declarado en los DTOs).
- **CA-11**. **Independencia por PDF**: un QR `list` con 2 items PDF puede tener títulos distintos ("Menú" y "Catálogo"); la landing muestra cada título en su botón correspondiente, y editar uno no altera el otro.

---

## 3. Decisiones de diseño (con ADR embebido)

### 3.1 ADR-022.1 — Nombre y ubicación del campo

> [!question] Contexto
> El item PDF de SPEC-005 es `{ itemId, typeUrl: 'pdf', documentUrl }`. ¿Cómo nombrar el campo de texto descriptivo y dónde vive? La plataforma es **en español** (UI), pero el código usa convención en inglés (`documentUrl`, `itemId`, `typeUrl`).

> [!tip] Alternativas consideradas
> - **A)** `name?: string` en el item. Contras: colisiona semánticamente con `name` a nivel del QR raíz (ya existe y significa otra cosa); confunde en el código y en la UI.
> - **B)** `title?: string` en el item. Pros: semánticamente "título del contenido" (concepto en español: **título** — natural para la plataforma); el código queda en inglés como el resto del codebase (`documentUrl`, `itemId`, `typeUrl`); no colisiona con nada existente; corto y claro. ✅
> - **C)** `label?: string` en el item. Contras: el concepto en español es "etiqueta", que **suena raro** en una plataforma en español; además sugiere metadata técnica del botón más que el nombre del contenido.
> - **D)** `documentName?: string`. Contras: sugiere el nombre del archivo (que explícitamente NO se persiste — SPEC-005 RF-17); más largo.

> [!success] Decisión
> **Alternativa B**: campo `title?: string` en el item de `urlList[]`. Es el texto visible del botón en la landing. Se persiste con el mismo nombre en entity, DTOs, schema y tipos del frontend (patrón de naming único de SPEC-002/005). En la UI se muestra como "Título del documento".

### 3.2 ADR-022.2 — ¿Obligatorio u opcional?

> [!question] Contexto
> ¿El título debe ser obligatorio al crear un item PDF?

> [!tip] Alternativas consideradas
> - **A)** **Obligatorio** (el item PDF no se puede crear sin título). Contras: (1) rompe la retrocompatibilidad con items PDF existentes (pre-SPEC-022) que no tienen título; (2) complica el flujo de creación (el item se crea vía `POST /qr/list-pdf` — exigir título obligaría a validar el multipart y bloquearía la subida si el usuario no lo llena); (3) UX: el usuario puede querer el texto genérico.
> - **B)** **Opcional con fallback** "Descargar PDF" en la landing. Pros: retrocompatibilidad total, flujo de creación intacto, el usuario decide. Contras: si no lo llena, la landing sigue mostrando el texto genérico (aceptable — es el comportamiento actual). ✅

> [!success] Decisión
> **Alternativa B**: `title` opcional, máx. 60 caracteres, con fallback "Descargar PDF" en la landing (RF-14). El fallback garantiza que ningún botón quede vacío o roto.

### 3.3 ADR-022.3 — Transporte del título en creación (multipart vs. PATCH posterior)

> [!question] Contexto
> En el flujo de **creación**, el item PDF no existe en Mongo hasta que `POST /qr/list-pdf` lo agrega (SPEC-005: el `urlList` inicial excluye items pdf sin `documentUrl`). ¿Cómo llega el título al item?

> [!tip] Alternativas consideradas
> - **A)** El título viaja como campo de texto del **multipart** de `POST /qr/list-pdf` (junto a `idQr`, `itemId`, `file`). Pros: el item se crea **en una sola operación** con su título; no hay ventana donde el item exista sin título; el frontend no necesita un segundo request. Contras: el título debe sincronizarse con el `File` pendiente en el estado del form (RF-11). ✅
> - **B)** El item se crea sin título y luego un `PATCH` lo agrega. Contras: dos operaciones, ventana de inconsistencia, más código en el flujo de creación.
> - **C)** El título viaja en el `urlList` inicial del `POST /qr` (aunque el item no tenga `documentUrl`). Contras: rompe el validador del schema (SPEC-005: pdf sin `documentUrl` → inválido) — requeriría relajar la validación, riesgo de items huérfanos.

> [!success] Decisión
> **Alternativa A**: el título es un campo de texto del multipart de `POST /qr/list-pdf` (RF-6). En edición/reemplazo, el título viaja en el `PATCH` con el `urlList` (RF-7/RF-8) — el flujo existente no cambia.

---

## 4. Cambios por capa

### 4.1 Backend — `backend-portaqr/src/modules/qr/`

#### 4.1.1 Dominio — `domain/entities/qr.entity.ts`

Extender `QrUrlListItem` (líneas 9-15):

```ts
export interface QrUrlListItem {
  itemId?: string;            // SPEC-005 RF-12
  vcard?: unknown;
  url?: string;
  documentUrl?: string | null; // SPEC-005 RF-2
  title?: string;             // ⬅ NUEVO (SPEC-022 RF-1): texto descriptivo del contenido (solo typeUrl === 'pdf')
  typeUrl: string;
}
```

#### 4.1.2 DTOs

> [!important] Obligatorio por `whitelist: true` de SPEC-008
> Si `title` no se declara en los DTOs, `forbidNonWhitelisted`/`whitelist` lo eliminará en `PATCH /qr/{id}` y en el body de `POST /qr/list-pdf` → el título nunca se persistiría.

**`application/dto/create-qr.dto.ts`** — clase `ListUrlData` (líneas 154-178), agregar tras `documentUrl`:

```ts
@ValidateIf((o) => o.typeUrl === 'pdf')
@IsOptional()
@IsString({ message: 'El título del documento debe ser una cadena de texto' })
@MaxLength(60, { message: 'El título del documento no puede exceder los 60 caracteres' })
title?: string; // SPEC-022 RF-1/RF-3: texto descriptivo del contenido (solo typeUrl === 'pdf')
```

> [!note] `@ValidateIf((o) => o.typeUrl === 'pdf')`
> El título solo aplica a items PDF (ADR-022.1). Para otros tipos, el campo se ignora en el DTO; la **prohibición** la garantiza el validador del schema (RF-4, §4.1.3) — mismo patrón que `documentUrl` en SPEC-005.

**`application/dto/url-item.dto.ts`** — clase `UrlListItem` (respuestas Swagger / redirección pública), agregar:

```ts
@ApiProperty({
  type: String,
  required: false,
  description: "Texto descriptivo del contenido del PDF (solo typeUrl === 'pdf', máx. 60 caracteres)"
})
title?: string;
```

**`application/dto/update-qr.dto.ts`** — `UpdateQrDto extends PartialType(CreateQrDto)` ya existente; `title` viaja automáticamente (verificar que `@IsOptional` tolera `undefined` — sí, es opcional).

#### 4.1.3 Schema Mongoose — `infrastructure/repository/mongo/schemas/qr.schema.ts`

**Campo en `urlList`** (dentro del `type: [{...}]`, líneas 117-130):

```ts
urlList: {
  type: [{
    itemId: { type: String, required: false }, // SPEC-005 RF-12
    vcard: { type: SchemaTypes.Mixed },
    url: { type: String },
    documentUrl: { type: String, required: false, default: null }, // SPEC-005 RF-2
    title: { type: String, required: false }, // ⬅ NUEVO (SPEC-022 RF-1)
    typeUrl: { type: String },
  }],
  required: false,
  default: undefined,
  _id: false,
},
```

**Tipo TS declarado** de `data.urlList` (líneas 242-248): agregar `title?: string;`.

**Validador `validateQrDataFields` — `case 'list'`** (líneas 41-65): extender la exclusividad por item (RF-4):

```ts
case 'list': {
  if (!value.urlList) return false;
  let pdfCount = 0;
  for (const item of value.urlList) {
    if (item.typeUrl === 'pdf') {
      // PDF: exige documentUrl, prohíbe url y vcard; title PERMITIDO (opcional, SPEC-022 RF-4)
      if (!item.documentUrl || item.url || item.vcard) return false;
      pdfCount += 1;
    } else if (item.typeUrl === 'vcard') {
      // vCard: exige vcard, prohíbe url, documentUrl y title (SPEC-022 RF-4)
      if (!item.vcard || item.url || item.documentUrl || item.title) return false;
    } else {
      // URL/red social: exige url, prohíbe vcard, documentUrl y title (SPEC-022 RF-4)
      if (!item.url || item.vcard || item.documentUrl || item.title) return false;
    }
  }
  if (pdfCount > getMaxPdfItemsPerQr()) return false; // RF-5 SPEC-005 (sin cambios)
  return !value.url && !value.whatsappUrl && !value.emailUrl && !value.phoneUrl
    && !value.wifiData && !value.text && !value.vcardData && !value.petData
    && !value.mapUrl;
}
```

> [!note] El título no participa en la exclusividad a nivel de QR
> `listImageUrl` y `title` son los únicos campos "libres" del `case 'list'` (el título vive dentro de los items, no a nivel de `QrData`).

#### 4.1.4 Controller — `presentation/controllers/qr.controller.ts` (`POST /qr/list-pdf`, líneas 258-387)

**Sanitización**: importar `escapeHtml` de `common/utils/escape-html.util.ts` (patrón SPEC-008) y agregar un helper local:

```ts
/** SPEC-022 RF-5: sanitiza el título (escape-html) y normaliza vacíos a undefined. */
function sanitizePdfTitle(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return escapeHtml(trimmed);
}
```

**Firma del método**: agregar `@Body('title') title?: string`:

```ts
async uploadListPdf(
  @UploadedFile() file: Express.Multer.File,
  @Body('idQr') idQr: string,
  @Body('itemId') itemId: string,
  @Body('title') title?: string, // ⬅ NUEVO (SPEC-022 RF-6/RF-7)
  @GetUser() user: User,
  @Tracking() tracking: TrackingContext,
): Promise<{ documentUrl: string; size: number; itemId: string; title?: string }> {
```

**Persistencia del título** (paso 5, líneas 362-365) — append y reemplazo:

```ts
const sanitizedTitle = sanitizePdfTitle(title);

// 5. Actualizar el item en urlList (RF-13 paso 9): reemplazo por itemId o append
const updatedUrlList = isReplacement
  ? urlList.map((it) => (it.itemId === itemId
      ? {
          ...it,
          documentUrl: publicUrl,
          // SPEC-022 RF-7: si el body trae título, reemplaza; si no, conserva el existente
          title: sanitizedTitle !== undefined ? sanitizedTitle : it.title,
        }
      : it))
  : [...urlList, {
      itemId,
      typeUrl: 'pdf',
      documentUrl: publicUrl,
      title: sanitizedTitle, // SPEC-022 RF-6: el item se crea con su título (o sin él)
    }];
```

**Respuesta**: incluir `title` en el return (línea 386) y en el `@ApiResponse`/`@ApiBody` de Swagger (agregar `title: { type: 'string', description: 'Texto descriptivo del contenido (opcional, máx. 60)' }` al schema del `@ApiBody`).

> [!note] Sin cambios en `PATCH /qr/:id`
> La limpieza R2 de SPEC-005 (§4.1.6) compara por `itemId` y `documentUrl` — el título no interviene. Cambiar solo el título no dispara operaciones R2 (RF-8).

#### 4.1.5 Mapper — `infrastructure/repository/mongo/mappers/qr-mongo.mapper.ts`

Sin cambios: el mapper es pass-through de `data` (SPEC-005 §4.1.7) — `title` viaja automáticamente al estar en el schema. La generación de `itemId` al vuelo no se toca.

### 4.2 Frontend — `qr-app/src/`

#### 4.2.1 Tipos — `interfaces/qr.ts`

**`ListUrlData`** (líneas 137-143) y **`UrlListItem`** (líneas 146-152): agregar `title`:

```ts
export interface ListUrlData {
  itemId?: string;               // SPEC-005 (RF-12)
  url?: string;
  vcard?: VCardData;
  documentUrl?: string | null;   // SPEC-005 (solo typeUrl === 'pdf')
  title?: string;                // ⬅ NUEVO (SPEC-022): texto descriptivo del contenido (solo typeUrl === 'pdf')
  typeUrl: string;
}

export interface UrlListItem {
  itemId?: string;
  url?: string;
  vcard?: VCardData;
  documentUrl?: string | null;
  title?: string;                // ⬅ NUEVO (SPEC-022)
  typeUrl: string;
}
```

#### 4.2.2 Helpers — `components/qr/forms/ListUrlForm.helpers.ts`

**Tipo `ListUrlRow`** (líneas 35-49): agregar `title`:

```ts
export interface ListUrlRow {
  id: string;
  type: string;
  url: string;
  vcard?: VCardData;
  itemId?: string;               // SPEC-005 (RF-12)
  documentUrl?: string | null;   // SPEC-005
  pdfFile?: File | null;         // SPEC-005 (creación)
  title?: string;                // ⬅ NUEVO (SPEC-022 RF-10): texto descriptivo del item PDF
}
```

**`buildUrlList`** (líneas 209-251): emitir `title` en el item PDF (solo si el item tiene `documentUrl` — mismo filtro de SPEC-005):

```ts
if (row.type === 'pdf') {
  return {
    itemId: row.itemId,
    typeUrl: 'pdf',
    documentUrl: row.documentUrl ?? null,
    title: row.title?.trim() || undefined, // ⬅ NUEVO (SPEC-022 RF-10): undefined si vacío
  };
}
```

> [!note] Constante de longitud
> Agregar `export const PDF_TITLE_MAX_LENGTH = 60;` en este archivo (patrón de `MAX_PDF_ITEMS_PER_QR`) para usarla en el input (`maxLength`) y en la validación cliente.

#### 4.2.3 Fila — `components/qr/forms/ListUrlRow.tsx`

En el bloque `row.type === 'pdf'` (líneas 118-131), agregar el Input de título **arriba** del `ListPdfUploader` (contenedor en columna):

```tsx
{row.type === 'pdf' && (
  <div className="flex w-full flex-col gap-2">
    {/* SPEC-022 (RF-10): título del documento — texto descriptivo del contenido */}
    <Input
      value={row.title ?? ''}
      onChange={(e) => onPdfTitleChange(index, e.target.value)}
      placeholder="Ej: Menú, Catálogo…"
      maxLength={PDF_TITLE_MAX_LENGTH}
      className="w-full"
    />
    <ListPdfUploader
      idQr={listPdfIdQr}
      itemId={row.itemId ?? ''}
      currentPdfUrl={row.documentUrl ?? null}
      fileName={row.pdfFile?.name}
      title={row.title} // ⬅ NUEVO (SPEC-022 RF-13): título persistido para el ancla del dashboard
      onChange={(url) => onPdfDocumentUrlChange(index, url)}
      onFileSelected={(file) => onPdfFileSelected(index, file)}
      onError={onPdfError}
    />
  </div>
)}
```

**Props nuevas** de `ListUrlRowProps`:

```ts
/** SPEC-022 (RF-10): actualiza el título del item PDF en la fila. */
onPdfTitleChange: (index: number, value: string) => void;
```

#### 4.2.4 Form — `components/qr/forms/ListUrlForm.tsx`

**Props nuevas** (junto a `onPdfFileSelected`, líneas 34-38):

```ts
/** SPEC-022 (RF-11): título del item PDF pendiente (creación) — sincroniza el Map del padre. */
onPdfTitleChange?: (itemId: string, title: string) => void;
```

**Handler nuevo** (junto a `handlePdfFileSelected`, líneas 191-198):

```ts
/** SPEC-022 (RF-10/RF-11): actualiza el título de la fila; si hay File pendiente
 *  (creación), notifica al padre para que el POST /qr/list-pdf lo incluya. */
const handlePdfTitleChange = useCallback((index: number, value: string) => {
  const newRows = [...rows];
  newRows[index].title = value;
  setRows(newRows);
  updateUrlList(newRows);
  // Creación: el item aún no tiene documentUrl (excluido de urlList) — el título
  // debe viajar con el File pendiente en el Map del padre (RF-11).
  if (newRows[index].pdfFile && newRows[index].itemId) {
    onPdfTitleChange?.(newRows[index].itemId, value);
  }
}, [rows, updateUrlList, onPdfTitleChange, setRows]);
```

Pasar `onPdfTitleChange={handlePdfTitleChange}` al `ListUrlRow` (líneas 229-245).

#### 4.2.5 Sync — `components/qr/forms/useListUrlSync.ts`

Preservar `title` en el mapeo `urlList → rows` (líneas 33-47):

```ts
setRows(urlList.map((item, index) => {
  return {
    id: item.itemId ?? `row-${index}`,
    type: socialTypes.find(s => s.name === item.typeUrl)?.id || item.typeUrl,
    url: item.url || '',
    vcard: item.vcard,
    itemId: item.itemId,
    documentUrl: item.documentUrl ?? null,
    title: item.title, // ⬅ NUEVO (SPEC-022 RF-12): preservar — si no, se pierde al editar
  };
}));
```

#### 4.2.6 Uploader — `components/qr/ListPdfUploader.tsx`

**Prop nueva** `title?: string` (título persistido del item) y prioridad del texto del ancla (línea 128):

```ts
interface ListPdfUploaderProps {
  // ...existentes...
  /** SPEC-022 (RF-13): título persistido del item (edición) — se muestra en el ancla. */
  title?: string;
}

// SPEC-022 (RF-13): prioridad — título persistido > nombre en-sesión > fallback.
const displayName = title?.trim() || fileName ?? sessionFileName ?? 'Descargar PDF';
```

#### 4.2.7 Servicio — `services/qr.service.ts` (`uploadListPdf`, líneas 211-250)

Agregar parámetro `title` y el campo al FormData:

```ts
async uploadListPdf(
  idQr: string,
  itemId: string,
  file: File,
  title?: string, // ⬅ NUEVO (SPEC-022 RF-6): texto descriptivo del contenido
  onProgress?: (pct: number) => void,
): Promise<{ documentUrl: string; size: number; itemId: string; title?: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('idQr', idQr);
    formData.append('itemId', itemId);
    formData.append('file', file);
    if (title) formData.append('title', title); // ⬅ NUEVO (SPEC-022)
    // ...resto sin cambios (XHR + onProgress)...
  });
}
```

> [!note] API route `/api/qr/list-pdf/route.ts`
> Sin cambios: reenvía el FormData tal cual al backend — el campo `title` viaja automáticamente.

#### 4.2.8 Flujo de creación — `CreateQrForm.tsx`, `CreateQrForm.helpers.ts`, `CreateQrForm.actions.ts`

**`CreateQrForm.tsx`** (líneas 44-65): el Map pendiente pasa a guardar `{ file, title }`:

```ts
// SPEC-005 (RF-17) + SPEC-022 (RF-11): archivos PDF pendientes keyed por itemId,
// ahora con su título (el item aún no existe en Mongo — el título viaja en el multipart).
const pendingPdfFilesRef = useRef<Map<string, { file: File; title?: string }>>(new Map());

const handlePdfFileSelected = useCallback((itemId: string, file: File | null) => {
  if (file) {
    pendingPdfFilesRef.current.set(itemId, { file, title: '' });
  } else {
    pendingPdfFilesRef.current.delete(itemId);
  }
  dispatch({ type: 'SET_FIELD', field: 'pendingPdfCount', value: pendingPdfFilesRef.current.size });
}, [dispatch]);

// SPEC-022 (RF-11): actualiza el título del item pendiente (el usuario puede
// escribir el título después de elegir el archivo).
const handlePdfTitleChange = useCallback((itemId: string, title: string) => {
  const pending = pendingPdfFilesRef.current.get(itemId);
  if (pending) {
    pendingPdfFilesRef.current.set(itemId, { ...pending, title });
  }
}, []);
```

Pasar `onPdfTitleChange={handlePdfTitleChange}` a `CreateQrFormFields` → `ListUrlForm` (línea 151).

**`CreateQrForm.helpers.ts`** — `uploadPendingPdfs` (líneas 318-329): pasar el título al upload:

```ts
export async function uploadPendingPdfs(
  qrId: string,
  files: Map<string, { file: File; title?: string }>, // ⬅ SPEC-022
  upload: (qrId: string, itemId: string, file: File, title?: string) => Promise<unknown>,
): Promise<unknown[]> {
  const results = await Promise.allSettled(
    Array.from(files.entries()).map(([itemId, pending]) =>
      upload(qrId, itemId, pending.file, pending.title),
    ),
  );
  return results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason);
}
```

**`CreateQrForm.actions.ts`** (líneas 89-95): sin cambios de lógica — `uploadPendingPdfs` ya recibe el Map con la nueva forma y `qrService.uploadListPdf` acepta el título.

#### 4.2.9 Página pública — `components/qr/UrlList.tsx`

Botón ancla del item PDF (líneas 346-363): mostrar el título con fallback:

```tsx
if (item.typeUrl === 'pdf' && item.documentUrl) {
  return (
    <a
      key={item.itemId || `pdf-${item.documentUrl}`}
      href={item.documentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        flex items-center justify-center gap-3 px-6 py-4 rounded-lg
        text-white font-medium transition-all duration-200
        ${getColorForType(item.typeUrl)}
      `}
    >
      <Icon name={getIconForType(item.typeUrl)} className="w-6 h-6" />
      {/* SPEC-022 (RF-14): título del usuario con fallback "Descargar PDF" */}
      <span>{item.title?.trim() || 'Descargar PDF'}</span>
    </a>
  );
}
```

> [!note] React escapa el texto
> El título se pinta como texto JSX (`{item.title}`) — React lo escapa automáticamente. La sanitización del backend (RF-5) es defensa en profundidad para el caso de consumo por API directa.

---

## 5. Variables de entorno (`.env`)

**Sin cambios.** No se requieren variables nuevas:
- Backend: `PDF_MAX_UPLOAD_SIZE`, `MAX_PDF_ITEMS_PER_QR` (SPEC-005) siguen igual.
- Frontend: `NEXT_PUBLIC_MAX_PDF_ITEMS_PER_QR`, `NEXT_PUBLIC_PDF_MAX_UPLOAD_SIZE` (SPEC-005) siguen igual.
- La longitud máxima del título (60) es una constante de código (`PDF_TITLE_MAX_LENGTH` en `ListUrlForm.helpers.ts`), no una env var — no amerita configuración.

---

## 6. Configuración (Docker / R2 / Cloudflare)

**Sin cambios.** No se instala nada nuevo (el título es texto plano, no un archivo). Ghostscript, R2 y el bucket `portaqr-assets` quedan como en SPEC-005.

---

## 7. Plan de implementación (tareas)

> [!todo] Tareas
> Registrar como tareas en `docs/tareas/SPEC-022-tareas.json` (formato Taskmaster-compatible). Estimación ~2-2.5 días.

| ID | Tarea | Capa | Estimación |
| --- | --- | --- | --- |
| T-022-00 | Crear `docs/tareas/SPEC-022-tareas.json` + rama `feat/spec-022-title-pdf-multilink` | Infra | 0.25d |
| T-022-01 | Backend: entity `QrUrlListItem.title` + DTOs (`ListUrlData` con `@MaxLength(60)`, `UrlListItem`) + schema (campo, tipo TS, validador exclusividad title) | Backend | 0.5d |
| T-022-02 | Backend: controller `POST /qr/list-pdf` — `@Body('title')`, `sanitizePdfTitle` (escape-html), persistencia append/reemplazo, Swagger | Backend | 0.5d |
| T-022-03 | Frontend: tipos (`interfaces/qr.ts`) + helpers (`ListUrlRow.title`, `buildUrlList`, `PDF_TITLE_MAX_LENGTH`) + sync (`useListUrlSync`) | Frontend | 0.25d |
| T-022-04 | Frontend: `ListUrlRow.tsx` (Input título) + `ListUrlForm.tsx` (handler) + `ListPdfUploader.tsx` (prop title) | Frontend | 0.5d |
| T-022-05 | Frontend: flujo creación — `CreateQrForm.tsx` (Map `{file, title}` + `handlePdfTitleChange`), `CreateQrForm.helpers.ts` (`uploadPendingPdfs`), `qr.service.ts` (`uploadListPdf` con title) | Frontend | 0.5d |
| T-022-06 | Frontend: `UrlList.tsx` — render `item.title?.trim() || 'Descargar PDF'` | Frontend | 0.1d |
| T-022-07 | Tests backend: DTO (title válido/60+/no-pdf), validador schema (exclusividad), controller list-pdf (append/reemplazo/sanitización) | Backend | 0.5d |
| T-022-08 | Tests frontend: `buildUrlList` (title emitido), `useListUrlSync` (title preservado), `UrlList` (title/fallback), `uploadPendingPdfs` (title pasado), `ListPdfUploader` (prioridad displayName) | Frontend | 0.5d |
| T-022-09 | Tests E2E: crear QR con PDF + título → landing muestra título; editar título → landing actualizado; 2 PDFs con títulos independientes | QA | 0.5d |
| T-022-10 | Validación: tsc, lint, build, suites completas + cierre (SPEC a implementado, commits, merge) | Docs/QA | 0.25d |

---

## 8. Testing

### 8.1 Backend

- **DTO `ListUrlData`**: title válido (≤60) pasa; title >60 → error `@MaxLength`; title en item no-pdf → ignorado por `@ValidateIf` (la prohibición la da el schema).
- **Validador del schema (`case 'list'`)**: item `pdf` con `title` → válido; item `vcard`/URL con `title` → inválido (exclusividad RF-4); items legacy (url/vcard/pdf sin title) siguen pasando (sin regresión).
- **Controller `POST /qr/list-pdf`** (unitario + integración supertest):
  - Append con `title` → el item se persiste con `title` (verificar `updateQrUseCase.execute` recibió el item con title).
  - Append sin `title` → item sin title (undefined).
  - Reemplazo con `title` → reemplaza el existente.
  - Reemplazo sin `title` → conserva el existente.
  - Title con `<script>` → persistido escapado (`escapeHtml`).
  - Title con solo espacios → `undefined` (no se persiste).
- **`PATCH /qr/:id`**: cambiar solo el title no invoca `deleteObject` (mock de `StorageService` — verificar que no se llama).

### 8.2 Frontend

- **`buildUrlList`**: row pdf con `documentUrl` + title → emite `{ itemId, typeUrl: 'pdf', documentUrl, title }`; title vacío → `title: undefined`; row pdf sin `documentUrl` → sigue excluida (regresión SPEC-005).
- **`useListUrlSync`**: un `urlList` con item pdf con title → la row resultante preserva `title`.
- **`UrlList`**: item pdf con `title` → el botón muestra el título; sin title → "Descargar PDF"; title con HTML → renderizado como texto plano (React escapa).
- **`ListPdfUploader`**: `displayName` prioriza `title` > `fileName` > `sessionFileName` > "Descargar PDF".
- **`uploadPendingPdfs`**: pasa `title` al upload (mock de `upload` verificando el 4º argumento).
- **`CreateQrForm`**: `handlePdfTitleChange` actualiza el title del Map pendiente; `handlePdfFileSelected` guarda `{ file, title: '' }`.
- **Independencia por PDF (CA-11)**: un QR con 2 items PDF con títulos distintos → cada fila conserva su propio title en el sync y en `buildUrlList`.

### 8.3 E2E (Playwright, `e2e-tests-portaqr/`)

- Crear QR multilink con item PDF + título "Menú" → la landing `/qr/[id]` muestra el botón con "Menú" (mock de `/api/qr/list-pdf`).
- Editar el QR y cambiar el título a "Carta" → la landing muestra "Carta".
- Crear item PDF sin título → la landing muestra "Descargar PDF" (sin regresión).
- QR con 2 PDFs con títulos "Menú" y "Catálogo" → la landing muestra ambos títulos en sus botones respectivos (CA-11).

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| `whitelist: true` de SPEC-008 elimina `title` en PATCH/list-pdf si no está en los DTOs | Alta | Alto | Declarar `title` en `ListUrlData` y `UrlListItem` (§4.1.2) + test de integración PATCH con title |
| Title con HTML/scripts (XSS) | Media | Bajo | `escapeHtml` en backend (RF-5) + React escapa en render (CA-08) |
| Desincronización title↔file en creación (title escrito después de elegir archivo) | Media | Medio | `handlePdfTitleChange` actualiza el Map pendiente (RF-11) + test unitario |
| Title perdido en el sync `urlList→rows` (edición) | Media | Medio | Preservar `title` en `useListUrlSync` (§4.2.5) + test (mismo bug que itemId/documentUrl en SPEC-005) |
| Items PDF existentes sin title | Alta | Bajo | Fallback "Descargar PDF" (RF-14) — sin migración ni regresión |
| Title demasiado largo (abuso de payload) | Baja | Bajo | `@MaxLength(60)` backend + `maxLength` frontend (RF-3) |
| Title en items no-PDF (payload manipulado) | Baja | Bajo | Exclusividad en el validador del schema (RF-4) → 400 |
| Confundir el title de un PDF con el del otro (2 PDFs por QR) | Baja | Medio | El title vive en el item (por `itemId`); cada fila/Map entry es independiente (RF-1/RF-11) + test CA-11 |

---

## 10. Observabilidad

> [!note] Patrón unificado (SPEC-005 §10)
> `TraceService`/`TraceLayer` para logs request-scoped; `Logger` de NestJS para servicios internos.

- **Logs request-scoped** en `POST /qr/list-pdf` (controller):
  - `INFO`: `pdf_upload_received` con `{ userId, idQr, itemId, hasTitle: boolean }` (no loguear el título completo — texto del usuario; solo indicar presencia).
  - `INFO`: `pdf_uploaded` con `{ idQr, itemId, key, bytes, hasTitle }`.
- **Logs request-scoped** en `PATCH /qr/:id`: sin cambios (el título no dispara operaciones R2).
- **Métricas** (cuando existan):
  - `qr_list_pdf_with_title_total` (proporción de items PDF con título — señal de adopción del feature).

---

## 11. Trabajo futuro (out of scope)

### 11.1 Autocompletar título desde el nombre del archivo
Al seleccionar el PDF, pre-rellenar el input con el nombre del archivo sin extensión (el usuario lo puede editar). Requiere solo frontend.

### 11.2 Título para otros tipos de item
Extender `title` a items `url`/`vcard` (hoy exclusivo de `pdf` — ADR-022.1). Requiere relajar la exclusividad del validador y decidir el render en la landing (hoy los botones usan `getDisplayName(typeUrl)`).

### 11.3 Emojis / rich text en el título
Hoy solo texto plano (60 chars). Si se requiere, evaluar `@MaxLength` mayor + sanitización extendida.

---

## 12. Glosario

| Término | Significado |
| --- | --- |
| **Título** | Campo de texto opcional del item PDF que describe el contenido del documento (ej. "Menú", "Catálogo"). Se muestra como texto del botón en la landing. Cada item PDF (hasta 2 por QR) tiene su propio título independiente. |
| **Item PDF** | Item de `urlList[]` con `typeUrl: 'pdf'` y `documentUrl` (SPEC-005). |
| **Fallback** | Texto "Descargar PDF" que se muestra cuando el item PDF no tiene título (comportamiento pre-SPEC-022). |
| **`escapeHtml`** | Util de sanitización de `backend-portaqr/src/common/utils/escape-html.util.ts` (SPEC-008) que escapa caracteres HTML (`<`, `>`, `&`, `"`, `'`). |

---

## 13. Referencias

- [[SPEC-005-pdf-multilink]] — item PDF de QR multilink (base de esta spec: modelo, endpoint `POST /qr/list-pdf`, `ListPdfUploader`, texto fijo "Descargar PDF" que se reemplaza).
- [[SPEC-002-qr-multilink-imagen]] — patrón de campos opcionales en `QrData` y render con fallback en la landing.
- [[SPEC-008-hardening-sanitizacion-backend-portaqr]] — `ValidationPipe` con `whitelist: true` (obligación de declarar campos en DTOs) y util `escapeHtml`.
- Archivos reales verificados 2026-08-18:
  - `backend-portaqr/src/modules/qr/domain/entities/qr.entity.ts` (L9-15)
  - `backend-portaqr/src/modules/qr/application/dto/create-qr.dto.ts` (L154-178)
  - `backend-portaqr/src/modules/qr/application/dto/url-item.dto.ts` (L3-34)
  - `backend-portaqr/src/modules/qr/infrastructure/repository/mongo/schemas/qr.schema.ts` (L41-65, L117-130, L242-248)
  - `backend-portaqr/src/modules/qr/presentation/controllers/qr.controller.ts` (L258-387)
  - `qr-app/src/interfaces/qr.ts` (L137-152)
  - `qr-app/src/components/qr/forms/ListUrlForm.helpers.ts` (L35-49, L209-251)
  - `qr-app/src/components/qr/forms/ListUrlRow.tsx` (L118-131)
  - `qr-app/src/components/qr/forms/ListUrlForm.tsx` (L34-38, L191-198)
  - `qr-app/src/components/qr/forms/useListUrlSync.ts` (L33-47)
  - `qr-app/src/components/qr/ListPdfUploader.tsx` (L128)
  - `qr-app/src/components/qr/UrlList.tsx` (L346-363)
  - `qr-app/src/services/qr.service.ts` (L211-250)
  - `qr-app/src/components/qr/CreateQrForm.tsx` (L44-65), `CreateQrForm.helpers.ts` (L318-329), `CreateQrForm.actions.ts` (L89-95)