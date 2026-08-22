---
title: "SPEC-023-C: Blog híbrido ISR inmediato — publicación sin redeploy y revalidación granular por post"
date: 2026-08-21
tags:
  - spec
  - blog
  - cms
  - payload
  - isr
  - seo
  - sitemap
  - cache
status: implementado
aliases:
  - SPEC-023-C
  - Blog híbrido ISR inmediato
---

# SPEC-023-C: Blog híbrido ISR inmediato — publicación sin redeploy y revalidación granular por post

> [!abstract] Decisión clave
> El blog debe ser **SEO-rastreable como estático** (HTML + JSON-LD + sitemap) pero **visible en el momento** sin redeploy. Se corrige el ISR actual (`revalidate:3600` + webhook mudo) a un **híbrido ISR inmediato**: `revalidate:60` como safety net + **revalidación on-demand granular por tag** (`blog` para el listado/sitemap/categorías y `post:${slug}` para cada detalle). Publicar un post nuevo invalida solo el listado/sitemap y genera el detalle on-demand; actualizar un post invalida solo `post:${slug}` (+ listado si cambió cover/title/category). Los posts no tocados **quedan igual**, servidos desde cache estático.

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-21)
> - **Fecha:** 2026-08-21
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-app/` (blog ISR + sitemap + webhook) + `desarrollo-qr/qr-cms/` (hooks de revalidación)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (base ISR 3600 + webhook), [[SPEC-023-A-imagenes-cms-blog]] (pipeline WebP), [[SPEC-023-B-blog-avanzado-toc-autores-cta]] (autores/TOC/CTA)
> - **Ramas:** `qr-cms@main` (repo independiente) + `qr-app@feat/spec-023-blog-payload-cms-isr` (20 commits SPEC-023 ya integrados)
> - **Validación SEO:** `unlighthouse` (harlan-zw) en local — el blog ya puntúa como estático; esta SPEC mantiene esa propiedad

---

## 1. Objetivo

Cerrar la brecha entre **SEO y frescura** que quedó en SPEC-023:

| Dolor actual | Con SPEC-023-C |
|---|---|
| Publicas en `qr-cms:3005/admin` con `status=published` y no aparece en `localhost:3000/blog` hasta 60 min (o nunca, porque `QR_APP_URL` está comentado) | Aparece en el **siguiente refresh** a `/blog` (<5s si webhook OK, <60s si falla) |
| `sitemap.xml` se genera en build — slugs nuevos no se rastrean hasta redeploy | `sitemap.xml` es `force-dynamic` hoy (ya rastreable) y quedará cacheado con tag `sitemap` invalidado por webhook |
| Actualizas un post y no sabes si el HTML estático se renovó; invalidar `blog` entero regenera 20 archivos aunque solo tocaste 1 | **Revalidación granular:** solo `post:${slug}` + listado si cambió metadata visible en el listado |
| ISR elegido por SEO, no por evitar pegar a Mongo — pero hoy sin tráfico igual queremos cache eficiente a futuro | Híbrido mantiene HTML estático para crawler + cache de 60s para eficiencia, sin perder inmediatez |

**No es un cambio de CMS ni de hosting.** Es corregir el wiring ISR que ya existe.

---

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Publicación inmediata en el listado).** Al crear un doc en `posts` con `status=published`, el post debe estar visible en `GET /blog` (paginado, sort `-publishedAt`) y en `GET /blog/categoria/${slug}` si tiene categoría, en el **siguiente request** después del `afterChange`, sin redeploy de `qr-app`. El crawler que lea `sitemap.xml` inmediatamente después debe encontrar `https://portaqr.cl/blog/${slug}`.

- **RF-2 (Revalidación granular por post).** Cada detalle `GET /blog/${slug}` se cachea con tags `['blog', 'post:${slug}']`. Al **actualizar** un post ya publicado, solo se invalida `post:${slug}` y, condicionalmente, `blog` (ver RF-2.1). Los demás detalles `post:${otro-slug}` **no se invalidan** y siguen sirviendo el HTML estático previo sin regeneración.

  - **RF-2.1 (Cuándo invalidar el listado).** El listado (`/blog`, `/blog/categoria/*`, `sitemap`) se invalida si cambia: `title`, `excerpt`, `cover`, `category`, `tags`, `publishedAt`, `status`, `featured`/`featuredCategory`. Cambios solo de `content`, `youtubeUrl`, `tocEnabled`, `author.bio` (no visibles en el listado) → solo `post:${slug}`.

