---
title: "SPEC-023: Blog con Payload CMS + Cloudflare R2 + MongoDB + ISR en qr-app"
date: 2026-08-19
tags:
  - spec
  - blog
  - cms
  - payload
  - seo
  - isr
  - r2
  - mongo
status: borrador
aliases:
  - SPEC-023
  - Blog Payload CMS
---

# SPEC-023: Blog con Payload CMS + Cloudflare R2 + MongoDB + ISR en qr-app

> [!abstract] Decisión clave
> El blog público vive en `qr-app` (Next.js 16) bajo `/blog` y `/blog/[slug]` con **Incremental Static Regeneration (ISR)**: páginas estáticas con SEO completo que se regeneran on-demand cuando se publica un artículo. El contenido se gestiona desde **Payload CMS 3.x** corriendo como **app Next.js separada** (`qr-cms`), con **MongoDB** como base de datos (BD `portaqr_cms` en la misma instancia del stack) e **imágenes en Cloudflare R2** (adapter S3). Los videos se incrustan desde **YouTube** (`youtube-nocookie`). Publicar un post = escribirlo en el admin de Payload → webhook → revalidación ISR → el blog se actualiza **sin redeployar qr-app**.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-19
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-cms/` (nuevo) + `desarrollo-qr/qr-app/` (blog público + webhook) + `desarrollo-qr/docker-compose.yml` + Cloudflare R2 (bucket)
> - **Relacionado:** [[SPEC-010-blog-astro-cloudflare-pages]] (desestimada — esta la reemplaza), [[SPEC-005]] (patrón R2 existente), [[SPEC-003]] (auditoría dependencias qr-app)

---

## 1. Objetivo

Que el equipo pueda **publicar y editar artículos de blog desde un panel de administración** (Payload CMS) sin tocar código ni redeployar la plataforma, manteniendo **SEO completo por artículo** (URLs estáticas, metadata, JSON-LD, sitemap) servido por `qr-app` con ISR.

**Qué resuelve vs. el estado actual:**

| Problema | Hoy | Con la SPEC |
|---|---|---|
| Publicar artículo | Editar array TS + rebuild de toda la app (minutos, riesgo) | Escribir en el admin de Payload → webhook → ISR regenera solo el blog |
| Rutas de artículo | `/blog/${id}` → **404** (nunca se crearon) | `/blog/[slug]` estáticas con SEO |
| SEO por artículo | Imposible (no hay rutas) | metadata, OG, JSON-LD, canonical, sitemap por post |
| Imágenes | `public/blog/*.jpg` (bundle de la app) | Cloudflare R2 (fuera del bundle, CDN) |
| Videos | No soportados | YouTube embed (`youtube-nocookie`) |
| Riesgo de despliegue | Un typo en un post puede romper auth/pagos | El CMS es app separada; el blog es estático con ISR |

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (CMS)**. `qr-cms`: app Next.js separada con Payload 3.x. Panel admin accesible en local (`http://localhost:3005/admin`) y en producción vía URL directa del proveedor (Railway) — **no** se expone bajo `portaqr.cl` (decisión usuario 2026-08-19: el dominio público solo lee datos vía API).
- **RF-2 (Colecciones)**. Colecciones Payload: `posts`, `media`, `categories`, `users` (auth del admin).
- **RF-3 (Post)**. Campos de `posts`: `title` (requerido), `slug` (requerido, único, indexado), `excerpt` (textarea), `content` (rich text **Lexical**), `cover` (upload → `media`), `category` (relationship → `categories`), `tags` (array de texto), `author` (texto), `youtubeUrl` (texto opcional, URL de YouTube), `publishedAt` (fecha), `status` (select: `draft` | `published`, default `draft`), y un **bloque SEO completo configurable desde el admin** (RF-3.1).
- **RF-3.1 (Bloque SEO configurable)**. La colección `posts` integra **`@payloadcms/plugin-seo`** (grupo `meta` con `title`, `description`, `image` + **previews en vivo en el admin**: snippet de Google, tarjeta OpenGraph y tarjeta Twitter) **extendido con campos custom** para control total del SEO por artículo:

  | Campo | Tipo | Propósito |
  |---|---|---|
  | `meta.title` | text | Title tag (override de `title`) |
  | `meta.description` | textarea | Meta description (override de `excerpt`) |
  | `meta.image` | upload → media | Imagen social por defecto (override de `cover`) |
  | `canonicalURL` | text | Override del canonical (syndication/redirecciones) |
  | `noindex` | checkbox | `robots: noindex` (posts que no se quieren indexar) |
  | `keywords` | text | Keywords (opcional, separadas por coma) |
  | `ogTitle` | text | Override OpenGraph title |
  | `ogDescription` | textarea | Override OpenGraph description |
  | `ogImage` | upload → media | Override OpenGraph image |
  | `ogType` | select (`article` \| `website`) | Default `article` |
  | `twitterTitle` | text | Override Twitter title |
  | `twitterDescription` | textarea | Override Twitter description |
  | `twitterImage` | upload → media | Override Twitter image |
  | `twitterCard` | select (`summary` \| `summary_large_image`) | Default `summary_large_image` |
  | `structuredData` | JSON (code) | JSON-LD custom (override/merge del `Article` generado) |

  **Regla de precedencia** (de mayor a menor): campo SEO específico → `meta.*` del plugin → campo del post (`title`/`excerpt`/`cover`) → default. Ej.: `ogTitle` > `meta.title` > `title`; `ogImage` > `meta.image` > `cover`.
- **RF-4 (Imágenes en R2)**. La colección `media` usa `@payloadcms/storage-s3` apuntando a un bucket **Cloudflare R2** (S3-compatible). Las imágenes se sirven desde la URL pública del bucket (custom domain o `r2.dev`), no desde el bundle de qr-app.
- **RF-5 (Videos YouTube)**. Un post puede incluir **un** video de YouTube (`youtubeUrl`). Se renderiza con iframe `https://www.youtube-nocookie.com/embed/{videoId}` (modo privacidad), `loading="lazy"`, `allowFullScreen`, relación de aspecto 16:9. **No** se suben videos a R2 (peso/transcodificación — YouTube es la decisión correcta).
- **RF-6 (Blog público en qr-app)**. `qr-app` consume la **REST API** de Payload (server-side, sin CORS) y renderiza:
  - `/blog` — listado de posts publicados (orden por `publishedAt` desc).
  - `/blog/[slug]` — artículo completo con SEO.
- **RF-7 (ISR)**. Ambas rutas usan ISR: `export const revalidate = 3600` (fallback por tiempo) + **revalidación on-demand** vía webhook. `generateStaticParams` prerenderiza los slugs publicados en build.
- **RF-8 (Webhook de revalidación)**. Al crear/actualizar/eliminar un post en Payload, un hook `afterChange`/`afterDelete` de la colección `posts` hace `POST {QR_APP_URL}/api/revalidate` con secreto compartido (`x-revalidate-secret`). `qr-app` ejecuta `revalidateTag('blog')` + `revalidatePath('/blog')` → el blog se regenera sin redeploy.
- **RF-9 (SEO)**. Por post, `generateMetadata` mapea **todos** los campos del bloque SEO (RF-3.1) aplicando la regla de precedencia: `title`/`description`/`canonical`/`robots` (noindex), `openGraph` (title, description, images, type, url), `twitter` (card, title, description, images) + **JSON-LD `Article`** (headline, description, image, datePublished, dateModified, author) con override por `structuredData` custom. El sitemap (`src/app/sitemap.ts`) agrega los posts publicados. Los drafts **nunca** aparecen en sitemap ni en rutas públicas.
- **RF-10 (Migración)**. Los 6 posts hardcodeados de `src/app/blog/page.tsx` se migran a la colección `posts` (seed) con sus imágenes subidas a R2.
- **RF-11 (Búsqueda y filtros)**. `/blog` soporta **búsqueda server-side** vía query params en la URL (SEO-friendly, indexable y compartible): `?q=<texto>` (búsqueda en `title` y `excerpt`), `?tag=<tag>` (filtro por tag), `?page=<n>` (paginación). Los filtros son **combinables** (`/blog?q=qr+marketing&tag=seguridad`). El filtrado lo hace MongoDB en qr-cms (Payload `where`), no el navegador. Los tags disponibles se obtienen de los posts publicados (`getAllTags()` — dedupe de `tags`; si el blog crece, se migra a colección `tags` en Payload).
- **RF-11.1 (Búsqueda case-insensitive y sin acentos)**. La búsqueda por texto es **insensible a mayúsculas/minúsculas y a acentos**: "codigos" matchea "Códigos" y "códigos" (y viceversa), sin cambiar los datos. Implementación: `qr-cms` agrega el campo `searchText` (hidden del admin, indexado, consultable) poblado por el hook `beforeChange` `setSearchText` (normaliza `title + excerpt + tags` a lowercase sin diacríticos); `qr-app` normaliza el query con la misma función y busca con el operador `like` de Payload (case-insensitive `$options 'i'`, escapa regex automáticamente, `$and` de palabras — **no usa `%` como wildcard**).
- **RF-12 (Componentes de blog)**. Componentes en `src/components/blog/`: `BlogSearchBar` (input de texto → `router.push('/blog?q=...')`), `BlogTagFilter` (chips de tags → `router.push('/blog?tag=...')`), `BlogPostCard` (tarjeta reutilizable: cover, título, excerpt, categoría, fecha, tags), `BlogPagination` (reutiliza `ui/PaginationControls.tsx` existente). La interacción es client-side, pero **la búsqueda siempre es server-side** (los componentes solo navegan con query params; nunca fetchean en el cliente).

### 2.2 Reglas de negocio

- **RN-1**: Solo posts con `status === 'published'` y `publishedAt <= now` son visibles en `/blog`, `/blog/[slug]`, sitemap y RSS.
- **RN-2**: El slug es único e inmutable una vez publicado (evita romper URLs indexadas). Si se necesita cambiar, se crea redirect.
- **RN-3**: El webhook de revalidación exige el secreto compartido; sin él → `401`.
- **RN-4**: Si `qr-cms` no responde (caído), `/blog` y `/blog/[slug]` siguen sirviendo la última versión estática cacheada (ISR) — el blog nunca se cae por el CMS.
- **RN-5**: El admin de Payload no se indexa (`noindex`) y requiere autenticación (auth propia de Payload).

### 2.3 Criterios de aceptación

- [ ] **CA-01**: `qr-cms` corre en docker-compose (puerto 3005) y el admin `http://localhost:3005/admin` permite crear/editar posts.
- [ ] **CA-02**: Crear un post publicado en el admin → aparece en `/blog` de qr-app **sin redeploy** (webhook + ISR on-demand, verificado en navegador).
- [ ] **CA-03**: `/blog/[slug]` responde 200 con metadata completa (title, description, OG, Twitter, canonical, robots) y JSON-LD `Article` válido; los overrides del bloque SEO (RF-3.1) se reflejan en el HTML (verificado con `curl`/DevTools).
- [ ] **CA-04**: El sitemap incluye los posts publicados; los drafts NO aparecen.
- [ ] **CA-05**: Las imágenes de portada se sirven desde R2 (URL pública del bucket), no desde `/public` de qr-app.
- [ ] **CA-06**: Un post con `youtubeUrl` renderiza el video embebido con `youtube-nocookie.com` y `loading="lazy"`.
- [ ] **CA-07**: Los 6 posts migrados son accesibles en `/blog/[slug]` con su contenido e imagen.
- [ ] **CA-08**: `qr-app` sin regresión: `tsc --noEmit`, lint, build y suite de tests verdes.
- [ ] **CA-09**: `POST /api/revalidate` sin secreto → 401; con secreto → 200 y revalida.
- [ ] **CA-10**: Con `qr-cms` apagado, `/blog` y `/blog/[slug]` siguen respondiendo (contenido cacheado por ISR).
- [ ] **CA-11**: `/blog?q=<texto>` filtra por título/excerpt; `/blog?tag=<tag>` filtra por tag; combinados funcionan; la URL es compartible y el resultado es correcto (verificado en navegador).

## 3. Diseño Técnico

### 3.1 Arquitectura

```
                    portaqr.cl (Cloudflare proxy) → Railway
                              │
              ┌───────────────┴────────────────┐
              │                                │
      qr-app (Next.js 16)              qr-cms (Next.js + Payload 3.x)
      Blog público /blog + /blog/[slug]        Admin + REST/GraphQL API
      ISR (revalidate 3600 + on-demand)        (URL directa Railway, NO portaqr.cl)
              │  ▲                              │
              │  │ POST /api/revalidate         │
              │  │ (x-revalidate-secret)        │
              │  └──────────────┐               │
              │                 │               │
              │   fetch REST (server-side)      │
              └─────────────────┼───────────────┘
                                │
                    ┌───────────┴───────────┐
                    │ MongoDB (BD portaqr_cms)│
                    │ (misma instancia mongo:7.0)│
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │ Cloudflare R2 (bucket) │
                    │ imágenes vía S3 API    │
                    └───────────────────────┘
```

**Flujo de publicación (end-to-end):**

```
1. Editor escribe post en qr-cms/admin → status: published
2. Payload persiste en MongoDB (portaqr_cms) + sube cover a R2
3. Hook afterChange de posts → POST qr-app/api/revalidate (secreto)
4. qr-app: revalidateTag('blog') + revalidatePath('/blog')
5. Próxima visita → ISR regenera /blog y /blog/[slug] con datos frescos
   (mientras tanto sirve la versión estática cacheada — RN-4)
```

### 3.2 Proyecto `qr-cms` (nuevo)

- **Repo Git independiente** (decisión usuario 2026-08-19): `qr-cms` tiene **su propio repositorio** (sugerido: `cms-qr-portaqr`, consistente con `backend-portaqr`), siguiendo el patrón del proyecto donde **cada servicio es un repo separado** clonado dentro de `desarrollo-qr/<servicio>/` (backend-portaqr, qr-app, etc. — todos con su propio `.git`; el `.gitignore` raíz ignora `desarrollo-qr/*` excepto `docker-compose.yml`). Un cambio en la plataforma jamás dispara un build del CMS, y el despliegue en Railway es independiente.
- Ubicación local: `desarrollo-qr/qr-cms/` (clon del repo `cms-qr-portaqr`; el `docker-compose.yml` sigue apuntando a `./qr-cms`).
- Creación: `git clone <repo-cms-qr>` en `desarrollo-qr/qr-cms/` + `npx create-payload-app@latest` dentro (o inicializar el repo con el template).
- **Versiones**: Payload 3.x (`payload`, `@payloadcms/next`, `@payloadcms/ui`, `@payloadcms/db-mongodb`, `@payloadcms/richtext-lexical`, `@payloadcms/storage-s3`, `sharp`). ⚠️ **Nota de implementación**: qr-cms es proyecto independiente — puede usar la versión de Next.js que Payload requiera (no necesariamente 16). Verificar compatibilidad en la instalación.
- `next.config.ts`: envolver con `withPayload(nextConfig)`.
- `payload.config.ts`:

```ts
import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'
import { Posts } from './collections/Posts'
import { Media } from './collections/Media'
import { Categories } from './collections/Categories'
import { Users } from './collections/Users'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  admin: { user: Users.slug },
  editor: lexicalEditor(),
  collections: [Users, Media, Categories, Posts],
  db: mongooseAdapter({ url: process.env.DATABASE_URL || '' }),
  sharp,
  storage: [
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => {
            const key = prefix ? `${prefix}/${filename}` : filename
            return `${process.env.R2_PUBLIC_URL}/${key}`
          },
        },
      },
      bucket: process.env.R2_BUCKET,
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
        region: 'auto',                    // requerido por R2
        endpoint: process.env.R2_ENDPOINT, // solo uploads (S3 API)
        forcePathStyle: true,              // requerido por R2
      },
    }),
  ],
})
```

- **Colección `Posts`** (resumen de campos):

| Campo | Tipo | Reglas |
|---|---|---|
| `title` | text | requerido |
| `slug` | text | requerido, único, indexado |
| `excerpt` | textarea | opcional |
| `content` | richText (Lexical) | requerido |
| `cover` | upload → media | opcional |
| `category` | relationship → categories | opcional |
| `tags` | array de text | opcional |
| `author` | text | opcional |
| `youtubeUrl` | text | opcional, validar URL de YouTube |
| `publishedAt` | date | opcional (default now al publicar) |
| `status` | select | `draft` \| `published` (default `draft`) |
| `seo` (grupo) | group | **bloque SEO completo** (RF-3.1) — generado por `@payloadcms/plugin-seo` + campos custom |

**Bloque `seo`** (grupo en `posts`, con previews en vivo en el admin):

| Campo | Tipo | Reglas |
|---|---|---|
| `meta.title` | text | plugin SEO (override de `title`) |
| `meta.description` | textarea | plugin SEO (override de `excerpt`) |
| `meta.image` | upload → media | plugin SEO (override de `cover`) |
| `canonicalURL` | text | opcional, override del canonical |
| `noindex` | checkbox | default `false` |
| `keywords` | text | opcional |
| `ogTitle` / `ogDescription` / `ogImage` | text / textarea / upload | overrides OpenGraph |
| `ogType` | select | `article` \| `website` (default `article`) |
| `twitterTitle` / `twitterDescription` / `twitterImage` | text / textarea / upload | overrides Twitter |
| `twitterCard` | select | `summary` \| `summary_large_image` (default `summary_large_image`) |
| `structuredData` | code (JSON) | opcional, JSON-LD custom |

**Config del plugin** en `payload.config.ts` (se agrega a la config de 3.2):

```ts
import { seoPlugin } from '@payloadcms/plugin-seo'

// dentro de buildConfig:
plugins: [
  seoPlugin({
    collections: ['posts'],
    uploadsCollection: 'media',
    generateTitle: ({ doc }) => `${doc?.title} | Porta QR`,
    generateDescription: ({ doc }) => doc?.excerpt,
    generateImage: ({ doc }) => doc?.cover,
    fields: ({ defaultFields }) => [
      ...defaultFields,
      // campos custom: canonicalURL, noindex, keywords,
      // ogTitle, ogDescription, ogImage, ogType,
      // twitterTitle, twitterDescription, twitterImage, twitterCard, structuredData
    ],
  }),
],
```

- **Webhook de revalidación** — hook en `Posts`:

```ts
// collections/Posts/hooks/revalidate.ts
export const revalidatePost = async ({ doc, req }) => {
  const secret = process.env.REVALIDATE_SECRET
  const qrAppUrl = process.env.QR_APP_URL
  if (!secret || !qrAppUrl) return
  try {
    await fetch(`${qrAppUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ slug: doc.slug }),
    })
  } catch (e) {
    req.payload.logger.error(`revalidate webhook failed: ${e}`)
  }
}
// afterChange: [revalidatePost], afterDelete: [revalidatePost]
```

- **Rutas del admin**: `/admin` (panel), `/api/{collection}` (REST), `/api/graphql` (GraphQL opcional). El blog usa REST.

### 3.3 Blog público en `qr-app` (ISR)

- **`src/app/blog/page.tsx`** (server component) — listado + búsqueda + filtros (RF-11):

```tsx
export const revalidate = 3600 // fallback por tiempo (RN-4)

// Búsqueda server-side: los filtros vienen en la URL (SEO-friendly)
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; page?: string }>
}) {
  const { q, tag, page } = await searchParams
  const currentPage = Math.max(1, Number(page) || 1)
  const { docs, totalPages } = await blogService.getPosts({
    page: currentPage,
    limit: 9,
    q,
    tag,
  })
  const allTags = await blogService.getAllTags()
  return (
    <>
      <Header />
      <main>
        <BlogSearchBar initialQ={q} />          {/* client: router.push('/blog?q=...') */}
        <BlogTagFilter tags={allTags} activeTag={tag} /> {/* client: router.push('/blog?tag=...') */}
        <section className="grid ...">
          {docs.map((post) => <BlogPostCard key={post.slug} post={post} />)}
        </section>
        <BlogPagination page={currentPage} totalPages={totalPages} q={q} tag={tag} />
      </main>
      <Footer />
    </>
  )
}
```

**`src/services/blog.service.ts`** — construcción de los filtros de Payload (RF-11):

```ts
async getPosts({ page = 1, limit = 9, q, tag }): Promise<PaginatedResponse<Post>> {
  const params = new URLSearchParams()
  params.set('where[status][equals]', 'published') // RN-1
  params.set('sort', '-publishedAt')
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('depth', '1')
  if (tag) params.set('where[tags][contains]', tag)          // filtro por tag
  if (q) {
    // búsqueda en título O extracto (Payload where[or])
    params.set('where[or][0][title][like]', `%${q}%`)
    params.set('where[or][1][excerpt][like]', `%${q}%`)
  }
  const res = await fetch(`${this.baseUrl}/api/posts?${params}`, {
    next: { tags: ['blog'] }, cache: 'force-cache',
  })
  if (!res.ok) return { docs: [], totalPages: 0 } // RN-4: CMS caído → vacío
  return res.json()
}

