---
title: "SPEC-023-B: Blog avanzado — autores (E-E-A-T), TOC, CTA, artículos relacionados, schema BlogPosting y créditos de imagen"
date: 2026-08-20
tags:
  - spec
  - blog
  - cms
  - payload
  - seo
  - schema
  - toc
  - autores
status: implementado
aliases:
  - SPEC-023-B
  - Blog avanzado
---

# SPEC-023-B: Blog avanzado — autores (E-E-A-T), TOC, CTA, artículos relacionados, schema BlogPosting y créditos de imagen

> [!abstract] Decisión clave
> El blog ya cubre los elementos esenciales (título, extracto, portada, tags, tiempo de lectura, SEO meta, imágenes WebP con srcSet). Esta spec cierra las brechas de **contenido/estructura, SEO técnico e interactividad**: **autores como colección** (E-E-A-T: bio, avatar, URL), **fecha de última actualización visible**, **tabla de contenidos (TOC)** generada desde los headings del contenido, **bloque CTA** en el editor, **artículos relacionados** por categoría, **schema `BlogPosting`** completo (publisher + autor + imagen absoluta), **créditos/descripción larga** en las imágenes y el **rediseño del listado `/blog`**: el filtro principal pasa a ser por **categoría** (donde hoy están los tags) y los **tags** se mueven a una **sección propia debajo del grid** ("Explora por etiquetas"), con la categoría **clicable** en tarjetas y detalle. **Comentarios y valoraciones quedan fuera de alcance** (decisión del usuario — requieren moderación y gestión de datos personales).

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-20)
> - **Fecha:** 2026-08-20
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-cms/` (colección Authors + bloque CTA + campos Media/Posts) + `desarrollo-qr/qr-app/` (TOC, card de autor, CTA, relacionados, schema)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (base), [[SPEC-023-A-imagenes-cms-blog]] (imágenes — esta la extiende)

---

## 1. Objetivo

Completar los elementos de un blog de calidad (contenido, SEO técnico e interactividad) que aún no existen en el CMS ni en el frontend, sin tocar lo ya implementado.

**Qué resuelve vs. el estado actual (SPEC-023 + SPEC-023-A):**

| Elemento (checklist) | Hoy | Con la SPEC-023-B |
|---|---|---|
| Autor con E-E-A-T | Campo `author` texto libre (sin bio, avatar ni URL) | **Colección `authors`** (name, slug, bio, avatar, url) + relación en posts + card de autor + schema Person con URL |
| Fecha de última actualización | `updatedAt` existe (Payload) y va en JSON-LD/OG, **pero no se muestra al lector** | **Visible en el header del post** cuando difiere de la publicación |
| Tabla de contenidos (TOC) | No existe | **TOC automático** desde los headings h2/h3 del contenido (anclas + scroll suave), sidebar en desktop, colapsable en móvil, desactivable por post |
| CTA (llamado a la acción) | No existe | **Bloque Lexical `cta`** (título, texto, botón con URL) — puede ir a mitad o al final del artículo |
| Artículos relacionados | No existe | **Sección al final del post** con posts de la misma categoría (fallback por tag), máx. 3 |
| Schema Markup | JSON-LD `Article` genérico (sin publisher, sin URL de autor, imagen relativa) | **`BlogPosting`** con `publisher` (Organization + logo), `author` Person con URL, imagen absoluta, `mainEntityOfPage` WebPage |
| Créditos / descripción larga de imagen | No existen | Campos `credits` (fuente/fotógrafo/licencia) y `longDescription` en `media`; el crédito se muestra como caption |
| Comentarios / valoraciones | No existen | **Fuera de alcance** (decisión del usuario — a evaluar a futuro) |
| Filtro del listado `/blog` | Filtro por **tags** (chips) arriba; la categoría es texto no clicable | **Filtro por categoría** arriba (chips → `/blog?category=<slug>`), **sección de tags** debajo del grid, categoría **clicable** en tarjetas y detalle |

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Colección `authors` — E-E-A-T)**. Nueva colección `authors` con: `name` (text, requerido), `slug` (text, requerido, único), `bio` (textarea, opcional), `avatar` (upload → media, opcional), `url` (text, opcional — página del autor o perfil externo). El campo `author` de `posts` cambia de `text` a `relationship → authors` (opcional). El frontend muestra el autor con avatar y bio (card al final del post) y el schema lo vincula como `Person` con `url`.
- **RF-2 (Fecha de última actualización visible)**. En el header del post se muestra **"Actualizado: {fecha}"** cuando `updatedAt` > `publishedAt` + margen de 1 día (evita mostrar "actualizado" por cambios triviales inmediatos al publicar). El `dateModified` del schema ya usa `updatedAt` (sin cambios).
- **RF-3 (Tabla de contenidos — TOC)**. Se genera automáticamente desde los headings `h2`/`h3` del contenido Lexical:
  - Función pura `extractHeadings(content)` → `[{ id, text, level }]` (solo h2/h3, en orden de aparición).
  - Los headings del renderer reciben `id` de ancla (mismo algoritmo → los enlaces funcionan) y `scroll-mt-20` (compensa el header fixed ~65px).
  - El TOC se muestra **solo si hay ≥ 3 headings** y el post no lo desactiva.
  - Layout: **sidebar sticky en desktop** (`lg:grid-cols-[minmax(0,1fr)_260px]`); en móvil, **bloque colapsable** (`<details>`) al inicio del contenido.
  - Campo `tocEnabled` (checkbox, default `true`, sidebar del admin) en `posts` para desactivarlo por artículo.
- **RF-4 (Bloque CTA)**. Nuevo bloque Lexical `cta` con campos: `title` (text, requerido), `text` (textarea, opcional), `buttonLabel` (text, requerido), `buttonUrl` (text, requerido). Se registra en `BlocksFeature` junto a `imageLayout`. El renderer muestra una card destacada con título, texto y botón.
- **RF-5 (Artículos relacionados)**. Al final del post, sección "Artículos relacionados" con **máx. 3 posts publicados de la misma categoría** (excluyendo el actual, ordenados por `-publishedAt`). Si el post no tiene categoría, fallback: posts que compartan el **primer tag**. Si no hay resultados, la sección no se muestra.
- **RF-6 (Schema `BlogPosting`)**. El JSON-LD generado en `[slug]/page.tsx` pasa de `Article` a **`BlogPosting`** e incluye:
  - `headline`, `description`, `image` (**URL absoluta** — si es relativa se antepone `baseUrl`).
  - `datePublished`, `dateModified` (ISO 8601).
  - `author`: `Person` con `name` y `url` (si el autor tiene URL).
  - `publisher`: `Organization` con `name: 'Porta QR'` y `logo` (`{baseUrl}/icon.png`).
  - `mainEntityOfPage`: `WebPage` con `@id` absoluto.
  - Se mantiene el override `structuredData` del editor (plugin-seo) y la sanitización `<` → `\u003c`.
- **RF-7 (Créditos y descripción larga de imagen)**. La colección `media` agrega:
  - `credits` (text, opcional): fuente/fotógrafo/licencia (ej. "Foto: Unsplash — @fotografo").
  - `longDescription` (textarea, opcional): descripción extendida para infografías/gráficos complejos (metadata; no se muestra por defecto).
  - El frontend muestra `credits` como caption secundario ("Crédito: …") en los layouts de imagen cuando existe.
- **RF-8 (Rediseño del listado `/blog` — categorías protagonistas, tags en sección propia)**. El listado pasa de filtrar por tags a filtrar por **categoría**:
  - **Comportamiento de navegación** (confirmado por el usuario):
    - **`/blog`** (sin filtro) = vista general de **todas las categorías**: todos los posts publicados ordenados por **fecha de publicación** (más reciente primero), **paginados** (9 por página).
    - **`/blog?category=<slug>`** = **todos** los posts de **esa categoría**, ordenados por fecha de publicación, **paginados** (misma paginación).
    - **`/blog?tag=<tag>`** = **todos** los posts con ese tag, **independiente de la categoría** (los tags son transversales — un tag puede cruzar categorías), ordenados por fecha de publicación, **paginados**.
    - **Combinables**: `/blog?category=X&tag=Y` = posts de esa categoría **y** con ese tag (intersección).
  - **Filtro por categoría** (chips) en la posición que hoy ocupan los tags (junto a la búsqueda): "Todos" + cada categoría → `/blog?category=<slug>`. Se obtienen de la colección `categories` (pública).
  - **Categoría clicable** en `BlogPostCard` y en el header del detalle → `/blog?category=<slug>`.
  - **Sección de tags debajo del grid**: "Explora por etiquetas" con todos los tags como chips clicables (`/blog?tag=<tag>`), reutilizando el filtro de tags actual en una posición secundaria.
  - **Paginación**: `BlogPagination` preserva el filtro de categoría (además de `q`/`tag`) en los links — al paginar dentro de una categoría se mantiene `?category=`.
  - Los filtros (categoría/tag/búsqueda) son **combinables**.

### 2.2 Reglas de negocio

- **RN-1**: Un post puede no tener autor (el campo es opcional); sin autor, no se muestra la card ni el `author` del schema.
- **RN-2**: El TOC solo considera `h2`/`h3` (los `h1`/`h4+` no generan entradas). Se muestra con ≥ 3 headings y `tocEnabled = true`.
- **RN-3**: Los ids de ancla se derivan del texto del heading (slugify: lowercase, sin acentos, espacios → `-`); ante colisiones se agrega sufijo numérico (`-2`, `-3`…).
- **RN-4**: "Actualizado" se muestra solo si `updatedAt` supera a `publishedAt` en más de 1 día.
- **RN-5**: Los relacionados usan la categoría del post; sin categoría, el primer tag; sin coincidencias, no se muestra la sección.
- **RN-6**: El schema `BlogPosting` se genera siempre (salvo override del editor); el `publisher` es fijo (Porta QR + logo `/icon.png`).
- **RN-7**: `credits` y `longDescription` son opcionales; no bloquean la subida de imágenes.
- **RN-8**: El filtro principal del listado es por **categoría** (slug); los tags son secundarios (sección propia debajo del grid) y **transversales** (un tag muestra posts de cualquier categoría). Ambos son combinables con la búsqueda y entre sí (`/blog?category=X&tag=Y&q=...`).

### 2.3 Criterios de aceptación

- [x] **CA-01**: Un post con ≥ 3 headings muestra el TOC con anclas funcionales (clic → scroll a la sección, sin quedar oculta bajo el header fixed). Con `tocEnabled=false` o < 3 headings, no se muestra. ✅ `extractHeadings` + `BlogToc` + `scroll-mt-20`; tests en `toc.spec.ts` y `BlogRichText.spec.tsx`.
- [x] **CA-02**: Los headings del contenido tienen ids únicos (colisiones resueltas con sufijo) y `scroll-margin-top` adecuado. ✅ `slugifyHeading` + sufijo numérico (test colisiones) + `scroll-mt-20`.
- [x] **CA-03**: Un post con autor (colección) muestra avatar + nombre + bio (card al final); el schema incluye `author` como `Person` con `name` y `url`. ✅ Header con avatar + card de autor; schema `Person` con url (test `buildJsonLd`).
- [x] **CA-04**: Un post editado después de publicarse muestra "Actualizado: {fecha}"; uno recién publicado no lo muestra. ✅ `isUpdated` (margen 1 día, RN-4) + 4 tests.
- [x] **CA-05**: El bloque CTA renderiza en el contenido (título, texto, botón enlazado a `buttonUrl`). ✅ `BlogCta` + case `cta` en `BlogRichText` + tests.
- [x] **CA-06**: Al final del post aparecen hasta 3 artículos de la misma categoría (excluyendo el actual); sin categoría, fallback por tag; sin coincidencias, no aparece la sección. ✅ `getRelatedPosts` + sección UI + 6 tests.
- [x] **CA-07**: El JSON-LD del post es `BlogPosting` con `publisher` (Organization + logo), `author` Person, `image` absoluta y `mainEntityOfPage` WebPage (verificado en el HTML renderizado). ✅ `buildJsonLd` exportado + 4 tests.
- [x] **CA-08**: Una imagen con `credits` muestra "Crédito: …" en los layouts; `longDescription` queda guardada en el CMS. ✅ `getMediaCredits` en 4 layouts + nodo upload + 3 tests; campos en `Media.ts`.
- [x] **CA-09**: `qr-app` sin regresión: `tsc --noEmit`, lint, build y suite de tests verdes. ✅ tsc 0, eslint 0, `next build` exit 0, 326 tests / 48 suites.
- [x] **CA-10**: `qr-cms` sin regresión: suite de tests verdes + `payload generate:types` sin errores. ✅ 45 tests / 7 suites + tsc 0 + generate:types OK.
- [x] **CA-11**: Migración `author` text → relationship sin romper posts existentes (el frontend mantiene fallback a string). ✅ `Post.author: Author | string | null` + render con fallback.
- [x] **CA-12**: En `/blog`, el filtro principal muestra las **categorías** (chips → `/blog?category=<slug>`); la categoría es **clicable** en tarjetas y detalle; los **tags** aparecen en una **sección propia debajo del grid** ("Explora por etiquetas") y son **transversales** (`/blog?tag=X` muestra posts de cualquier categoría); el grid muestra las publicaciones paginadas por fecha (más reciente primero) y los filtros (categoría/tag/búsqueda) son combinables. ✅ `BlogCategoryFilter` + `getAllCategories` + deep query `category.slug` + `BlogPagination` preserva category + 12 tests.

## 3. Diseño Técnico

### 3.1 Arquitectura

```
qr-cms (Payload 3.x)
┌──────────────────────────────────────────────────────┐
│ Colección authors (NUEVA)                             │
│  name, slug, bio, avatar (upload→media), url          │
│ Colección posts                                       │
│  author: text → relationship → authors  (RF-1)        │
│  tocEnabled: checkbox (default true)        (RF-3)    │
│ Colección media                                       │
│  + credits, longDescription                 (RF-7)    │
│ Bloque Lexical cta (NUEVO)                  (RF-4)    │
│  title, text, buttonLabel, buttonUrl                  │
└──────────────────────┬───────────────────────────────┘
                       │ REST API (depth=1)
                       ▼