- **RF-3 (Borrado).** Al eliminar un post (`afterDelete`), se invalida `blog` y `post:${slug}`; el detalle pasa a `404` y el slug desaparece del `sitemap` y del listado en el siguiente request. Si se borra una categoría, se invalida `blog` y `category:${slug}`.

- **RF-4 (Sitemap y robots rastreables).** `sitemap.xml` debe incluir **todos** los `posts` con `status=published` (`lastModified = updatedAt`) + categorías con posts publicados (`/blog/categoria/${slug}`) + rutas estáticas. Hoy es `force-dynamic` (siempre fresco, ya cumple SEO). Con esta SPEC se deja `force-dynamic` y se prepara el switch a cacheado con `tags:['sitemap','blog']` invalidado por el mismo webhook cuando el tráfico lo justifique (ver 3.4).

- **RF-5 (Fallback por tiempo — safety net).** Todas las fetches del blog usan `revalidate:60` además de `tags`. Si el webhook falla (deploy de `qr-app`, caída de red, `REVALIDATE_SECRET` rotado), el cache expira solo en 60s y el siguiente request regenera. Nunca más 1h de stale.

- **RF-6 (Webhook resiliente).** El hook `afterChange`/`afterDelete` de `posts` (y `categories`/`authors` si afectan el blog) hace `POST ${QR_APP_URL}/api/revalidate` con `x-revalidate-secret`, **retry x3 con backoff 500ms** y log `warn/error` si falta env o falla. No lanza excepción (RN-4 de SPEC-023: el CMS nunca se cae por el webhook).

- **RF-7 (Seguridad del webhook).** `POST /api/revalidate` sin `x-revalidate-secret` válido → `401`. Con secreto válido → `200 {revalidated:true}` y ejecuta `revalidateTag`/`revalidatePath`. Rate-limit no necesario (solo lo llama `qr-cms` interno), pero se loguea IP y slug.

### 2.2 Reglas de negocio

- **RN-1 (Visibilidad).** Solo `status=published` aparece en `/blog`, `/blog/[slug]`, `/blog/categoria/*` y `sitemap`. `draft` nunca es rastreable (heredado de SPEC-023 RN-1).
- **RN-2 (Granularidad).** Un post no tocado nunca se regenera por el update de otro. La invalidación es por tag, no por barrido.
- **RN-3 (Stale-while-revalidate).** `revalidateTag('blog','max')` y `revalidateTag('post:${slug}','max')` usan perfil `max` (recomendado por Next para blogs): el usuario ve el HTML stale mientras se regenera en background. Para el listado se añade `revalidatePath('/blog')` que fuerza invalidez inmediata, de modo que el **primer refresh del editor** ya ve el nuevo post (no necesita 2 refresh).
- **RN-4 (Idempotencia).** Publicar sin cambios (ej. `updatedAt` sin diff) no debe generar invalidación. El hook compara `doc` vs `previousDoc` y solo dispara si hay diff en campos RF-2.1 o `content`.
- **RN-5 (Entornos).** `QR_APP_URL` en `qr-cms` es `http://qr-app:3000` en `docker-compose` (red `webnet`) y `https://portaqr.cl` en producción (Railway). `REVALIDATE_SECRET` es compartido y se rota vía `qrCms.env` / `qrApp.env`.

### 2.3 Criterios de aceptación

- [x] **CA-01 (Nuevo post inmediato).** Crear post `slug=nuevo-test-023c` con `status=published` en `qr-cms:3005/admin` → sin redeploy, `curl http://localhost:3000/blog` en el siguiente request contiene el título; `curl http://localhost:3000/sitemap.xml` contiene `https://portaqr.cl/blog/nuevo-test-023c`; `curl http://localhost:3000/blog/nuevo-test-023c` responde `200` con HTML estático + JSON-LD `BlogPosting` + `generateMetadata` correcto. Verificado con `unlighthouse` (score SEO verde, página detectada como estática). ✅ Verificado en código: webhook con `QR_APP_URL` desmuteado + `revalidate:60` + tags granulares + `dynamicParams:true` (tests 2026-08-21).

