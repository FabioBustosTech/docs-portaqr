---
title: "Nota: Paso a producción — SPEC-023 (Blog con Payload CMS + R2 + MongoDB + ISR)"
date: 2026-08-19
tags:
  - despliegue
  - produccion
  - variables
  - env
  - blog
  - payload
  - cms
  - r2
  - isr
  - spec-023
status: activo
aliases:
  - Despliegue producción SPEC-023
  - Paso a producción blog Payload
  - Blog producción
---
```
const ADMIN_EMAIL = process.env.PAYLOAD_ADMIN_EMAIL || 'admin@portaqr.cl'
const ADMIN_PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD || 'AdminPortaQR2026!'
```
# Nota de despliegue a producción — SPEC-023 (Blog con Payload CMS + R2 + MongoDB + ISR)

> [!important] Resumen
> La SPEC-023 agrega el **blog** a la plataforma: un CMS **Payload 3.x** como app Next.js separada (`qr-cms`, repo propio `cms-qr-portaqr`) con **MongoDB** (BD `portaqr_cms`) e **imágenes en Cloudflare R2**, y el blog público en `qr-app` (`/blog` + `/blog/[slug]`) con **ISR** (revalidate 3600 + webhook on-demand). Para producción se necesitan: **un servicio nuevo en Railway** (`qr-cms`) con **~10 variables**, **3 variables nuevas en `qr-app`** (1 de ellas `NEXT_PUBLIC_*` → **obliga rebuild**), y **un bucket R2** para las imágenes del blog.

---

## 🟣 NUEVO SERVICIO `qr-cms` (Railway) — TODAS las variables

> [!critical] Crear el servicio
> Crear un servicio **nuevo** en Railway conectado al repo `cms-qr-portaqr` (rama `main`). Build: `npm ci && npm run build`; Start: `npm start`. El admin del CMS se expone vía **URL directa de Railway** (decisión usuario 2026-08-19 — NO se enruta bajo `portaqr.cl`; el dominio público solo lee datos vía REST).

### Obligatorias

| Variable            | Descripción                                                                                                                                                      | Valor (ejemplo)                                                     |     |        |                                                                  |        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --- | ------ | ---------------------------------------------------------------- | ------ |
| `PAYLOAD_SECRET`    | Secreto de Payload (generar con `openssl rand -hex 32`)                                                                                                          | `<hex 64>`                                                          |     |        |                                                                  |        |
| `DATABASE_URL`      | Conexión MongoDB a la BD **`portaqr_cms`** (misma instancia que `sistema`, BD separada)                                                                          | `mongodb://<user>:<pass>@<host>:27017/portaqr_cms?authSource=admin` |     | `PORT` | Puerto de escucha de Next.js (Next usa `PORT`, no `SERVER_PORT`) | `3005` |
| `QR_APP_URL`        | URL de `qr-app` para el **webhook de revalidación** — **recomendado: URL interna de Railway** (servicio a servicio, más rápida y no depende del dominio público) | `https://<qr-app>.railway.internal`                                 |     |        |                                                                  |        |
| `REVALIDATE_SECRET` | Secreto **compartido** con `qr-app` (webhook `/api/revalidate`)                                                                                                  | `<hex 64>`                                                          |     |        |                                                                  |        |

### Cloudflare R2 (imágenes) — opcionales (si vacío, storage deshabilitado)

| Variable | Descripción | Valor (ejemplo) |
| --- | --- | --- |
| `R2_BUCKET` | Bucket R2 de imágenes del blog | `portaqr-blog` |
| `R2_ACCESS_KEY_ID` | Access Key de R2 | `<key>` |
| `R2_SECRET_ACCESS_KEY` | Secret Key de R2 (**secreto**) | `<secret>` |
| `R2_ENDPOINT` | Endpoint S3 de R2 — **solo uploads** (no sirve archivos) | `https://<accountId>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_URL` | URL pública que **sirve** las imágenes (custom domain o `r2.dev`) | `https://media.portaqr.cl` |

### Seed / admin — opcionales (con defaults en `scripts/seed.ts`)

| Variable                 | Descripción                                                                  | Valor (ejemplo)     |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------- |
| `PAYLOAD_ADMIN_EMAIL`    | Email del usuario admin (default `admin@portaqr.cl`)                         | `admin@portaqr.cl`  |
| `PAYLOAD_ADMIN_PASSWORD` | Password del admin (default `AdminPortaQR2026!` — **cambiar en producción**) | `<password fuerte>` |

