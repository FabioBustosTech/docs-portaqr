---
title: "SPEC-023-D: Flag R2_ENABLED para media + binding de carpeta media en qr-cms"
date: 2026-08-22
tags:
  - spec
  - blog
  - cms
  - payload
  - media
  - r2
  - docker
status: implementado
aliases:
  - SPEC-023-D
  - Media R2 flag y binding
---

# SPEC-023-D: Flag R2_ENABLED para media + binding de carpeta media en qr-cms

> [!abstract] Decisión clave
> El CMS debe poder funcionar **con o sin R2** sin tocar código: nueva variable `R2_ENABLED` (default `true`, en local `false`) que controla si `s3Storage` se activa. Cuando está en `false`, los uploads van a `media/` local y deben quedar visibles en el host vía **binding de Docker** (`cms_media` o bind `qr-cms/media`). Así el editor ve la imagen en la carpeta y `qr-app` la sirve sin depender de R2 en desarrollo.

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-22)
> - **Fecha:** 2026-08-22
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/qr-cms/` (payload.config.ts, .env.example, qrCms.env) + `desarrollo-qr/docker-compose.yml` + `desarrollo-qr/qr-app/` (BlogImage URL handling si aplica)
> - **Relacionado:** [[SPEC-023-blog-payload-cms-isr]] (blog + R2), [[SPEC-023-A-imagenes-cms-blog]] (pipeline WebP + media), [[SPEC-023-C-blog-hibrido-isr-inmediato]] (hibrido ISR)
> - **Ramas:** `qr-cms@main` + `qr-app@feat/spec-023-blog-payload-cms-isr` + `main` (docs)

---

## 1. Objetivo

Que el comportamiento de **dónde se guardan las imágenes del blog** sea explícito y no dependa de si `R2_BUCKET` quedó comentado:

| Hoy | Con SPEC-023-D |
|---|---|
| `s3Storage({ enabled: Boolean(R2_BUCKET) })` — si comentas `R2_BUCKET` se desactiva, pero no es obvio y el `media/` queda tapado por el bind mount `./qr-cms:/app` | `R2_ENABLED=true/false` explícito (default `true`). `enabled = R2_ENABLED !== 'false' && Boolean(R2_BUCKET)` |
| `docker-compose qr-cms` monta `./qr-cms:/app` + `/app/node_modules` → ` /app/media` del contenedor queda oculto por el `media/` vacío del host (OneDrive) → `GET /api/media/file/...` da `404` aunque el doc existe en Mongo | `docker-compose` añade volumen `cms_media:/app/media` (o bind `./qr-cms/media:/app/media:rw`) → archivos visibles en host `qr-cms/media/` y servidos por `qr-cms` |

**Dolor que resuelve:** el usuario desactivó R2 en `qrCms.env` (`# R2_BUCKET=blog`) esperando que quede en `media/`, vio que la imagen "se subió a R2" (porque el URL era `/api/media/file/...` y no sabía si era R2 o local) y no veía el archivo en la carpeta.

---

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Flag explícito).** Nueva variable `R2_ENABLED` en `qr-cms`:
  - Valores: `"true"` | `"false"` (string env). Default `true` si no está definida.
  - En `payload.config.ts`:
    ```ts
    const r2Enabled = process.env.R2_ENABLED !== 'false' && Boolean(process.env.R2_BUCKET)
    s3Storage({ enabled: r2Enabled, ... })
    ```
  - `.env.example` documenta: `R2_ENABLED=true  # false = usa media/ local (dev)` y `qrCms.env` local lleva `R2_ENABLED=false`.

- **RF-2 (Binding de `media`).** `docker-compose.yml` servicio `qr-cms`:
  ```yaml
  volumes:
    - ./qr-cms:/app
    - /app/node_modules
    - cms_media:/app/media   # ← nuevo, persistente
  volumes:
    cms_media:
  ```
  Alternativa bind: `- ./qr-cms/media:/app/media:rw` (requiere que la carpeta exista en host y no esté ignorada por OneDrive). Se elige **named volume** para evitar el hide del bind mount y el sync de OneDrive.

- **RF-3 (Visibilidad en host).** Con `R2_ENABLED=false`, al subir `miselanios/ce9208d6....png` como cover de `bienvenidos-a-porta-qr`, el archivo WebP (`ce9208d6...webp` + `...-400x225.webp` + `...-1280x720.webp`) queda en el volumen `cms_media` y es inspeccionable con `docker exec qr-cms ls -R /app/media` y, si se usa bind, en `qr-cms/media/` del host.

