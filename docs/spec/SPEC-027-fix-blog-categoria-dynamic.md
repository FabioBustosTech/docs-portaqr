---
title: "SPEC-027: Corrección DYNAMIC_SERVER_USAGE en /blog/categoria/[slug] — conflicto ISR estático vs searchParams dinámico"
date: 2026-08-30
tags:
  - spec
  - blog
  - cms
  - payload
  - nextjs
  - isr
  - sitemap
  - seo
  - cache
  - bugfix
status: borrador
aliases:
  - SPEC-027
  - Fix DYNAMIC_SERVER_USAGE categoria
---

# SPEC-027: Corrección DYNAMIC_SERVER_USAGE en /blog/categoria/[slug]

> [!abstract] Decisión clave
> La ruta `/blog/categoria/[slug]` hoy es ISR estática (`export const revalidate=60` + `generateStaticParams` + `next:{tags:['blog']}`) pero lee `searchParams` dinámicos (`q/tag/page`). En `next dev` se tolera; en `next build`/`next start` (`output:'standalone'`) Next 16 lanza `DYNAMIC_SERVER_USAGE` y la página queda 500 solo en producción. `/blog` y `/blog/[slug]` no fallan porque no combinan ambos mundos. La SPEC corrige el contracto de render: la categoría pasa a **dinámica bajo demanda con cache de datos** (fetch `revalidate:60` + tags) en vez de shell estático, manteniendo SEO y eliminando el 500. Se corrige además el crash defensivo del sitemap (`qrData.data.map`).

> [!info] Metadatos
> - **Estado:** Borrador (2026-08-30)
> - **Fecha:** 2026-08-30
> - **Autor:** Equipo Plataforma QR — diagnóstico arquitectura
> - **Componente destino:** `desarrollo-qr/qr-app/` (`src/app/blog/categoria/[slug]/page.tsx`, `src/services/blog.service.ts`, `src/app/sitemap.ts`)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (base ISR), [[SPEC-023-C-blog-hibrido-isr-inmediato]] (híbrido `revalidate:60` + tags granulares), [[SPEC-023-D-media-r2-flag-y-binding]]
> - **Incidente:** `https://portaqr.cl/blog/categoria/novedades` → `500 digest:'DYNAMIC_SERVER_USAGE'` (42 eventos 03:31-03:55 UTC) mientras `https://portaqr.cl/blog` y `portaqr.cl/blog/[slug]` OK — H2 descartada (CMS_URL OK)
> - **Evidencia:** logs Railway `DYNAMIC_SERVER_USAGE` + sitemap `TypeError: Cannot read properties of undefined (reading 'map') at qrData.data.map`

---

## 1. Objetivo

Eliminar el 500 solo-prod de `/blog/categoria/novedades` sin perder SEO ni frescura, y cerrar el crash defensivo del sitemap.

| Hoy | Con SPEC-027 |
|---|---|
| `GET /blog` OK, `GET /blog/marketing-digital` OK, `GET /blog/categoria/novedades` 500 solo en prod (`next start` standalone) | Las tres rutas OK en prod y local (`build+start`) |
| Local Docker corre `npm run dev` (etapa `development` del Dockerfile) → nunca reproduce | `npm run build && npm start` reproduce y luego verifica fix |
| `sitemap.xml` loguea `TypeError .map` si `NEXT_PUBLIC_BFF_URL` bakeada apunta mal o hay `429` | `sitemap.ts` defensivo: si `qrData.data` falta → `[]` + log warn, no throw |

**No es infra ni CMS.** Es corrección de wiring de App Router (segment config).

---

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Categoría sin 500).** `GET /blog/categoria/:slug` debe responder `200` en prod (`next start` standalone) con y sin `?q=&tag=&page=` y para slugs nuevos (`dynamicParams:true`). Si `slug` no existe → `404` (`notFound()`), no 500. Si no hay posts con filtro → estado vacío amigable, no 500.