async getAllTags(): Promise<string[]> {
  // fetch posts publicados (limit alto) y dedupe de tags
  // suficiente para el volumen actual; a futuro: colección `tags` en Payload
}
```

**Componentes de búsqueda** (`src/components/blog/`, RF-12):

| Componente | Tipo | Comportamiento |
|---|---|---|
| `BlogSearchBar` | client | input de texto; submit → `router.push('/blog?q=...')` (navegación, **no** fetch en cliente) |
| `BlogTagFilter` | client | chips de tags; click → `router.push('/blog?tag=...')`; tag activo resaltado |
| `BlogPostCard` | server | tarjeta: cover (next/image R2), título, excerpt, categoría, fecha, tags |
| `BlogPagination` | server | reutiliza `ui/PaginationControls.tsx`; preserva `q`/`tag` en los links |

> [!note] Por qué búsqueda server-side (no client-side)
> Cada combinación de filtros es una **URL indexable** (`/blog?tag=seguridad`), el filtrado lo hace **MongoDB en qr-cms** (escalable) y es **compatible con ISR** (cada variante se cachea). La búsqueda client-side solo serviría para pocos posts y no sería SEO-friendly.

- **`src/app/blog/[slug]/page.tsx`**:

```tsx
export const revalidate = 3600
export const dynamicParams = true // permite ISR para slugs nuevos