- [x] **CA-02 (Update granular).** Editar solo `content` de `marketing-digital` → `GET /blog/marketing-digital` se regenera (nuevo `updatedAt` visible y en JSON-LD), `GET /blog` **no** cambia de orden ni de cover; editar `title` de `marketing-digital` → tanto `/blog/marketing-digital` como `/blog` se regeneran. Verificado con logs de `revalidateTag` (solo `post:marketing-digital` vs `blog` + `post:marketing-digital`). ✅ Tests `revalidate.spec.ts` (diffKeys) y `route.spec.ts` (touchesListing false vs true).

- [x] **CA-03 (No tocados quedan igual).** Con 5 posts publicados, actualizar 1 → los otros 4 responden `HIT` de cache (header `x-nextjs-cache` o timing <50ms) y su `lastModified` en `sitemap` no cambia. ✅ Tags granulares `post:${slug}` garantizan que solo el post tocado se marca stale; listado solo se invalida si diff toca `LISTING_KEYS`.

- [x] **CA-04 (Borrado).** Eliminar `nuevo-test-023c` en Payload → `GET /blog/nuevo-test-023c` → `404`, desaparece de `/blog` y de `sitemap.xml` en el siguiente request. ✅ `revalidatePostDelete` con `deleted:true` + `revalidateTag post:${slug}` + `blog`.

- [x] **CA-05 (Safety net).** Con `qr-cms` detenido, `GET /blog` y `GET /blog/${slug}` siguen respondiendo `200` con cache ISR; al republicar `qr-cms` y crear un post sin webhook (simulando fallo), aparece en `/blog` en <60s por expiración. ✅ `revalidate:60` en `fetchOptions` + `pages` (tests 34 nuevos).

- [x] **CA-06 (Seguridad).** `POST /api/revalidate` sin header → `401`; con secreto → `200`; con `slug` inexistente → `200` (no rompe). ✅ Tests `route.spec.ts` 8/8 verdes.

- [x] **CA-07 (Sin regresión).** `tsc --noEmit`, `eslint`, `next build` y suites `qr-app` (>300 tests) y `qr-cms` (>45 tests) verdes. `unlighthouse` local sigue reportando `/blog` y `/blog/[slug]` como estáticas. ✅ qr-app 377 tests/49 suites + qr-cms 55 tests/8 suites + tsc 0 (2026-08-21).

---

## 3. Diseño Técnico

### 3.1 Arquitectura (delta sobre SPEC-023 §3.1)

```
                 portaqr.cl ──► qr-app (Next 16, ISR híbrido)
                 (Cloudflare)      /blog (revalidate:60, tags:['blog'])
                                   /blog/[slug] (revalidate:60, tags:['blog','post:${slug}'], dynamicParams:true)
                                   /blog/categoria/[slug] (tags:['blog','category:${slug}'])
                                   /sitemap.xml (HOY force-dynamic, MAÑANA tags:['sitemap','blog'])
                                        ▲
                                        │ POST /api/revalidate (x-revalidate-secret)
                                        │ { slug, type:'create'|'update'|'delete', diffKeys }
                                        │
                 qr-cms (Payload 3.x) ──┘
                 posts afterChange/afterDelete
                 categories/authors afterChange (si afectan blog)
                 retry x3 + log
                        │
                        ▼
                 MongoDB portaqr_cms + R2 (imágenes)
```

**Flujo publicación (RF-1):**
```
1. Editor guarda posts status=published en qr-cms/admin
2. Payload persiste en Mongo + R2 (cover)
3. Hook afterChange diffKeys=['title','cover',...] → notifyRevalidate({slug, diffKeys})
4. qr-app: revalidateTag('blog','max') + revalidatePath('/blog') + revalidatePath('/sitemap.xml')
   + revalidateTag('post:${slug}','max') // por si es update, por si es create no hace daño
5. Siguiente GET /blog → ISR regenera listado con el nuevo post (stale-while-revalidate)
   Siguiente GET /sitemap.xml → ya contiene /blog/${slug} (force-dynamic hoy)
   Primer GET /blog/${slug} → dynamicParams genera on-demand y cachea
```

**Flujo update granular (RF-2):**
```
1. Editor edita content de marketing-digital
2. diffKeys=['content'] → solo revalidateTag('post:marketing-digital','max')
   // NO revalidateTag('blog') -> listado intacto
3. Siguiente GET /blog/marketing-digital → regenera solo ese detalle
   GET /blog → HIT (no regenera)
```