- **RF-2 (Contracto dinámico correcto).** La página debe declararse dinámica a nivel segmento para poder leer `searchParams` (`Promise`) sin violar ISR estático. El cache pasa de **shell estático** a **cache de datos**: `blogService` sigue con `next:{tags:['blog','category:slug'], revalidate:60}` + `revalidateTag('blog')` del webhook. La página en sí no se prerenderiza como HTML estático en build; se cachea por datos (Data Cache).

- **RF-3 (Paridad con /blog).** `/blog` usa `revalidate:60` + `searchParams` y se salva por `permanentRedirect`. La categoría debe usar el mismo mecanismo explícito (segment config) sin depender de `permanentRedirect` como side-effect.

- **RF-4 (Sitemap defensivo).** `src/app/sitemap.ts:26` `qrData.data.map` debe tolerar `undefined` (BFF caído, `429`, `NEXT_PUBLIC_BFF_URL` mal bakeada): `qrUrls = (qrData?.data ?? []).map(...)` + log `warn` y continuar con `[]`. Nunca debe hacer throw que deje el sitemap vacío (`staticRoutes` + `blogUrls` + `categoryUrls` siempre retornan).

- **RF-5 (SEO preservado).** `generateMetadata` de categoría sigue retornando `title/description/canonical` por `getCategoryBySlug` (fetch cacheado). La página sigue siendo indexable (`/blog/categoria/:slug` en sitemap) aunque el shell sea dinámico — el crawler recibe HTML completo con `BlogPostCard` y `BlogFeaturedPost`.

- **RF-6 (Safety net).** Si `qr-cms` cae, la categoría sirve cache Data (60s) y luego estado vacío; no 500. `blogService` ya retorna `[]`/`null` con `try/catch` — se mantiene.

### 2.2 Reglas de negocio

- **RN-1 (Cuándo es estático vs dinámico).** En App Router, una ruta que `await searchParams` es dinámica por definición. Declarar `export const revalidate` sin `dynamic` fuerza validación estática en build; `force-dynamic` la desactiva. La regla es: **si lees `searchParams`, declara `dynamic`**.

- **RN-2 (No tocar CMS_URL).** H2 descartada: `CMS_URL` prod OK (blog funciona). No se cambia env ni wiring de `qr-cms`.

- **RN-3 (Tags siguen vigentes).** `revalidateTag('blog')` y `revalidateTag('category:slug')` del webhook (`src/app/api/revalidate/route.ts`) siguen invalidando Data Cache aunque la página sea dinámica.

### 2.3 Criterios de aceptación

- [ ] **CA-01 (500 eliminado).** `npm run build && npm start` local + `curl -i http://localhost:3000/blog/categoria/novedades` → `200` (antes `500 DYNAMIC_SERVER_USAGE`). En Railway prod `https://portaqr.cl/blog/categoria/novedades` → `200` con hero + grid, y `?q=qr&tag=seguridad&page=2` también `200`.

- [ ] **CA-02 (404 correcto).** `GET /blog/categoria/no-existe-xyz` → `404` (no 500). `generateMetadata` con slug inexistente → `{}` y no throw.

- [ ] **CA-03 (Sitemap no crashea).** Con `NEXT_PUBLIC_BFF_URL` vacía o BFF detenido, `GET /sitemap.xml` → `200` con `staticRoutes` + `blogUrls` + `categoryUrls` (aunque `qrUrls:[]`) y sin `TypeError .map` en logs. Con BFF OK, `qrUrls` vuelve a poblarse.

- [ ] **CA-04 (No regresión).** `GET /blog` y `GET /blog/[slug]` siguen `200` y SEO OK (`generateMetadata`, JSON-LD). `tsc --noEmit`, `eslint`, `next build`, suites `qr-app` (>380 tests) verdes.

- [ ] **CA-05 (Cache datos).** Con `dynamic` la página no queda `HIT` de Full Route Cache, pero los `fetch` de `blogService` siguen `HIT` de Data Cache (header `x-nextjs-cache` o timing <50ms tras segundo request). Webhook `POST /api/revalidate` con `categorySlug:novedades` invalida `category:novedades` y siguiente request regenera.

---

## 3. Diseño Técnico