export async function generateStaticParams() {
  const posts = await getPublishedPosts()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}
  const seo = post.seo ?? {}
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portaqr.cl'
  const canonical = seo.canonicalURL || `${baseUrl}/blog/${slug}`
  const title = seo.meta?.title || post.title
  const description = seo.meta?.description || post.excerpt
  const image = seo.meta?.image?.url || post.cover?.url
  return {
    title,
    description,
    alternates: { canonical },
    robots: seo.noindex ? { index: false, follow: true } : undefined,
    keywords: seo.keywords,
    openGraph: {
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      images: seo.ogImage?.url || image ? [{ url: seo.ogImage?.url || image }] : undefined,
      type: seo.ogType || 'article',
      url: canonical,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: seo.twitterCard || 'summary_large_image',
      title: seo.twitterTitle || title,
      description: seo.twitterDescription || description,
      images: seo.twitterImage?.url || image ? [seo.twitterImage?.url || image] : undefined,
    },
  }
}

export default async function PostPage({ params }) {
  const { slug } = await params
  const post = await getPostBySlug(slug) // fetch con tags: ['blog']
  if (!post) notFound()
  // render: cover (next/image con remotePatterns para R2), título, fecha,
  // RichText(Lexical) del content, YouTubeEmbed si youtubeUrl,
  // JSON-LD Article (headline, description, image, datePublished, dateModified,
  // author) — si post.seo?.structuredData existe, se usa ese JSON-LD (override)
  // NOTA: el JSON-LD se renderiza con <Script> de next/script (no <script> directo)
  // para evitar la advertencia de React "Encountered a script tag", y se SANITIZA
  // reemplazando '<' por '\u003c' (doc Next.js) para prevenir XSS.
}
```

- **`src/app/api/revalidate/route.ts`** (route handler):

```ts
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret')
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) // CA-09
  }
  // Next 16: revalidateTag(tag, profile) — 'max' = stale-while-revalidate
  // (ideal para blogs; la doc lo recomienda). updateTag (expiración inmediata)
  // es solo Server Actions, no aplica a Route Handlers.
  revalidateTag('blog', 'max')
  revalidatePath('/blog')
  return NextResponse.json({ revalidated: true })
}
```

- **`src/app/sitemap.ts`**: agregar los posts publicados (fetch a CMS con `tags: ['blog']`) a las rutas existentes. El sitemap ya es `force-dynamic` (no rompe ISR).
- **`next.config.ts` de qr-app**: agregar `remotePatterns` para el dominio público de R2 en `images` (para `next/image`).
- **`robots.txt`**: sin cambios (el sitemap ya está declarado).

### 3.4 YouTube embed

- Componente `YouTubeEmbed` (client, `src/components/blog/YouTubeEmbed.tsx`): recibe `youtubeUrl`, extrae `videoId` (regex para `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`), renderiza:

```tsx
<iframe
  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
  title="Video"
  loading="lazy"
  allowFullScreen
  className="aspect-video w-full rounded-xl"