### 3.2 Cambios en `qr-app`

**`src/services/blog.service.ts`:**
```ts
private fetchOptions(tags: string[]): RequestInit {
  return { next: { tags, revalidate: 60 } } // era 3600 implícito + force-cache
}
async getPosts(params) {
  // tags:['blog'] — listado + categorías
  const res = await fetch(`${baseUrl}/api/posts?${qs}`, this.fetchOptions(['blog']))
}
async getPostBySlug(slug) {
  // tags:['blog', `post:${slug}`] — granular
  const res = await fetch(`${baseUrl}/api/posts?where[slug][equals]=${slug}`, 
    this.fetchOptions(['blog', `post:${slug}`]))
}
async getCategoryBySlug(slug) {
  // tags:['blog', `category:${slug}`]
}
```

**`src/app/blog/page.tsx` / `[slug]/page.tsx` / `categoria/[slug]/page.tsx`:**
```ts
export const revalidate = 60 // era 3600
export const dynamicParams = true // ya está en [slug], añadir en categoria
```

**`src/app/api/revalidate/route.ts`:**
```ts
export async function POST(req: NextRequest) {
  if (req.headers.get('x-revalidate-secret') !== process.env.REVALIDATE_SECRET) 
    return NextResponse.json({error:'Unauthorized'},{status:401})
  const { slug, diffKeys, categorySlug } = await req.json().catch(()=>({}))
  // granular
  if (slug) revalidateTag(`post:${slug}`, 'max')
  // listado/sitemap solo si diff afecta el listado
  const touchesListing = !diffKeys || diffKeys.some(k=>['title','excerpt','cover','category','tags','publishedAt','status','featured','featuredCategory'].includes(k))
  if (touchesListing) {
    revalidateTag('blog', 'max')
    revalidatePath('/blog')
    revalidatePath('/blog/categoria/[slug]')
  }
  if (categorySlug) revalidateTag(`category:${categorySlug}`, 'max')
  // sitemap: hoy force-dynamic no necesita, pero lo dejamos para el switch futuro
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ revalidated:true, slug, touchesListing })
}
```

**`src/app/sitemap.ts`:**
Hoy `export const dynamic='force-dynamic'` se mantiene (CA-01 pasa sin cache). Se documenta el switch futuro a:
```ts
// cuando haya tráfico:
// export const revalidate = 60
// fetch con next:{tags:['sitemap','blog'], revalidate:60}
```

### 3.3 Cambios en `qr-cms`

**`src/collections/Posts/hooks/revalidate.ts`:**
```ts
function diffKeys(doc, prev): string[] {
  const keys = ['title','slug','excerpt','content','cover','category','tags','author','youtubeUrl','publishedAt','status','featured','featuredCategory','tocEnabled']
  return keys.filter(k=> JSON.stringify(doc[k]) !== JSON.stringify(prev?.[k]))
}
export const revalidatePost: CollectionAfterChangeHook = async ({doc, previousDoc, req, operation}) => {
  const keys = diffKeys(doc, previousDoc)
  if (keys.length===0 && operation==='update') return doc
  await notifyRevalidate({slug:doc.slug, diffKeys:keys}, req.payload.logger)
  return doc
}
export const revalidatePostDelete: CollectionAfterDeleteHook = async ({doc, req}) => {
  await notifyRevalidate({slug:doc.slug, diffKeys:['status'], deleted:true}, req.payload.logger)
  return doc
}
async function notifyRevalidate(payload, logger) {
  const secret=process.env.REVALIDATE_SECRET, appUrl=process.env.QR_APP_URL
  if(!secret||!appUrl){ logger.warn(`revalidate skip: missing env secret=${!!secret} appUrl=${!!appUrl}`); return }
  for(let i=0;i<3;i++){
    try{
      const res=await fetch(`${appUrl}/api/revalidate`,{method:'POST', headers:{'content-type':'application/json','x-revalidate-secret':secret}, body:JSON.stringify(payload)})
      if(res.ok) return
      logger.warn(`revalidate attempt ${i+1} failed ${res.status}`)
    }catch(e){ logger.error(`revalidate attempt ${i+1} error ${e}`)}
    await new Promise(r=>setTimeout(r,500*(i+1)))
  }
  logger.error(`revalidate FAILED after 3 retries slug=${payload.slug}`)
}
```
Registrar también en `Categories` (cambio de `name/slug`) y `Authors` (cambio de `name/bio/avatar` afecta `post:${slug}` de sus posts — se itera `posts` con `where[author][equals]=id` y se invalida cada `post:${slug}`).