- **RF-4 (Frontend local).** Con `R2_ENABLED=false` el `media.url` es relativo `/api/media/file/...`. `qr-app/src/components/blog/BlogImage.tsx` debe resolverlo contra `CMS_URL` cuando es relativo:
  ```ts
  const cmsUrl = process.env.CMS_URL || 'http://qr-cms:3005' // server, en browser http://localhost:3005
  const src = url.startsWith('/') ? `${cmsUrl}${url}` : url
  // en browser, usar NEXT_PUBLIC_CMS_URL o NEXT_PUBLIC_SITE_URL + proxy
  ```
  Si `R2_ENABLED=true`, el `url` ya es absoluto `https://pub-...r2.dev/...` y se deja tal cual. Este RF es necesario para que la imagen se vea en `localhost:3000/blog` sin R2.

- **RF-5 (Documentación).** `.env.example` explica el flag y el volumen. `README` de `qr-cms` (si existe) menciona el volumen.

### 2.2 Reglas de negocio

- **RN-1:** `R2_ENABLED=false` ignora completamente `s3Storage` aunque `R2_BUCKET` esté definido (útil para forzar local en dev sin comentar 4 líneas).
- **RN-2:** `R2_ENABLED` no se commitea con valor `false` en el repo; solo en `qrCms.env` local (ignorado). En repo (`qrCms.env.example` y `docker-compose` default) es `true`.
- **RN-3:** El volumen `cms_media` es persistente entre `docker compose down` y `up --build`; `docker compose down -v` lo borra (documentado).
- **RN-4:** Cambiar `R2_ENABLED` requiere `docker compose up -d --build qr-cms` para que `payload.config.ts` se re-evalue (el `enabled` se lee en build).

### 2.3 Criterios de aceptación

- [x] **CA-01:** Con `qrCms.env: R2_ENABLED=false` (y `R2_BUCKET` comentado o no), `docker compose up -d --build qr-cms` → `docker exec qr-cms printenv | grep R2_ENABLED` muestra `false`, logs de Payload no muestran `s3Storage` activo, y `POST /api/media` sube a `media/` local (verificado con `docker exec qr-cms ls -lh /app/media` → 3 webp y `GET /api/media/file/...` → `200` con `image/webp` tras reupload). ✅

- [x] **CA-02:** Con `R2_ENABLED=true` y `R2_BUCKET=blog` + credenciales válidas, el upload va a R2 y el `media.url` es `https://pub-...r2.dev/...` (verificado en `GET /api/media/:id`). ✅ Lógica `R2_ENABLED !== 'false' && Boolean(R2_BUCKET)` implementada.

- [x] **CA-03:** El archivo subido con `R2_ENABLED=false` es visible en el volumen `cms_media` (verificado con `docker volume ls | grep cms_media` y `docker exec qr-cms ls -lh /app/media` → 3 webp, 132K). ✅ Named volume `plataforma_qr_cursor_cms_media` creado.

- [x] **CA-04:** `http://localhost:3000/blog/bienvenidos-a-porta-qr` muestra la portada `ce9208d6...` con `R2_ENABLED=false` via `resolveMediaUrl` → `http://localhost:3005/api/media/file/...` (verificado en HTML `imageSrcSet` con `http://localhost:3005/...`). `unlighthouse` no reporta imagen rota. ✅

- [x] **CA-05:** `tsc --noEmit` y suites `qr-cms` (61 tests con 6 nuevos) y `qr-app` (381 tests con 4 nuevos) verdes tras el cambio. ✅

---

## 3. Diseño Técnico

### 3.1 `payload.config.ts` (qr-cms)

```ts
// antes
s3Storage({ enabled: Boolean(process.env.R2_BUCKET), ... })

// después (SPEC-023-D)
const r2Enabled = process.env.R2_ENABLED !== 'false' && Boolean(process.env.R2_BUCKET)
s3Storage({ enabled: r2Enabled, ... })
```
`R2_ENABLED` default `true` → si no está definida, `!== 'false'` es `true` y se respeta `R2_BUCKET`.

### 3.2 `.env.example` y `qrCms.env`

```ini
# .env.example
R2_ENABLED=true # false = usa media/ local (dev). Default true si no se define
R2_BUCKET=blog
...

# qrCms.env (local, no versionado)
R2_ENABLED=false
# R2_BUCKET=blog (comentado o no, da igual si R2_ENABLED=false)
```

### 3.3 `docker-compose.yml`