/>
```

### 3.5 Contratos de API (REST Payload)

| Endpoint | Uso |
|---|---|
| `GET {CMS_URL}/api/posts?where[status][equals]=published&sort=-publishedAt&limit=100&depth=1` | Listado del blog |
| `GET {CMS_URL}/api/posts?where[slug][equals]={slug}&limit=1&depth=1` | Artículo por slug |
| `GET {CMS_URL}/api/posts?where[status][equals]=published&where[tags][contains]={tag}&sort=-publishedAt&page={n}&limit=9&depth=1` | Filtro por tag (RF-11) |
| `GET {CMS_URL}/api/posts?where[status][equals]=published&where[or][0][title][like]=%{q}%&where[or][1][excerpt][like]=%{q}%&sort=-publishedAt&page={n}&limit=9&depth=1` | Búsqueda por texto (RF-11) |
| `GET {CMS_URL}/api/media/{id}` | Metadatos de imagen (URL R2) |
| `POST {QR_APP_URL}/api/revalidate` | Webhook (header `x-revalidate-secret`) |

> Los filtros `tag` y `or` (búsqueda) son **combinables** en un mismo request. La respuesta de Payload incluye `docs[]`, `totalDocs`, `totalPages`, `page`, `limit` (paginación nativa).

Respuesta de `posts` (docs[]): `{ id, title, slug, excerpt, content (JSON Lexical), cover: { url }, category, tags, author, youtubeUrl, publishedAt, updatedAt, seo: { meta: { title, description, image: { url } }, canonicalURL, noindex, keywords, ogTitle, ogDescription, ogImage: { url }, ogType, twitterTitle, twitterDescription, twitterImage: { url }, twitterCard, structuredData } }`. El fetch usa `depth=1` para resolver `cover`/`seo.meta.image`/`seo.ogImage`/`seo.twitterImage` a `{ url }`.

### 3.6 Infraestructura y variables

**Dockerfile** — `desarrollo-qr/qr-cms/Dockerfile` (✅ creado 2026-08-19, **vive en el repo de `qr-cms`**): multi-stage `builder` → `development` → `production` sobre `node:20-alpine` (patrón del proyecto). `development` = `npm install` + `npm run dev` (hot-reload, usado por docker-compose). `builder` acepta `ARG PAYLOAD_SECRET`/`ARG DATABASE_URL` (el `next build` de Payload genera `payload-types.ts` y puede requerirlos — se pasan como build args en el deploy). `production` = `npm ci --only=production` + copia `.next`/`public`/`next.config.*`. Acompañado de `.dockerignore` (✅ creado). Nota: si se usa `output: 'standalone'` en `next.config`, el stage production cambia a `CMD ["node", "server.js"]` (patrón oficial Payload).

**docker-compose.yml** — servicio `qr-cms` (✅ agregado 2026-08-19, patrón de los existentes):

```yaml
qr-cms:
  build:
    context: ./qr-cms
    target: development
    dockerfile: Dockerfile
  container_name: qr-cms
  restart: always
  ports:
    - "3005:3005"
  env_file:
    - ./qr-cms/qrCms.env
  environment:
    - SERVER_PORT=3005
  volumes:
    - ./qr-cms:/app
    - /app/node_modules
  depends_on:
    mongo:
      condition: service_healthy
  networks:
    - webnet
  extra_hosts:
    - "host.docker.internal:host-gateway"
  command: npm run dev
  healthcheck:
    test: wget --no-verbose --tries=1 --spider http://localhost:3005/admin || exit 1
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