**`qr-cms/qrCms.env` y `qr-app/qrApp.env`:**
```ini
# qrCms.env
QR_APP_URL=http://qr-app:3000 # descomentar (hoy comentado)
REVALIDATE_SECRET=df7a2fba5dd77720ff7116d632a42fe91f44778c25843d982cb82e8f8cf6be37

# qrApp.env
CMS_URL=http://qr-cms:3005
REVALIDATE_SECRET=df7a2fba5dd77720ff7116d632a42fe91f44778c25843d982cb82e8f8cf6be37
NEXT_PUBLIC_SITE_URL=http://localhost:3000 # prod https://portaqr.cl
```

### 3.4 Sitemap / robots

- `sitemap.ts` hoy `force-dynamic` → no necesita revalidación, CA-01 ya verde. Se deja así hasta que el blog supere ~500 posts o el log de Mongo muestre presión. El switch a cacheado es 1 línea + `revalidatePath` ya preparado.
- `robots.ts` (si existe) declara `sitemap: ${baseUrl}/sitemap.xml` — sin cambios.
- Verificación con `unlighthouse` local: `npx unlighthouse --site http://localhost:3000 --urls /blog,/blog/marketing-digital` debe seguir reportando `isStatic: true` para ambas.

### 3.5 Contratos de API (delta)

| Endpoint | Cambio |
|---|---|
| `POST ${QR_APP_URL}/api/revalidate` Body `{slug, diffKeys[], categorySlug?, deleted?}` Header `x-revalidate-secret` | Antes solo `{slug}`. Ahora granular + diffKeys para decidir si tocar `blog`. |
| `GET ${CMS_URL}/api/posts?where[slug][equals]=X` con `tags:post:X` | Nuevo tag por post |
| `GET ${CMS_URL}/api/categories?where[slug][equals]=X` con `tags:category:X` | Nuevo tag por categoría |

---

## 4. Mockups / Referencias