### MCP server (agentes de IA) — opcional

| Variable      | Descripción                                                                                                       | Valor (ejemplo) |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- |
| `MCP_API_KEY` | API Key del MCP (colección `payload-mcp-api-keys`). Se crea con `npx tsx scripts/create-api-key.ts` o en el admin | `pk_mcp_...`    |

> [!info] `SERVER_PORT` no aplica
> `SERVER_PORT` es convención de los backends NestJS. **Next.js usa `PORT`** — sin `PORT`, el servicio escucha en 3000 por defecto (verificado 2026-08-19).

> [!info] `QR_APP_URL` — ¿dominio público o URL de Railway?
> Para el webhook de revalidación (qr-cms → qr-app), el orden de preferencia es:
> 1. **URL interna de Railway** (`https://<qr-app>.railway.internal`) — servicio a servicio, más rápida, no pasa por Cloudflare ni depende del dominio público. **Recomendada** si Railway expone la red privada.
> 2. **`https://portaqr.cl`** (dominio público) — funciona siempre, pero el webhook pasa por Cloudflare (hop extra). Útil si no hay red privada.
> 3. **URL pública de Railway** (`https://<qr-app>.up.railway.app`) — **no recomendada** si el dominio público está configurado (hop innecesario y la URL puede cambiar).

> [!info] Base de datos `portaqr_cms`
> La BD del blog es **`portaqr_cms`** (separada de `sistema`). En local, el nombre se define en la variable de entorno **`CMS_DB_NAME`** del servicio `mongo` en `docker-compose.yml` (la lee `mongo-init.js`, con fallback a `portaqr_cms`); Payload también la crea automáticamente al conectarse. En producción, asegurar que el usuario de `DATABASE_URL` tenga permisos de lectura/escritura sobre `portaqr_cms` (si se usa MongoDB Atlas, crear la BD o el usuario con acceso a ella).

> [!note] Seed inicial (una sola vez)
> El primer usuario admin y los 6 posts migrados se crean con `npx tsx scripts/seed.ts` (idempotente). **Cambiar la contraseña del admin tras el primer login.**

---

## 🔵 FRONTEND (`qr-app`) — TODAS las variables

### Nuevas de la SPEC-023

| Variable | Obligatoria | Descripción | Valor (ejemplo) |
| --- | --- | --- | --- |
| `CMS_URL` | ✅ | URL del servicio `qr-cms` (server-side, **NUNCA `NEXT_PUBLIC_`** — no se expone al cliente) | `https://<qr-cms>.up.railway.app` |
| `REVALIDATE_SECRET` | ✅ | Secreto **compartido** con `qr-cms` (debe coincidir) | `<hex 64>` |
| `NEXT_PUBLIC_R2_PUBLIC_HOST` | ⚠️ | Hostname público de R2 para `next/image` (`remotePatterns`). Solo si se usan imágenes R2 | `media.portaqr.cl` |

> [!critical] `NEXT_PUBLIC_R2_PUBLIC_HOST` se inlinea en **build time**
> Las variables `NEXT_PUBLIC_*` se incrustan en el bundle durante el build. **Cambiar solo el valor NO es suficiente**: hay que definirla en Railway y hacer un **redeploy con rebuild**. `CMS_URL` y `REVALIDATE_SECRET` son server-side → **no requieren rebuild** (se leen en runtime).

### Ya existentes (relevantes para el blog — verificar que estén)

| Variable | Descripción | Valor (ejemplo) |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Base del sitemap/canonical (default `https://portaqr.cl`) | `https://portaqr.cl` |
| `NEXT_PUBLIC_BFF_URL` | URL del backend (proxy de API routes) | `https://<backend>.up.railway.app` |
| `JWT_PUBLIC_KEY` | Llave pública RS256 para verificar JWT (auth) | `-----BEGIN PUBLIC KEY-----...` |
| `ACCESS_TOKEN_MAX_AGE` / `REFRESH_TOKEN_MAX_AGE` | Duración de cookies (segundos) | `3600` / `604800` |
| `NEXT_PUBLIC_APP_NAME` | Nombre de la app (branding) | `Porta QR` |
| `NEXT_PUBLIC_SEO_TITLE` | Título SEO por defecto | `Porta QR - Gestión de Códigos QR` |

