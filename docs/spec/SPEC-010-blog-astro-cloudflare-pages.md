---
title: "SPEC-010: Blog independiente con Astro + Cloudflare Pages (mismo dominio)"
date: 2026-08-09
tags:
  - spec
  - frontend
  - blog
  - astro
  - seo
  - cloudflare
  - infraestructura
status: desestimada
aliases:
  - SPEC-010
  - Blog Astro independiente
---

# SPEC-010: Blog independiente con Astro + Cloudflare Pages

> [!warning] DESESTIMADA (2026-08-19)
> Esta spec queda **desestimada** por decisión del equipo. El blog se implementará con **Payload CMS + Cloudflare R2 + MongoDB + ISR en qr-app** — ver [[SPEC-023-blog-payload-cms-isr]]. Se conserva como registro histórico de la alternativa evaluada (Astro + Cloudflare Pages).

> [!abstract] Decisión clave (histórica)
> Extraer el blog del monolito `qr-app` (Next.js) a un **proyecto Astro independiente** (`qr-blog`) desplegado en **Cloudflare Pages**, de modo que **publicar un artículo = push de un archivo Markdown = build de ~15 s del blog** sin tocar jamás la plataforma (Railway). El mismo dominio `portaqr.cl` se mantiene gracias a una **Origin Rule de Cloudflare** que enruta `/blog/*` → Pages y `/*` → Railway, sin subdominios (SEO intacto) y sin cookies/sesiones compartidas.

> [!info] Metadatos
> - **Estado:** Desestimada (2026-08-19)
> - **Fecha:** 2026-08-09
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-blog/` (nuevo) + `desarrollo-qr/qr-app/` (limpieza) + Cloudflare (regla)
> - **Relacionado:** [[SPEC-003]] (auditoría dependencias qr-app — contexto de deploy), [[SPEC-004]] (React Doctor qr-app), [[SPEC-023-blog-payload-cms-isr]] (reemplaza)

---

## 1. Objetivo

Que el equipo pueda **publicar artículos de blog sin redeployar la plataforma**: crear un archivo `.md`, hacer push, y que el blog se reconstruya solo (~15 s) mientras `qr-app` (dashboard, auth, Webpay) queda intacto — eliminando el riesgo de romper producción por una corrección de tipografía en un post.

Además, que todo el contenido quede en `https://portaqr.cl/blog/*` — **mismo dominio, misma autoridad SEO** — siendo servido por dos infraestructuras distintas (Railway + Cloudflare Pages) transparente para el usuario y los buscadores.

## 2. Contexto

### 2.1 Estado actual (2026-08-09)

- **Blog embebido**: `qr-app/src/app/blog/page.tsx` con **6 posts hardcodeados** en un array TS (`qr-marketing`, `qr-security`, `qr-trends`, `qr-restaurants`, `qr-types`, `qr-events`).
- **Rutas de artículo inexistentes**: los `<Link href={/blog/${post.id}}>` apuntan a páginas que **nunca se crearon** → 404. El blog nunca tuvo SEO real por artículo.
- **Sitemap**: `qr-app/src/app/sitemap.ts` lista solo `/blog` (página índice), sin artículos.
- **robots.txt**: `qr-app/public/robots.txt` — único del dominio, lo sirve el qr-app vía Railway:
  ```txt
  User-agent: *
  Disallow: /dashboard/
  Sitemap: https://portaqr.cl/sitemap.xml
  ```
- **Infraestructura**: `portaqr.cl` → Cloudflare (proxy DNS activo) → Railway (`qr-app` Next.js 16 standalone, build multi-minuto con Dockerfile).
- **Imágenes de posts**: `public/blog/*.jpg` (6 imágenes).

### 2.2 Problemas que resuelve

| Problema | Hoy | Con la SPEC |
|---|---|---|
| Publicar artículo | Editar código TS + rebuild de toda la app (minutos, riesgo) | Crear `.md` + push → build solo del blog (~15 s) |
| Riesgo de despliegue | Un typo en un post puede romper auth/pagos | Blog y plataforma aislados por completo |
| SEO por artículo | Imposible (no hay rutas) | sitemap propio, canonical, JSON-LD por post |
| Dominio | `portaqr.cl/blog` (embebido) | `portaqr.cl/blog` (servido por Pages, misma URL) |

## 3. Diseño Técnico