qr-app (Next.js 16, ISR)
┌──────────────────────────────────────────────────────┐
│ [slug]/page.tsx                                       │
│  TOC: extractHeadings + BlogToc (sidebar/colapsable)  │
│  Header: fecha + "Actualizado" + autor (avatar)       │
│  Card de autor (bio) al final                         │
│  Artículos relacionados (misma categoría, máx 3)      │
│  JSON-LD BlogPosting (publisher + author + imagen)    │
│ BlogRichText: case 'block' cta → BlogCta              │
│ BlogImage*: caption + crédito (media.credits)         │
└──────────────────────────────────────────────────────┘
```

### 3.2 Colección `authors` (qr-cms)

```ts
// src/collections/Authors.ts — SPEC-023-B RF-1
import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
    group: 'Blog',
  },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nombre' },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, label: 'Slug' },
    { name: 'bio', type: 'textarea', label: 'Bio (breve)' },
    { name: 'avatar', type: 'upload', relationTo: 'media', label: 'Avatar' },
    { name: 'url', type: 'text', label: 'URL (página del autor o perfil)' },
  ],
}
```

**Posts.ts** — cambio de campo:

```ts
{
  name: 'author',
  type: 'relationship',
  relationTo: 'authors',
  label: 'Autor',
  // Migración: los posts existentes tienen texto libre; el frontend mantiene
  // fallback a string (CA-11). Se reasignan manualmente en el admin.
},
{
  name: 'tocEnabled', // RF-3
  type: 'checkbox',
  label: 'Mostrar tabla de contenidos',
  defaultValue: true,
  admin: { position: 'sidebar', description: 'Se muestra con 3+ headings (h2/h3).' },
},
```

### 3.3 Bloque `cta` (qr-cms)

```ts
// src/blocks/Cta.ts — SPEC-023-B RF-4
import type { Block } from 'payload'