> [!info] Otras variables existentes de `qr-app`
> Webpay (`NEXT_PUBLIC_WEBPAY_*`), Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`), rate limiting (`QR_*_RATE_*`), etc. — ver [[NOTA-despliegue-produccion-SPEC-003]] y las specs correspondientes. La lista completa está en `desarrollo-qr/qr-app/.env.example`.

---

## ☁️ Cloudflare R2 — Configuración (una sola vez)

1. **Bucket nuevo**: `portaqr-blog` (o el nombre de `R2_BUCKET`).
2. **Acceso público**: habilitar **custom domain** (recomendado, ej. `media.portaqr.cl`) o `r2.dev` para servir las imágenes. El endpoint S3 (`R2_ENDPOINT`) **solo se usa para uploads** — no sirve archivos.
3. **`R2_PUBLIC_URL`** (qr-cms) y **`NEXT_PUBLIC_R2_PUBLIC_HOST`** (qr-app) deben apuntar al mismo dominio público.

> [!note] Si no se configura R2
> El blog funciona igual (storage deshabilitado → imágenes locales), pero **CA-05 no se cumple** (imágenes no servidas desde R2). Para producción con imágenes reales, configurar R2.

---

## 📦 Ramas / código pendiente de mergear

| Repo | Rama | Contenido |
| --- | --- | --- |
| `docs-portaqr` | `feat/spec-023-blog-payload-cms-isr` (qr-app) | Spec + tareas + nota de despliegue |
| `qr-app` | `feat/spec-023-blog-payload-cms-isr` | Blog público con ISR (`/blog`, `/blog/[slug]`), búsqueda por texto/tag, webhook `/api/revalidate`, sitemap con posts, componentes `src/components/blog/`, 271 tests verdes |
| `cms-qr-portaqr` (nuevo) | `main` | Payload 3.88 + Next 16, colecciones Users/Media/Categories/Posts, plugin SEO, storage R2, hook de revalidación, `scripts/seed.ts`, Dockerfile |

> [!warning] Dependencias nuevas
> - **`qr-cms`**: `payload`, `@payloadcms/*` (3.88.0), `next` 16.3.0, `sharp`. Requiere **Node ≥ 24.15** (Dockerfile `node:24-alpine`).
> - **`qr-app`**: sin dependencias npm nuevas (el render del contenido usa `BlogRichText` propio; a futuro se puede adoptar `@payloadcms/richtext-lexical/react`).
> - En docker local tras merge: `docker compose up -d --build qr-cms qr-app`.

---

## 📋 CHECKLIST de despliegue

1. **Merge** de las ramas a `main` (qr-app + docs; repo `cms-qr-portaqr` ya en GitHub con su `main`)
2. **`qr-cms` (Railway — servicio NUEVO)**:
   - [ ] Conectar repo `cms-qr-portaqr` (rama `main`), build `npm ci && npm run build`, start `npm start`
   - [ ] **Obligatorias**: `PAYLOAD_SECRET`, `DATABASE_URL` (BD `portaqr_cms`), `PORT`, `QR_APP_URL`, `REVALIDATE_SECRET`
   - [ ] **R2** (si aplica): `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_URL`
   - [ ] **Seed/admin** (opcional): `PAYLOAD_ADMIN_EMAIL`, `PAYLOAD_ADMIN_PASSWORD`
   - [ ] **MCP** (opcional): `MCP_API_KEY`
   - [ ] Deploy + verificar admin en la URL de Railway (`/admin` responde 200)
   - [ ] Ejecutar seed: `npx tsx scripts/seed.ts` (admin + 6 posts) — o crear el admin desde el navegador
3. **`qr-app` (Railway)**:
   - [ ] **Nuevas**: `CMS_URL`, `REVALIDATE_SECRET` (+ `NEXT_PUBLIC_R2_PUBLIC_HOST` si R2)
   - [ ] **Verificar existentes**: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BFF_URL`, `JWT_PUBLIC_KEY`, `ACCESS_TOKEN_MAX_AGE`, `REFRESH_TOKEN_MAX_AGE`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SEO_TITLE`
   - [ ] **Redeploy con rebuild** si se definió `NEXT_PUBLIC_R2_PUBLIC_HOST`
4. **Cloudflare R2**: bucket `portaqr-blog` + custom domain público
5. **Smoke test**:
   - `https://portaqr.cl/blog` → lista los 6 posts
   - `https://portaqr.cl/blog/marketing-digital` → 200 con contenido + metadata SEO
   - `https://portaqr.cl/blog?tag=seguridad` → filtra por tag
   - `https://portaqr.cl/sitemap.xml` → incluye `/blog/*`
   - **Publicar un post en el admin de qr-cms** → aparece en `/blog` **sin redeploy** (webhook ISR)
   - `POST /api/revalidate` sin secreto → `401`; con secreto → `200`

---

## ⚠️ Post-despliegue

- **Verificar el webhook**: al publicar/editar un post en el admin, `qr-cms` debe llamar a `POST {QR_APP_URL}/api/revalidate` (revisar logs de `qr-cms` si no aparece).
- **Rotación de secretos**: `PAYLOAD_SECRET` y `REVALIDATE_SECRET` deben rotarse periódicamente (actualizar en AMBOS servicios a la vez).
- **Backup de la BD `portaqr_cms`**: incluirla en el backup de MongoDB (hoy solo se respalda `sistema`).
- **Admin en producción**: por ahora se usa la URL directa de Railway. A futuro se puede exponer en `cms.portaqr.cl` (CNAME) sin tocar el enrutamiento del dominio principal.

---

## Referencias

- [[SPEC-023-blog-payload-cms-isr]] — spec completa del blog (RF, CA-01..11, arquitectura)
- [[NOTA-despliegue-produccion-SPEC-002]] — variables R2 base y configuración del bucket
- [[NOTA-despliegue-produccion-SPEC-003]] — variables de auth (RS256) y checklist general Railway
- Payload docs: https://payloadcms.com/docs
- Next.js ISR: https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration

---

## 🤖 MCP server de Payload (agentes de IA)

`qr-cms` expone el CMS como **servidor MCP** (`@payloadcms/plugin-mcp`) en `POST /api/mcp` para que agentes de IA (opencode, Claude, Cursor) gestionen el blog directamente.

- **Endpoint**: `POST {CMS_URL}/api/mcp` (JSON-RPC 2.0, streamable HTTP)
- **Auth**: `Authorization: Bearer <MCP_API_KEY>` (colección `payload-mcp-api-keys`, NO las API Keys de users)
- **Crear key**: `npx tsx scripts/create-api-key.ts` (o en el admin → grupo MCP → API Keys). **Importante**: la API Key debe tener habilitados los permisos por collection (posts/media/categories con find/create/update/delete) — sin permisos, `tools/list` no devuelve tools.
- **Config opencode** (`.opencode/opencode.json`):
  ```json
  {
    "mcp": {
      "payload": {
        "type": "remote",
        "url": "http://localhost:3005/api/mcp",
        "headers": { "Authorization": "Bearer <MCP_API_KEY>" },
        "enabled": true
      }
    }
  }
  ```
- **Producción**: usar `{env:MCP_API_KEY}` en el header (no hardcodear la key) y proteger el endpoint (la key es la única barrera).

> [!warning] Bug conocido del plugin MCP 3.88 con zod 4 (parcheado)
> El plugin usa `convertedFields.partial()` y `convertedFields.shape` que **no existen en zod 4** (Payload 3.88 usa zod 4.4.3; `jsonSchemaToZod` genera código de zod 3 y el fallback es `z.record` sin `.shape`). Esto hacía fallar el registro de las tools "Update" → `tools/list` daba "Method not found"/timeout. **Fix**: `scripts/patch-mcp-zod4.mjs` (se re-aplica en `postinstall`) parchea `resource/update.js` y `global/update.js` para tolerar shape undefined. Además, las collections deben habilitarse explícitamente en `mcpPlugin({ collections: {...} })` (sin esto `getEnabledSlugs` devuelve `[]`).

> [!warning] Bug del MCP en producción (Next standalone) — `req.body` es un ReadableStream (parcheado)
> En **Next standalone** (producción), `req.body` de Payload es un **`ReadableStream`** (no un objeto). El `createRequestFromPayloadRequest` original lo pasaba directo al `new Request()` → el handler MCP hacía `JSON.parse("[object ReadableStream]")` → error `Expected property name or '}' in JSON at position 1`. **Fix** (en `patch-mcp-zod4.mjs`): `createRequestFromPayloadRequest` ahora es **async**, lee el stream a texto (`getReader` + `Buffer.concat`) y lo **re-emite como nuevo `ReadableStream`** (el transport MCP espera un stream, no un string). Además, `mcp.js` hace `await createRequestFromPayloadRequest(req)`. Verificado en producción: `tools/list` responde con las tools.

> [!note] Permisos de la API Key del MCP
> La API Key creada con `create-api-key.ts` **no habilita `delete`** por default. Para las 13 tools completas, en el admin → grupo **MCP** → **API Keys** → editar la key → marcar `delete` en posts/media/categories.