### 3.1 Arquitectura

```
                    portaqr.cl (DNS Cloudflare, proxy ON)
                              │
                     Cloudflare Edge
                     ┌─────────┴─────────┐
              /blog/*                     │  /* (todo lo demás)
                     ▼                     ▼
        ┌──────────────────────┐   ┌──────────────────────┐
        │ Cloudflare Pages     │   │ Railway              │
        │  qr-blog (Astro SSG) │   │  qr-app (Next.js 16) │
        │  src/content/blog/*  │   │  Dashboard, login,   │
        │  build: ~15 seg      │   │  pagos Webpay…       │
        │  https://qr-blog.pages.dev │  nunca se redeploya │
        └──────────────────────┘   └──────────────────────┘
```

**Regla de Cloudflare (Origin Rule, sin código):**

| Condición | Origen | Host header |
|---|---|---|
| `URI Path starts with /blog` | `qr-blog.pages.dev` | `qr-blog.pages.dev` |
| (default) | Railway `qr-app` | (default) |

### 3.2 Proyecto `qr-blog` (Astro)

- Ubicación: `desarrollo-qr/qr-blog/` (repo GitHub propio recomendado: `qr-blog-portaqr`, independiente por definición).
- Framework: **Astro** (SSG, cero JS por defecto → LCP óptimo).
- Contenido: **Content Collections** (`src/content/blog/*.md`) con schema validado:

  ```ts
  // src/content/config.ts (definición)
  export const blog = defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string(),          // meta description (SEO)
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      category: z.string(),
      tags: z.array(z.string()),
      cover: z.string().optional(),     // /images/...
      draft: z.boolean().default(false),
    }),
  })
  ```

- Rutas: `src/pages/blog/index.astro` (listado) y `src/pages/blog/[slug].astro` (artículo, `getStaticPaths`).
- Config clave en `astro.config.mjs`: `site: 'https://portaqr.cl'` → el sitemap genera URLs `https://portaqr.cl/blog/slug` correctas.
- Identidad visual: copiar Header/Footer del qr-app (solo presentación, sin lógica de sesión).

### 3.3 SEO y rastreo (requisito: "rastreable y SEO friendly")

| # | Elemento | Detalle |
|---|---|---|
| 1 | `@astrojs/sitemap` | Genera `https://portaqr.cl/blog/sitemap-index.xml` (+ `sitemap-0.xml`) con URLs absolutas `/blog/*` |
| 2 | `@astrojs/rss` | Feed RSS (`/blog/rss.xml`) para Google News / agregadores |
| 3 | JSON-LD `Article` | schema.org por post (headline, author, datePublished, image) |
| 4 | OpenGraph + Twitter | `og:title`, `og:description`, `og:image`, `og:url` por post |
| 5 | Canonical absoluto | `<link rel="canonical" href="https://portaqr.cl/blog/slug">` |
| 6 | `robots.txt` del dominio | Se agrega línea `Sitemap: https://portaqr.cl/blog/sitemap-index.xml` al existente (único, lo sirve qr-app) |

`robots.txt` final (qr-app, solo se añaden líneas):

```txt
User-agent: *
Disallow: /dashboard/
Sitemap: https://portaqr.cl/sitemap.xml
Sitemap: https://portaqr.cl/blog/sitemap-index.xml
```

### 3.4 Migración de posts (6 existentes)

| id | Slug propuesto | Categoría | Fecha |
|---|---|---|---|
| 1 | `marketing-digital` | Marketing Digital | 2024-03-15 |
| 2 | `seguridad` | Seguridad | 2024-03-12 |
| 3 | `tendencias-2024` | Tendencias | 2024-03-10 |
| 4 | `qr-restaurantes` | Casos de Éxito | 2024-03-08 |
| 5 | `tipos-codigos-qr` | Guías | 2024-03-05 |
| 6 | `qr-eventos` | Eventos | 2024-03-03 |

- Se extrae el contenido desde el array TS a archivos `.md` (mantener excerpt → description, imageUrl → cover).
- Imágenes: mover `public/blog/*.jpg` del qr-app a `qr-blog/public/images/`.

### 3.5 Limpieza en `qr-app` (después de migrar)