export const Cta: Block = {
  slug: 'cta',
  labels: { singular: 'Llamado a la acción', plural: 'Llamados a la acción' },
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Título' },
    { name: 'text', type: 'textarea', label: 'Texto (opcional)' },
    { name: 'buttonLabel', type: 'text', required: true, label: 'Texto del botón' },
    { name: 'buttonUrl', type: 'text', required: true, label: 'URL del botón' },
  ],
}
```

Registro en `payload.config.ts`:

```ts
editor: lexicalEditor({
  features: [...defaultEditorFeatures, BlocksFeature({ blocks: [ImageLayout, Cta] })],
}),
```

### 3.4 Media extendida (qr-cms)

```ts
// src/collections/Media.ts — SPEC-023-B RF-7 (campos nuevos)
{ name: 'credits', type: 'text', label: 'Créditos (fuente/fotógrafo/licencia)' },
{ name: 'longDescription', type: 'textarea', label: 'Descripción larga (infografías/gráficos)' },
```

### 3.5 TOC (qr-app)

**Extracción** (`src/components/blog/toc.ts` — función pura, testeable):

```ts
export interface TocItem { id: string; text: string; level: 2 | 3 }

export function slugifyHeading(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seccion';
}

export function extractHeadings(content: unknown): TocItem[] {
  // Recorre el árbol Lexical (recursivo sobre children), toma h2/h3 en orden,
  // genera ids únicos (colisión → sufijo -2, -3…).
}
```

**Renderer** (`BlogRichText.tsx`): recibe `toc?: TocItem[]` y los headings usan `id={toc[i].id}` por orden de aparición (mismo índice que `extractHeadings` → sin colisiones) + `scroll-mt-20` (compensa el header fixed).

**Componente** (`BlogToc.tsx` — server component):

```tsx
// Sidebar sticky en desktop; <details> colapsable en móvil.
// Solo se renderiza si toc.length >= 3 y post.tocEnabled !== false (RN-2).
<nav aria-label="Tabla de contenidos" className="...">
  <h2>Contenido</h2>
  <ul>
    {toc.map((item) => (
      <li key={item.id} className={item.level === 3 ? 'pl-4' : ''}>
        <a href={`#${item.id}`} className="...">{item.text}</a>
      </li>
    ))}
  </ul>