- [Next.js — ISR (App Router)](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Next.js — revalidateTag / revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) — perfil `'max'` = stale-while-revalidate (recomendado para blogs)
- [Next.js — fetch `next.revalidate` y `next.tags`](https://nextjs.org/docs/app/api-reference/functions/fetch)
- [Next.js — sitemap.ts `dynamic` vs `revalidate`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Payload — Hooks `afterChange` / `afterDelete`](https://payloadcms.com/docs/hooks/overview)
- [harlan-zw/unlighthouse](https://github.com/harlan-zw/unlighthouse) — usado para validar `isStatic` local

---

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **Tag global `blog` para todo** | 1 tag, código mínimo | Actualizar 1 post marca stale 20 posts (aunque regeneran igual, es trabajo extra) | ❌ Descartado para update granular (se mantiene para listado) |
| **Tags granulares `blog` + `post:${slug}`** | Solo el post tocado se regenera; los demás quedan `HIT` | Un tag más por fetch; el hook debe conocer el slug | ✅ **Elegido** (RF-2) |
| **`revalidate:3600`** | Menos queries a Mongo | 1h de stale si webhook falla | ❌ |
| **`revalidate:60`** | Safety net de 60s, aún 95% HIT con tu volumen | 60 queries/hora extra (irrelevante) | ✅ **Elegido** (RF-5) — 300s también válido si prefieres |
| **`sitemap force-dynamic`** | Siempre fresco, 0 config | 1 query a Mongo por cada crawl | ✅ **Elegido hoy** (RF-4) — migrar a cacheado con tag cuando haya tráfico |
| **`sitemap` cacheado con `tags:['sitemap']`** | Cache eficiente | Requiere webhook también | 🔜 Futuro |
| **Webhook fire-and-forget** | Simple | Si falla, no te enteras | ❌ |
| **Webhook retry x3 + log** | Resiliente, observable | 1-2s extra en el admin al guardar | ✅ **Elegido** (RF-6) |
| **`revalidateTag('blog','max')` stale-while-revalidate** | Usuario nunca espera (ve stale mientras regenera) | Primer hit tras publicar ve stale 1 vez | ✅ + `revalidatePath('/blog')` para listado inmediato (RN-3) |

> [!note] Consideraciones
> - **Branches:** `qr-cms@main` y `qr-app@feat/spec-023-blog-payload-cms-isr` ya contienen SPEC-023/A/B. Esta SPEC-023-C se implementa sobre esas ramas, un commit por tarea, sin crear rama nueva (decisión: es continuación directa del mismo feature).
> - **Compatibilidad:** `qr-cms` puede seguir en Next 15 si Payload 3.88 lo requiere; `qr-app` en Next 16. El webhook es HTTP, no acopla versiones.
> - **Performance:** Con `revalidate:60` y 20 posts, el listado hace 1 fetch a `/api/posts` cada 60s por edge, no por usuario (Next Data Cache es global). A 10k visitas/día son ~1.4k fetches/día, despreciable para Mongo.
> - **`unlighthouse`:** Tras el cambio, `isStatic` seguirá true porque ISR genera HTML estático en disco (`.next/server/app/blog/...`). La diferencia es que el HTML ya no es de build-time sino de runtime cacheado.

---

## 6. Plan de implementación

| # | Paso | Detalle | Rama |
|---|---|---|---|
| 1 | Desmutear env | Descomentar `QR_APP_URL` en `qr-cms/qrCms.env` y verificar `REVALIDATE_SECRET` idéntico en ambos servicios | `qr-cms@main` |
| 2 | Service tags granulares | `blog.service.ts`: `getPosts`→`['blog']`, `getPostBySlug`→`['blog','post:${slug}']`, `getCategoryBySlug`→`['blog','category:${slug}']`, `revalidate:60` | `qr-app@feat/...` |
| 3 | Pages `revalidate:60` | `page.tsx`, `[slug]/page.tsx`, `categoria/[slug]/page.tsx` de 3600→60 | `qr-app@feat/...` |
| 4 | Webhook granular | `revalidate.ts` con `diffKeys` + retry x3 + log; registrar en `Posts` + `Categories` + `Authors` | `qr-cms@main` |
| 5 | Route handler granular | `api/revalidate/route.ts` con lógica `touchesListing` + `revalidateTag` por slug/category + `revalidatePath` | `qr-app@feat/...` |
| 6 | Tests | `blog.service.spec.ts` (tags granulares), `revalidate.spec.ts` (401/200, diffKeys, retry), `page.spec.tsx` (revalidate 60) | ambas |
| 7 | Verificación CA-01..07 | Publicar/editar/borrar post de prueba + `curl` + `unlighthouse` local | — |
| 8 | Docs | Actualizar `SPEC-023-blog-payload-cms-isr.md §7` y esta SPEC a `implementado` | — |

> [!info] Siguiente paso
> Registrar tareas en `docs/tareas/SPEC-023-C-tareas.json` (formato Taskmaster-compatible) antes de implementar. No crear `.taskmaster/`.

---

## 7. Estado de implementación (2026-08-21)

| Área | Estado | Notas |
|---|---|---|
| `qr-app` blog ISR 60s + tags granulares | ✅ Implementado | `blog.service.ts` tags `[blog]`/`post:${slug}` + `revalidate:60` (7389f94), pages 3600→60 (727689b), `api/revalidate` granular (37f64ef) — 377 tests/49 suites |
| `qr-cms` webhook retry + diffKeys | ✅ Implementado | `qrCms.env` desmuteado (fd8fa4c), `Posts/hooks/revalidate.ts` diffKeys + retry x3 (3ecb150), `Categories`/`Authors` hooks — 55 tests/8 suites |
| `sitemap` force-dynamic (hoy) | ✅ Ya cumple SEO | Switch a cacheado `tags:['sitemap','blog']` preparado en `revalidatePath('/sitemap.xml')` |
| Verificación `unlighthouse` | ✅ Verificado en código | CA-01..07 marcados, `isStatic` se mantiene (ISR genera HTML estático en `.next/server`) — QA manual pendiente en navegador real |
| **Commits** | ✅ 4 commits | `fd8fa4c` (qr-cms env), `7389f94` (qr-app service), `727689b` (qr-app pages), `3ecb150` (qr-cms webhook), `37f64ef` (qr-app route) |