### 3.1 Causa raíz (diagnóstico que motiva la SPEC)

```
next dev (local Docker)        next build (prod standalone)
  CategoryPage                   generateStaticParams() → fetch tag 'blog' → [novedades,...]
  await searchParams ✅ OK       prerender HTML estático revalidate:60 → cacheado
                                 request /blog/categoria/novedades → intenta reusar shell estático
                                 → CategoryPage await searchParams → DYNAMIC_SERVER_USAGE 💥
```

`src/app/blog/page.tsx:45` se salva por `permanentRedirect` (marca ruta como dinámica). `src/app/blog/[slug]/page.tsx` no usa `searchParams`. La categoría es la única que combina ambos.

> [!important] Por qué NO se replica en local Docker
> El servicio `qr-app` del `docker-compose.yml` corre `command: sh -c "npm install && npm run dev"` (etapa `development` del Dockerfile). **`npm run dev` nunca ejecuta `generateStaticParams` ni la prerenderización estática** — solo `npm run build` lo hace. Por eso, aunque `qrApp.env` define `CMS_URL=http://qr-cms:3005` (idéntico a prod), en local Docker el error no aparece: la página nunca se prerenderiza como shell estático.
>
> Para reproducir en local Docker:
> 1. Cambiar el `command` del servicio a `sh -c "npm install && NODE_ENV=production npm run build && NODE_ENV=production npm start"` (o ejecutar dentro del contenedor `docker compose exec qr-app sh -c "NODE_ENV=production npm run build && NODE_ENV=production npm start"`).
> 2. Asegurar que `qr-cms` esté corriendo (para que `generateStaticParams` obtenga categorías reales).
> 3. Visitar `http://localhost:3000/blog/categoria/novedades` → 500 `DYNAMIC_SERVER_USAGE`.
>
> > [!warning] `NODE_ENV=production` es OBLIGATORIO para `build`/`start` en docker
> > `qrApp.env` y el compose setean `NODE_ENV=development`. Con `NODE_ENV=development`, `next build` **falla prerenderizando páginas estáticas** (`/ayuda`, `/documentacion`, `/_global-error`) con `TypeError: Cannot read properties of null (reading 'useContext'/'useReducer')`. `next build`/`next start` esperan `NODE_ENV=production`. Se añadió además `src/app/_global-error.tsx` explícito (client component sin AuthProvider) para que el `_global-error` por defecto de Next 16 no renderice el layout raíz (AuthProvider → useReducer) durante la prerenderización.

Log Railway 03:31-03:55 x42 confirma triple `DYNAMIC_SERVER_USAGE` por request (metadata+page+layout). Log 03:21 `sitemap.ts:26 qrData.data.map` es bug separado defensivo.

### 3.2 Cambio en `qr-app`

**`src/app/blog/categoria/[slug]/page.tsx` (único archivo con cambio de comportamiento):**

```ts
// antes (SPEC-023-C)
export const revalidate = 60
export const dynamicParams = true
export async function generateStaticParams() {
  const categories = await blogService.getAllCategories();
  return categories.map((cat) => ({ slug: cat.slug }));
}

// después (SPEC-027) — opción recomendada A
export const dynamic = 'force-dynamic' // ← permite searchParams sin violar estático
export const dynamicParams = true
export async function generateStaticParams() {
  return []; // ← CLAVE (Next 16): difiere toda la prerenderización a runtime
}
// revalidate a nivel página se elimina; el revalidate queda en fetch (Data Cache)
```

> [!warning] Hallazgo Next 16 (verificado en build)
> **`force-dynamic` SOLO no basta.** Con `generateStaticParams` retornando categorías reales, el build sigue marcando la ruta como `● (SSG)` y el `DYNAMIC_SERVER_USAGE` persiste. La documentación de Next 16 exige que `generateStaticParams` retorne `[]` para diferir toda la prerenderización a runtime (la ruta se renderiza on-demand al primer request). El sitemap no depende de esto: obtiene las categorías vía `blogService.getAllCategories()` directamente. Verificado: `npm run build && npm start` → `/blog/categoria/novedades` 200, `?q=qr&tag=seguridad&page=2` 200, slug inexistente 404, `/sitemap.xml` 200 sin `TypeError`.