> [!warning] El servicio `qr-cms` requiere que el proyecto exista
> El Dockerfile y el servicio ya están en el repo, pero `desarrollo-qr/qr-cms/` **aún no tiene el código del proyecto** (package.json, payload.config.ts, etc. — tarea 2). `docker compose up` fallará para `qr-cms` hasta que se cree el proyecto con `create-payload-app`. El resto del stack no se ve afectado.

**Variables `qr-cms` (`qrCms.env`, no versionado — ✅ creado 2026-08-19 con secretos generados; plantilla en `.env.example`):**

| Variable | Valor (local) | Notas |
|---|---|---|
| `PAYLOAD_SECRET` | (generar) | secreto de Payload |
| `DATABASE_URL` | `mongodb://root:example@mongo_qr:27017/portaqr_cms?authSource=admin` | **BD separada** en la misma instancia |
| `R2_BUCKET` | `portaqr-blog` | bucket R2 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | (credenciales R2) | |
| `R2_ENDPOINT` | `https://<accountId>.r2.cloudflarestorage.com` | solo uploads |
| `R2_PUBLIC_URL` | `https://<custom-domain>` | sirve imágenes (custom domain o r2.dev) |
| `QR_APP_URL` | `http://qr-app:3000` | webhook |
| `REVALIDATE_SECRET` | (compartido con qr-app) | webhook |