</nav>
```

**Layout en `[slug]/page.tsx`**: `lg:grid lg:grid-cols-[minmax(0,1fr)_260px]` — artículo + TOC sticky (`lg:sticky lg:top-24 lg:self-start`). En móvil, el TOC va como `<details>` arriba del contenido.

### 3.6 Header del post + card de autor (qr-app)

```tsx
// Header (RF-2 + RF-1): fecha + "Actualizado" + autor con avatar
{post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
{isUpdated(post) && <span>Actualizado: {formatDate(post.updatedAt)}</span>} // RN-4: updatedAt > publishedAt + 1 día
{author && (
  <span className="flex items-center gap-2">
    {author.avatar?.url && <img src={author.avatar.url} alt="" className="h-6 w-6 rounded-full" />}
    {author.url ? <Link href={author.url}>{author.name}</Link> : author.name}
  </span>
)}

// Card de autor al final del post (antes de relacionados)
{author?.bio && (
  <section className="mt-10 flex items-start gap-4 rounded-xl border p-6">
    {avatar grande} <div><h2>{author.name}</h2><p>{author.bio}</p></div>
  </section>
)}
```

### 3.7 Artículos relacionados (qr-app)

```ts
// blog.service.ts — RF-5
async getRelatedPosts(post: Post, limit = 3): Promise<Post[]> {
  // 1) Misma categoría: where[category][equals]=<id> + where[id][not_equals]=<post.id>
  //    + status published + sort -publishedAt + depth 1
  // 2) Fallback sin categoría: where[tags][contains]=<primer tag>
  // 3) Sin resultados → []
}
```

UI en `[slug]/page.tsx` (reutiliza `BlogPostCard`):

```tsx
{related.length > 0 && (
  <section className="mt-16">
    <h2 className="mb-6 text-2xl font-bold">Artículos relacionados</h2>
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
      {related.map((p) => <BlogPostCard key={p.slug} post={p} />)}
    </div>
  </section>
)}
```

### 3.8 Rediseño del listado `/blog` (qr-app — RF-8)

**Servicio** (`blog.service.ts`):

```ts
// RF-8: filtro por categoría (slug) — deep query sobre la relationship
async getPosts({ page, limit, q, tag, category }: GetPostsParams = {}) {
  // ... params existentes (status, sort, depth) ...
  if (category && category.trim()) {
    params.set('where[category.slug][equals]', category.trim()); // deep query
  }
  if (tag && tag.trim()) {
    params.set('where[tags][contains]', tag.trim());
  }
  // ...
}

// RF-8: categorías de la colección pública `categories`
async getAllCategories(): Promise<{ name: string; slug: string }[]> {
  const res = await fetch(`${this.baseUrl}/api/categories?limit=100&depth=0`, this.fetchOptions());
  if (!res.ok) return [];
  const data = (await res.json()) as PayloadPaginatedResponse<{ name: string; slug: string }>;
  return data.docs ?? [];
}
```

**Componentes**:
- `BlogCategoryFilter.tsx` (nuevo): chips de categorías (mismo patrón que `BlogTagFilter`) → `/blog?category=<slug>`; chip "Todos" → `/blog`. Activo cuando `?category=` coincide.
- `BlogTagFilter.tsx` (existente): se reutiliza **sin cambios** en la sección de tags debajo del grid.
- `BlogPostCard.tsx`: la categoría pasa de `<span>` a `<Link href="/blog?category=<slug>">` (clicable, RF-8).
- `[slug]/page.tsx`: la categoría del header pasa a `<Link href="/blog?category=<slug>">`.
- `BlogPagination.tsx`: agrega `category?: string` a las props y lo preserva en `buildHref` (junto a `q`/`tag`) — al paginar dentro de una categoría se mantiene `?category=`.

**Layout de `page.tsx`**:

```tsx
// 1) Hero
// 2) Búsqueda + BlogCategoryFilter (filtro principal — RF-8)
// 3) Grid de posts (paginado, sort -publishedAt) + BlogPagination
//    · /blog            → todas las categorías (vista general paginada)
//    · /blog?category=X → solo esa categoría (paginada)
// 4) Sección "Explora por etiquetas" (BlogTagFilter) — debajo del grid
```

### 3.9 Schema `BlogPosting` (qr-app)```ts
// [slug]/page.tsx — buildJsonLd (RF-6)
const absolute = (u?: string) => (u && /^https?:\/\//.test(u) ? u : u ? `${baseUrl}${u}` : undefined);
const author = typeof post.author === 'object' ? post.author : null;

JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting', // Article → BlogPosting
  headline: post.meta?.title || post.title,
  description: post.meta?.description || post.excerpt,
  image: absolute(image) ? [absolute(image)] : undefined,
  datePublished: post.publishedAt,
  dateModified: post.updatedAt,
  author: author ? { '@type': 'Person', name: author.name, url: author.url || undefined } : undefined,
  publisher: {
    '@type': 'Organization',
    name: 'Porta QR',
    logo: { '@type': 'ImageObject', url: `${baseUrl}/icon.png` },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}/blog/${post.slug}` },
})
// + sanitización existente: .replace(/</g, '\\u003c')
```

### 3.10 Contratos de API

| Endpoint | Cambio |
|---|---|
| `GET {CMS_URL}/api/authors/{id}?depth=1` | Nuevo: `{ id, name, slug, bio, avatar: { url, sizes }, url }` |
| `GET {CMS_URL}/api/posts?depth=1` | `author` resuelve el objeto `authors` (fallback: id string); `tocEnabled` incluido |
| `GET {CMS_URL}/api/media/{id}?depth=1` | `credits`, `longDescription` incluidos |
| `GET {CMS_URL}/api/posts?where[category][equals]=X&where[id][not_equals]=Y` | Relacionados (RF-5) |
| `GET {CMS_URL}/api/posts?where[category.slug][equals]=X` | Filtro por categoría en el listado (RF-8) |
| `GET {CMS_URL}/api/categories?limit=100&depth=0` | Lista de categorías para el filtro (RF-8) |

### 3.11 Variables / configuración

- **Sin variables nuevas**. `publisher.name` y el logo (`/icon.png`) son constantes del frontend. `baseUrl` ya existe (`NEXT_PUBLIC_SITE_URL`).

## 4. Mockups / Referencias

- [Google — E-E-A-T](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google — Article/BlogPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [schema.org — BlogPosting](https://schema.org/BlogPosting)
- [MDN — scroll-margin](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-margin)
- [Payload 3 — Relationships](https://payloadcms.com/docs/fields/relationship)

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **Colección `authors`** | E-E-A-T real (bio, avatar, URL); schema Person completo; reutilizable | Migración del campo text actual; un doc más por autor | ✅ **Elegido** (RF-1) |
| Mantener `author` como texto libre | Cero migración | Sin bio/avatar/URL; E-E-A-T débil | ❌ |
| **TOC automático (server)** | Cero trabajo del editor; siempre consistente con el contenido | Sin highlight de sección activa (mejora client opcional a futuro) | ✅ **Elegido** (RF-3) |
| TOC manual (campo en el CMS) | Control del editor | Se desincroniza del contenido; trabajo manual | ❌ |
| **TOC sidebar desktop + colapsable móvil** | No roba espacio en móvil; sticky en desktop | Dos layouts que mantener | ✅ **Elegido** |
| **Bloque CTA en el contenido** | Flexible (mitad/final del artículo); el editor decide | Un bloque más en el editor | ✅ **Elegido** (RF-4) |
| CTA global (campo del post) | Un solo lugar | Solo al final; menos flexible | ❌ |
| **Relacionados por categoría (fallback tag)** | Relevancia alta; sin categoría aún funciona | Requiere query extra por post | ✅ **Elegido** (RF-5) |
| Relacionados por tags siempre | Más resultados | Menos precisos | ❌ |
| **`BlogPosting` + publisher + imagen absoluta** | Rich snippets completos; recomendado por Google | Nada (mejora pura) | ✅ **Elegido** (RF-6) |
| Mantener `Article` genérico | Cero cambios | Menos específico para blogs | ❌ |
| **`credits` + `longDescription` en media** | Atribución correcta (licencias); accesibilidad avanzada | Campos opcionales que el editor puede ignorar | ✅ **Elegido** (RF-7) |
| **Comentarios/valoraciones: fuera de alcance** | Sin moderación, spam ni GDPR | Sin comunidad en el blog | ✅ **Elegido** (decisión del usuario — evaluar a futuro) |
| **Filtro por categoría + sección de tags propia** | Categorías (temas amplios) como navegación principal; tags (específicos) como exploración secundaria — coherente con el checklist | Un componente nuevo (`BlogCategoryFilter`) y reubicar el de tags | ✅ **Elegido** (RF-8) |
| Mantener tags como filtro principal | Cero cambios | Categorías (más importantes) quedan relegadas a texto no clicable | ❌ |

> [!note] Consideraciones
> - **Migración de autores**: los posts existentes con `author` texto libre quedan con el id del string (el frontend mantiene fallback `Author | string`). Se reasignan manualmente en el admin (volumen bajo).
> - **TOC y headings**: el renderer de `BlogRichText` debe recibir la lista `toc` para asignar ids por índice — evita colisiones y garantiza que ancla y heading coincidan.
> - **`scroll-mt-20`**: los headings necesitan `scroll-margin-top` para no quedar ocultos bajo el header fixed (~65px) al navegar con anclas.
> - **Relacionados y caché**: la query de relacionados usa los mismos `next: { tags: ['blog'] }` → se revalida junto con el post (sin cambios de ISR).
> - **`icon.png`**: existe en la app (raíz pública) — se usa como logo del publisher. Si a futuro hay un logo oficial, se reemplaza la constante.

## 6. Plan de implementación

| # | Paso | Detalle |
|---|---|---|
| 1 | Rama feature | ✅ `main` (qr-cms) y `feat/spec-023-blog-payload-cms-isr` (qr-app), un commit por tarea |
| 2 | Colección `authors` | ✅ qr-cms: colección + `Posts.author` → relationship + `tocEnabled` (3.2) — commit `a8992cc` |
| 3 | Bloque `cta` | ✅ qr-cms: bloque + registro en `BlocksFeature` (3.3) — commit `2f2201b` |
| 4 | Media extendida | ✅ qr-cms: `credits` + `longDescription` (3.4) + `payload generate:types` — commit `a7abb9f` |
| 5 | Tipos qr-app | ✅ `interfaces/blog.ts`: `Author`, `CtaBlock`, `Post.author: Author \| string`, `tocEnabled`, `MediaImage.credits/longDescription` — commit `c2d20db` |
| 6 | TOC | ✅ qr-app: `extractHeadings` + ids en headings + `BlogToc` + layout (3.5) — commit `2e0bc49` |
| 7 | Header + autor | ✅ qr-app: "Actualizado" + avatar/nombre + card de autor (3.6) — commit `e0ed678` |
| 8 | CTA renderer | ✅ qr-app: `BlogCta` + case `'block'` en `BlogRichText` — commit `463eaa9` (test dedicado) |
| 9 | Relacionados | ✅ qr-app: `getRelatedPosts` + sección UI (3.7) — commit `bb99590` |
| 10 | Schema | ✅ qr-app: `BlogPosting` + publisher + imagen absoluta (3.8) — commit `dccb0f9` |
| 11 | Rediseño `/blog` | ✅ qr-app: `BlogCategoryFilter` + `getAllCategories` + filtro `category` en service + categoría clicable (card y detalle) + sección de tags debajo del grid (3.8) — commit `e603075` |
| 12 | Tests | ✅ qr-cms: colección/bloque (buildConfig valida); qr-app: `extractHeadings`, TOC, CTA, relacionados, schema, filtro categoría, categoría clicable |
| 13 | Verificación | ✅ CA-01 a CA-12 (ver arriba); QA manual pendiente: visual en navegador (TOC/CTA/relacionados), bucket R2 |

> [!info] Siguiente paso
> Registrar tareas de esta SPEC en `docs/tareas/SPEC-023-B-tareas.json` (formato Taskmaster-compatible) antes de implementar.