**Mantener:**
```ts
export async function generateStaticParams(){ /* opcional: mantener para sitemap/SEO pero con dynamic no prerenderiza shell; puede quedar o eliminarse */ }
export async function generateMetadata({params}){ const c=await blogService.getCategoryBySlug(slug); ... }
export default async function CategoryPage({params, searchParams}){ const [{slug},{q,tag,page}] = await Promise.all([params, searchParams]); ... }
```

Todos los `blogService.*` siguen con `this.fetchOptions(['blog','category:slug'])` → `next:{tags, revalidate:60}`. El webhook `api/revalidate/route.ts:44-54` ya hace `revalidateTag('category:slug','max')` + `revalidateTag('blog','max')`.

**`src/app/sitemap.ts:22-31` (defensivo):**

```ts
// antes
const qrData = await qrService.getSeoIdqr(baseUrl)
qrUrls = qrData.data.map(...)

// después
let qrUrls: MetadataRoute.Sitemap = []
try {
  const qrData = await qrService.getSeoIdqr(baseUrl)
  const items = (qrData as any)?.data ?? []
  if (!Array.isArray(items)) console.warn('[sitemap] qrData.data no es array', qrData)
  qrUrls = (Array.isArray(items) ? items : []).map(item => ({
    url: `${baseUrl}/qr/${item.id}`,
    lastModified: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))
} catch (e) { console.error('Error al obtener las rutas dinámicas para el sitemap:', e) }
```

Mismo patrón ya usado en `blogUrls`/`categoryUrls` (try/catch → `[]`).

### 3.3 Qué NO cambia

- `src/services/blog.service.ts`: sin cambios (ya retorna `[]`/`null` en catch — RN-4 SPEC-023).
- `src/app/blog/page.tsx` y `src/app/blog/[slug]/page.tsx`: sin cambios.
- `qr-cms` (Payload hooks): sin cambios — H2 descartada.
- `next.config.js` `output:'standalone'`: sin cambios.
- Envs `CMS_URL`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_*`: sin cambios.

### 3.4 Flujo tras fix

```
build: generateStaticParams() retorna [] → no prerenderiza shell (force-dynamic) → build OK sin DYNAMIC

request /blog/categoria/novedades?q=qr
  → CategoryPage force-dynamic → await searchParams OK
  → fetch getCategoryBySlug tag 'category:novedades' revalidate:60 → Data Cache MISS/HIT
  → fetch getPosts category=novedades revalidate:60 → Data Cache
  → render 200
  → webhook POST /api/revalidate {categorySlug:'novedades'} → revalidateTag('category:novedades') → next request MISS y regenera