**Variables `qr-app` (`qrApp.env`):**

| Variable | Valor (local) | Notas |
|---|---|---|
| `CMS_URL` | `http://qr-cms:3005` | server-side (nunca `NEXT_PUBLIC_`) |
| `REVALIDATE_SECRET` | (compartido con qr-cms) | webhook |

### 3.7 Migración de los 6 posts existentes

| # | Slug propuesto | Categoría | Fecha |
|---|---|---|---|
| 1 | `marketing-digital` | Marketing Digital | 2024-03-15 |
| 2 | `seguridad` | Seguridad | 2024-03-12 |
| 3 | `tendencias-2024` | Tendencias | 2024-03-10 |
| 4 | `qr-restaurantes` | Casos de Éxito | 2024-03-08 |
| 5 | `tipos-codigos-qr` | Guías | 2024-03-05 |
| 6 | `qr-eventos` | Eventos | 2024-03-03 |

- Script de seed (o inserción manual vía admin): crear los 6 posts con `status: published`, `publishedAt` original, `excerpt` = excerpt actual, `content` = texto del post (el array actual solo tiene excerpt — el contenido completo se redacta o se deja el excerpt como cuerpo inicial).
- Imágenes: subir `public/blog/*.jpg` a la colección `media` (→ R2) y asignarlas como `cover`.
- Limpieza en qr-app: el `page.tsx` deja de tener el array hardcodeado (pasa a fetch con ISR); `public/blog/*.jpg` se elimina del bundle.

## 4. Mockups / Referencias