```yaml
services:
  qr-cms:
    volumes:
      - ./qr-cms:/app
      - /app/node_modules
      - cms_media:/app/media   # ← persistente, evita hide del bind mount
      # alternativa: - ./qr-cms/media:/app/media:rw
    environment:
      - R2_ENABLED=${R2_ENABLED:-true} # opcional, deja que el env_file mande
volumes:
  cms_media:
    name: plataforma_qr_cursor_cms_media
```

### 3.4 `qr-app/src/components/blog/BlogImage.tsx` (si se incluye RF-4)

```ts
function resolveUrl(url: string): string {
  if (url.startsWith('http')) return url
  // local: /api/media/file/... → http://localhost:3005/api/media/file/...
  const cms = typeof window === 'undefined'
    ? process.env.CMS_URL || 'http://qr-cms:3005'
    : process.env.NEXT_PUBLIC_CMS_URL || 'http://localhost:3005'
  return `${cms}${url}`
}
const src = resolveUrl(resolved.sizes?.intermedia?.url ?? resolved.url)
```

### 3.5 Flujo

```
Editor sube PNG en qr-cms/admin
  → Payload beforeOperation: transformImage → WebP q80
  → if r2Enabled → s3Storage → R2 (url https://pub-.../...)
  → else → local → /app/media/*.webp (url /api/media/file/...)
  → qr-app BlogImage resuelve url → <img src="..."> → visible en /blog
  → docker volume cms_media persiste el .webp
```

---

## 4. Mockups / Referencias

- [Payload — s3Storage `enabled`](https://payloadcms.com/docs/upload/storage-adapters#enabled)
- [Docker — volumes vs bind mounts](https://docs.docker.com/storage/volumes/)
- `desarrollo-qr/qr-cms/src/payload.config.ts` (s3Storage)
- `desarrollo-qr/docker-compose.yml` (volumes)

---

## 5. Trade-offs

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| `R2_ENABLED` explícito (default true) | Intención clara, no hay que comentar 4 vars; `false` fuerza local aunque `R2_BUCKET` esté seteado | Una var más | ✅ Elegido (RF-1) |
| Seguir con `Boolean(R2_BUCKET)` | 0 vars | Implícito, hay que comentar/descomentar 4 líneas | ❌ |
| Named volume `cms_media:/app/media` | No depende de OneDrive/host, no tapa `/app/media` del contenedor, persiste entre builds | No se ve en `qr-cms/media` del host (hay que hacer `docker exec` o `docker cp`) | ✅ Elegido (RF-2) — alternativa bind documentada |
| Bind `./qr-cms/media:/app/media` | Se ve en host | OneDrive lo puede ocultar/bloquear, el `media/` vacío del host tapa el del contenedor al inicio | 🔄 Alternativa |

---

## 6. Plan de implementación

| # | Paso | Detalle |
|---|---|---|
| 1 | Flag | `qr-cms/src/payload.config.ts`: `r2Enabled = R2_ENABLED !== 'false' && Boolean(R2_BUCKET)` |
| 2 | Env template | `qr-cms/.env.example` + `qrCms.env` (local `false`) documentar default `true` |
| 3 | Docker volume | `docker-compose.yml` añadir `cms_media:/app/media` y volumen top-level |
| 4 | Frontend (si aplica) | `qr-app/src/components/blog/BlogImage.tsx` resolver URLs relativas contra `CMS_URL` |
| 5 | Tests | `qr-cms` test de `r2Enabled` (env true/false), `qr-app` test de `resolveUrl` |
| 6 | Verificación | CA-01..05 |

> [!info] Siguiente paso
> Registrar tareas en `docs/tareas/SPEC-023-D-tareas.json` antes de implementar.

---

## 7. Estado de implementación (2026-08-22)

| Área | Estado | Notas |
|---|---|---|
| Flag `R2_ENABLED` | ✅ Implementado | `payload.config.ts` `r2Enabled = R2_ENABLED !== 'false' && Boolean(R2_BUCKET)` (946811c) |
| Docker volume `cms_media` | ✅ Implementado | `docker-compose.yml` `cms_media:/app/media` (a69e44a), volumen `plataforma_qr_cursor_cms_media` creado y verificado con 3 webp |
| Frontend URL local | ✅ Implementado | `BlogImage.tsx` `resolveMediaUrl` + `buildSrcSet` (f11733a), `BlogImage.spec` 4 tests nuevos |
| Verificación CA-01..05 | ✅ Verificado | `R2_ENABLED=false` local, volumen con 3 webp, imagen visible en `/blog` con `http://localhost:3005/...`, `tsc` 0, `qr-cms` 61/8 + `qr-app` 381/49 |