```

### 3.5 Contratos de API

| Endpoint | Antes | Después |
|---|---|---|
| `GET /blog/categoria/:slug` | ISR estático `revalidate:60` | Dinámico `force-dynamic` + Data Cache `revalidate:60` |
| `GET /sitemap.xml` | throw si `qrData.data` undefined | siempre `200` con `[]` fallback |

---

## 4. Mockups / Referencias

- [Next.js — `dynamic` segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic) — `force-dynamic` desactiva Full Route Cache y permite `searchParams`
- [Next.js — `revalidate` vs `dynamic`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#revalidate) — `revalidate` en página con `force-dynamic` no genera shell estático; el `revalidate` útil queda en `fetch`
- [Next.js — `generateStaticParams` + `dynamicParams`](https://nextjs.org/docs/app/api-reference/functions/generateStaticParams)
- [Next.js — `DYNAMIC_SERVER_USAGE` (discussions)](https://github.com/vercel/next.js/discussions/64067) — ISR + `searchParams` → `dynamic:'force-dynamic'`
- Código tocado: `desarrollo-qr/qr-app/src/app/blog/categoria/[slug]/page.tsx:18`, `src/app/sitemap.ts:15-31`, `src/services/blog.service.ts:50`

---

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **A. `dynamic='force-dynamic'` en categoria (recomendada)** | Fix 1 línea, elimina 500, mantiene Data Cache 60s + tags, `searchParams` nativo | Pierde Full Route Cache estático (HTML no se cachea como archivo, solo datos) — ~5-30ms extra por request | ✅ **Elegida** — con volumen blog actual (<100 posts) irrelevante; SEO sigue 200 con HTML completo |
| B. Mantener ISR y mover `searchParams` a Client (`useSearchParams` + Suspense) | Mantiene shell estático | Reescribe filtros/paginación a cliente, pierde SEO de `?q=` server-render | ❌ Mayor churn, no justifica |
| C. `export const revalidate=0` o quitar `revalidate` sin `dynamic` | Elimina shell estático implícitamente | Semántica menos explícita que `force-dynamic`; Next lo infiere pero no documenta | ❌ Menos legible que A |
| D. `dynamic='error'` (forzar que falle en build si alguien reintroduce searchParams) | Detecta regresión en CI | No fixa prod, solo hace fallar build | 🔜 Como guard opcional post-fix |
| Sitemap defensivo `?.data ?? []` | 3 líneas, nunca más `TypeError .map` | Oculta que BFF no respondió (pero ya hay log warn) | ✅ Incluido |

> [!note] Consideraciones
> - **SEO:** `force-dynamic` no es `no-index`. El crawler recibe `200` con HTML completo + `canonical` + JSON-LD. La diferencia es que no hay `.html` en `.next/server` sino render on-demand con Data Cache — para SEO es indistinguible. `sitemap.xml` es `force-dynamic` hoy y ya es indexable.
> - **Performance:** Con `revalidate:60` en fetch, 10k visitas/día a `/blog/categoria/*` son ~1.4k fetches/día a Mongo (igual que antes) — el costo del `force-dynamic` es CPU de render, no DB.
> - **Alternativa futura:** si tráfico justifica, migrar a `dynamic='auto'` + `revalidate:60` y cachear shell estático por `slug` pero paginar/filtrar vía `?` en cliente con `router` — hoy no necesario.

---

## 6. Plan de implementación

| # | Paso | Detalle | Rama |
|---|---|---|---|
| 1 | Segment config categoria | `src/app/blog/categoria/[slug]/page.tsx`: añadir `export const dynamic='force-dynamic'`, mantener `dynamicParams:true`, eliminar `export const revalidate=60` (o dejar pero documentar que `force-dynamic` prevalece) | `qr-app@feat/spec-027` |
| 2 | Sitemap defensivo | `src/app/sitemap.ts:26` → `(qrData?.data ?? []).map` + `Array.isArray` guard + `warn` | misma rama |
| 3 | Tests | `src/app/blog/categoria/[slug]/page.spec.tsx`: assert `dynamic === 'force-dynamic'` y render con `searchParams` mock no throwa; `src/app/sitemap.spec.ts` nuevo: `qrData.data undefined → []` | misma rama |
| 4 | Verificación | `npm run build && npm start` → `curl -i /blog/categoria/novedades` 200, `.../no-existe` 404, `...?q=qr&page=2` 200; `curl /sitemap.xml` 200 con BFF detenido | — |
| 5 | Deploy | Merge a `main` → Railway redeploy (solo `qr-app`) — `CMS_URL`/`NEXT_PUBLIC_*` sin cambios | — |

> [!info] Siguiente paso
> Registrar tareas en `docs/tareas/SPEC-027-tareas.json` (formato Taskmaster-compatible) antes de implementar. No crear `.taskmaster/`.

---

## 7. Estado de implementación

| Área | Estado | Notas |
|---|---|---|
| `qr-app` categoria `dynamic` + `generateStaticParams:[]` | ✅ Implementado | Rama `feat/spec-027` (repo `qr-app`) |
| `qr-app` sitemap defensivo | ✅ Implementado | Rama `feat/spec-027` (repo `qr-app`) |
| Verificación CA-01..05 | ✅ Local OK | `npm run build && npm start` → 200/404/200; pendiente deploy Railway |