- [Payload 3 — Getting Started](https://payloadcms.com/docs/getting-started/overview)
- [Payload — MongoDB adapter](https://payloadcms.com/docs/database/mongodb)
- [Payload — Storage adapters (S3/R2)](https://payloadcms.com/docs/upload/storage-adapters)
- [Next.js — ISR (App Router)](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Next.js — revalidatePath / revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- Diagrama de arquitectura: sección 3.1

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **Payload app separada (`qr-cms`)** | Aislamiento total (el CMS jamás rompe dashboard/pagos); versiones de Next independientes; admin no contamina el bundle de qr-app | Un servicio más en Railway + docker-compose | ✅ **Elegido** (decisión usuario 2026-08-19) |
| Payload embebido en qr-app | Un solo servicio | Comparte proceso con producción; build más pesado; riesgo de tumbar auth/pagos | ❌ |
| **Repo Git independiente (`cms-qr-portaqr`)** | Un cambio en la plataforma jamás dispara un build del CMS (y viceversa); deploy independiente en Railway; patrón del proyecto (cada servicio = repo propio) | Repo adicional que gestionar | ✅ **Elegido** (decisión usuario 2026-08-19) |
| Código del CMS en el monorepo | Un solo repo | Un push a la plataforma podría disparar build del CMS; acopla ciclos de deploy | ❌ |
| **Cloudflare R2 (S3 adapter)** | Ya hay patrón en el proyecto (SPEC-005); fuera del bundle; CDN; costo ~cero de egress | Requiere custom domain para servir (o r2.dev) | ✅ **Elegido** |
| Storage local de Payload | Cero configuración | Imágenes en el servidor; sin CDN; se pierden en redeploy | ❌ |
| **YouTube para videos** | Transcodificación, ancho de banda y player gratis; `youtube-nocookie` respeta privacidad | Dependencia de terceros; no es video propio | ✅ **Elegido** |
| Subir videos a R2 | Control total | Peso, transcodificación, egress, player propio | ❌ |
| **ISR (revalidate 3600 + on-demand)** | SEO estático + publicación sin redeploy; resiliente a CMS caído (RN-4) | Complejidad del webhook; latencia de regeneración | ✅ **Elegido** |
| SSG puro (build-time) | Máxima simplicidad | Publicar = redeploy de qr-app | ❌ |
| SSR (dinámico) | Siempre fresco | Sin páginas estáticas; peor SEO/performance; carga al CMS en cada visita | ❌ |
| **MongoDB: BD `portaqr_cms` en la misma instancia** | Cero infra nueva; aislamiento lógico | Comparte instancia con `sistema` | ✅ **Elegido** |
| Instancia MongoDB separada | Aislamiento físico | Costo y operación extra | ❌ (opcional futuro) |
| **REST API de Payload** | Simple, suficiente para lectura | GraphQL disponible si se necesita | ✅ **Elegido** |
| **`@payloadcms/plugin-seo` + campos custom** | Previews en vivo en el admin (Google/OG/Twitter); control total por artículo (RF-3.1); cero código en qr-app para el mapeo | Un plugin más; los campos custom hay que definirlos | ✅ **Elegido** |
| Solo `metaTitle`/`metaDescription` | Mínimo | Sin control de OG/Twitter/canonical/noindex por artículo | ❌ |

> [!note] Consideraciones
> - **Repo independiente**: `qr-cms` vive en su propio repo Git (patrón del proyecto: cada servicio es un repo separado clonado en `desarrollo-qr/<servicio>/`). El monorepo raíz ya ignora `desarrollo-qr/*` (excepto `docker-compose.yml`), así que no requiere cambios de `.gitignore`. El `Dockerfile`, `.dockerignore` y `.env.example` se versionan en el repo de `qr-cms`; el `qrCms.env` es local (no versionado).
> - **Admin en producción**: decisión usuario 2026-08-19 — se usa la URL directa de Railway (sin subdominio custom por ahora). El admin no se indexa y requiere auth. A futuro se puede exponer en `cms.portaqr.cl` (CNAME) sin tocar el enrutamiento del dominio principal.
> - **Compatibilidad Payload ↔ Next**: qr-cms es independiente; si Payload 3.x aún no soporta Next 16, qr-cms usa la versión que Payload requiera (15.x). Verificar en la instalación.
> - **Render del contenido Lexical**: qr-app renderiza el JSON de `content` con el componente `RichText` de `@payloadcms/richtext-lexical/react` (instalar el paquete en qr-app con la misma versión que qr-cms) o convirtiendo a HTML en qr-cms. Decisión de implementación — preferir el renderer oficial de Lexical.
> - **CORS**: no aplica — qr-app consume la API server-side (fetch en server components/route handlers).
> - **R2 bucket**: crear bucket `portaqr-blog` y habilitar custom domain (o `r2.dev`) para servir imágenes públicamente. El endpoint S3 solo se usa para uploads.
> - **`next/image`**: agregar `remotePatterns` con el dominio público de R2 en `next.config.ts` de qr-app.
> - **Next 16 — `revalidateTag` cambió de firma** (verificado 2026-08-19): ahora requiere un segundo argumento `profile` (`revalidateTag('blog', 'max')` = stale-while-revalidate, recomendado para blogs). La nueva `updateTag(tag)` (expiración inmediata) **solo** funciona en Server Actions, no en Route Handlers — por eso el webhook usa `revalidateTag('blog', 'max')` + `revalidatePath('/blog')`.
> - **Next 16 — tipos `OpenGraph`/`Twitter`**: son uniones discriminadas por `type`/`card` (el miembro base no los tiene). Al acceder en tests, castear (`as { type?: string }`). Las imágenes requieren `url` no-undefined (filtrar antes de asignar).

## 6. Plan de implementación

| # | Paso | Detalle |
|---|---|---|
| 1 | Marcar SPEC-010 desestimada | ✅ Hecho (2026-08-19) |
| 2 | Crear repo `cms-qr-portaqr` + proyecto `qr-cms` | Crear repo Git independiente (patrón del proyecto) y clonarlo en `desarrollo-qr/qr-cms`; `npx create-payload-app@latest` (template website o blank) dentro; verificar compatibilidad Next/Payload; versionar Dockerfile/.dockerignore/.env.example en el repo |
| 3 | Configurar Payload | `payload.config.ts`: mongooseAdapter (BD `portaqr_cms`), lexicalEditor, s3Storage (R2), colecciones Users/Media/Categories/Posts |
| 4 | Colección Posts | Campos RF-3 + hooks `afterChange`/`afterDelete` de revalidación (3.2) |
| 5 | Seed posts | Migrar los 6 posts + subir imágenes a R2 (3.7) |
| 6 | Blog público en qr-app | `page.tsx` con ISR + `[slug]/page.tsx` con `generateStaticParams`/`generateMetadata` (3.3) |
| 7 | Búsqueda y filtros | `blog.service.ts` (getPosts con q/tag/page), `BlogSearchBar`, `BlogTagFilter`, `BlogPostCard`, `BlogPagination` (RF-11/RF-12, 3.3) |
| 8 | Webhook revalidate | `src/app/api/revalidate/route.ts` (3.3) |
| 9 | SEO | sitemap con posts, JSON-LD, OG, canonical, `remotePatterns` R2 (3.3) |
| 10 | YouTubeEmbed | Componente + campo `youtubeUrl` (3.4) |
| 11 | docker-compose | Servicio `qr-cms` (3005) + variables en `qrApp.env` (3.6) |
| 12 | Verificación | CA-01 a CA-11 |

> [!info] Siguiente paso
> Registrar tareas de esta SPEC en `docs/tareas/SPEC-023-tareas.json` (formato Taskmaster-compatible) antes de implementar.

---

## 7. Estado de implementación (2026-08-19)

| Área | Estado | Notas |
|---|---|---|
| `qr-app` (blog público + ISR + búsqueda + SEO) | ✅ **Implementado** | Rama `feat/spec-023-blog-payload-cms-isr` (5 commits). Suite 44 suites / 271 tests verdes, tsc/lint/build OK |
| `qr-cms` (proyecto Payload 3.88 + Next 16) | ✅ **Implementado** | Repo Git propio `desarrollo-qr/qr-cms` (2 commits). Admin en `http://localhost:3005/admin` (HTTP 200, healthy) |
| Colecciones + plugin SEO + R2 | ✅ **Implementado** | Users/Media/Categories/Posts + `seoPlugin` + `s3Storage` (R2, deshabilitado si no hay bucket) |
| Webhook revalidación (qr-cms → qr-app) | ✅ **Implementado** | Hook `afterChange`/`afterDelete` en Posts; verificado: `POST /api/revalidate` → 200 y regenera el blog |
| Seed (6 posts + categorías + admin) | ✅ **Implementado** | `scripts/seed.ts` idempotente; 6 posts publicados visibles en `/blog` |
| docker-compose | ✅ **Implementado** | Servicio `qr-cms` (3005, healthy) + `PORT=3005` (Next usa PORT) + `CMS_URL`/`REVALIDATE_SECRET` en qr-app |
| **CA-01** admin :3005 | ✅ | HTTP 200 + login verificado (`admin@portaqr.cl`) |
| **CA-02** publicar → /blog sin redeploy | ✅ | Verificado: webhook revalida y el blog se actualiza |
| **CA-03** /blog/[slug] con SEO | ✅ | HTTP 200 con contenido (JSON-LD verificado en tests) |
| **CA-04** sitemap con posts | ✅ | `/sitemap.xml` incluye `/blog/*` |
| **CA-05** imágenes R2 | ✅ | Verificado: media subida a R2 (`pub-...r2.dev/test-r2-1.png`, HTTP 200) y `next/image` la optimiza (remotePatterns) |
| **CA-06** YouTube embed | ✅ | Verificado: post `video-codigos-qr` con `youtube-nocookie.com/embed/...`, `loading="lazy"`, `allowFullScreen` |
| **CA-07** 6 posts migrados | ✅ | Verificado en `/blog` |
| **CA-08** qr-app sin regresión | ✅ | 271 tests verdes |
| **CA-09** /api/revalidate 401/200 | ✅ | Verificado 200; 401 cubierto en tests |
| **CA-10** qr-cms apagado → /blog responde | ✅ | Verificado: con `qr-cms` detenido, `/blog` y `/blog/[slug]` responden 200 con caché ISR |
| **CA-11** búsqueda texto + tag | ✅ | Verificado `/blog?tag=seguridad`; texto cubierto en tests |

> [!note] Pendientes para cerrar la SPEC
> - ✅ **Repo remoto**: conectado a GitHub (`FabioBustosTech/cms-qr-portaqr`, rama `main`) — 2026-08-19. Pendiente: desplegar en Railway (conectar el repo al servicio `qr-cms`).