1. Borrar `src/app/blog/` (el proxy lo reemplaza).
2. Quitar `'/blog'` de `staticRoutes` en `src/app/sitemap.ts`.
3. Actualizar `public/robots.txt` (agregar sitemap del blog).
4. Links internos existentes (`/blog` en Footer, `ayuda`) siguen funcionando — los resuelve el proxy.
5. Verificar `curl -I https://portaqr.cl/blog/` → 200 servido desde Pages.

## 4. Criterios de aceptación

- [ ] CA-01: Publicar un post = agregar `.md` + push → build de Pages ≤ 60 s, sin tocar `qr-app`.
- [ ] CA-02: `https://portaqr.cl/blog/` y `https://portaqr.cl/blog/<slug>` responden 200 servidos por Cloudflare Pages (verificable con `curl -v` / `Server:` header).
- [ ] CA-03: `https://portaqr.cl/blog/sitemap-index.xml` responde 200 y lista URLs absolutas `https://portaqr.cl/blog/*`.
- [ ] CA-04: `robots.txt` del dominio declara ambos sitemaps.
- [ ] CA-05: Los 6 posts migrados son accesibles y renderizan correctamente.
- [ ] CA-06: El resto del sitio (`/`, `/dashboard`, `/login`, `/qr/:id`) sigue siendo servido por Railway sin cambios de URL.
- [ ] CA-07: Un post con `draft: true` NO aparece en el sitemap ni en producción.
- [ ] CA-08: Search Console reconoce el sitemap del blog (misma propiedad de dominio).

## 5. Mockups / Referencias

- [Referencia: Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Referencia: @astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Referencia: Cloudflare Origin Rules](https://developers.cloudflare.com/rules/origin-rules/)
- Diagrama de arquitectura: sección 3.1 (actualizar con render final si se requiere)

## 6. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **Astro + Cloudflare Pages** | Build ~15 s, cero JS, Content Collections nativo, SEO completo, aislamiento total | Stack nuevo (2º framework) | ✅ **Elegido** |
| Next.js como segunda app | Mismo framework | Mismo problema de build pesado, redundante | ❌ |
| Subdominio `blog.portaqr.cl` | Trivial | **NO es el mismo dominio para SEO** (autoridad dividida) | ❌ |
| Rewrites en `next.config.js` del qr-app | Sin infra nueva | Blog depende de que qr-app esté online (acoplamiento de disponibilidad) | ❌ (fallback) |
| Monorepo Turborepo | Todo en un repo | Complejidad; no resuelve el enrutamiento por sí solo | ❌ (opcional futuro) |

> [!note] Consideraciones
> - **robots.txt es único por dominio**: lo sigue sirviendo el qr-app. Si se quiere independencia total del punto de fallo (Railway caído), a futuro se mueve a un Worker de edge — opcional, no bloqueante.
> - **Caché**: Cloudflare cachea el HTML estático de Astro en el edge → el doble-hop (cliente → edge → Pages) es invisible en la práctica.
> - **Dominio interno de Pages**: `qr-blog.pages.dev` no se expone; toda URL pública pasa por `portaqr.cl`.
> - **Repo**: GitHub propio `qr-blog-portaqr` (recomendado) — Cloudflare Pages requiere repo Git; un repo separado garantiza que un cambio de la plataforma jamás dispare un build del blog.

## 7. Plan de implementación

| # | Paso | Detalle |
|---|---|---|
| 1 | Crear `qr-blog` | `npm create astro@latest` (template blog) en `desarrollo-qr/qr-blog` |
| 2 | Content Collections | Schema de frontmatter + validación (3.2) |
| 3 | Migrar posts | 6 `.md` + imágenes desde `qr-app` (3.4) |
| 4 | SEO | sitemap, rss, JSON-LD, OG, canonical (3.3) |
| 5 | Estilo | Header/Footer del qr-app (presentación pura) |
| 6 | Repo + Pages | Conectar `qr-blog-portaqr` a Cloudflare Pages (build `npm run build`, output `dist`) |
| 7 | Origin Rule | `/blog*` → `qr-blog.pages.dev` con Host header override |
| 8 | Limpieza qr-app | Borrar `src/app/blog/`, quitar `/blog` del sitemap, actualizar robots.txt |
| 9 | Verificación | CA-01 a CA-08 |

> [!info] Siguiente paso
> Registrar tareas de esta SPEC en `docs/tareas/SPEC-010-tareas.json` (formato Taskmaster-compatible) antes de implementar.
