---
title: "Nota: Paso a producción — SPEC-023-A (Variables nuevas en qr-cms: PAYLOAD_PUBLIC_SERVER_URL y R2_ENABLED)"
date: 2026-08-28
tags:
  - despliegue
  - produccion
  - variables
  - env
  - blog
  - payload
  - cms
  - r2
  - spec-023
status: activo
aliases:
  - Despliegue producción SPEC-023-A
  - Variables nuevas qr-cms
  - PAYLOAD_PUBLIC_SERVER_URL R2_ENABLED
---

# Nota de despliegue a producción — SPEC-023-A (Variables nuevas en `qr-cms`)

> [!important] Resumen
> Esta nota **complementa** [[NOTA-despliegue-produccion-SPEC-023]] con las **2 variables de entorno nuevas** que se agregaron al servicio `qr-cms` después de la nota original (commits posteriores a `e0dede4`): **`PAYLOAD_PUBLIC_SERVER_URL`** (URLs absolutas de media) y **`R2_ENABLED`** (flag de activación de R2). Si ya desplegaste con la SPEC-023, **solo necesitas añadir estas 2 variables** y hacer redeploy — no requieren rebuild (son server-side).

---

## 🆕 Variables nuevas en `qr-cms`

### 1. `PAYLOAD_PUBLIC_SERVER_URL` — recomendada (obligatoria si `R2_ENABLED=false`)

| Variable | Obligatoria | Descripción | Valor (ejemplo) |
| --- | --- | --- | --- |
| `PAYLOAD_PUBLIC_SERVER_URL` | ✅ (recomendada) | URL pública del CMS. Alimenta `serverURL` de Payload y genera **URLs absolutas** de media (`/api/media/file/...`) cuando R2 está desactivado | `https://<qr-cms>.up.railway.app` |

- **Commit**: `9c71042` — `fix(spec-023-d): CMS genera URLs absolutas via serverURL`
- **Código**: `src/payload.config.ts` → `serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3005'`
- **Por qué**: sin esta variable, `media.url` queda **relativo** y el frontend no puede resolver las imágenes cuando `R2_ENABLED=false` (storage local). Con ella, `media.url` pasa a ser `https://<qr-cms>/api/media/file/...`.
- **En producción**: usar la URL pública de Railway del servicio `qr-cms` (o el dominio custom `cms.portaqr.cl` si se expone a futuro).

### 2. `R2_ENABLED` — opcional (default `true`)

| Variable | Obligatoria | Descripción | Valor (ejemplo) |
| --- | --- | --- | --- |
| `R2_ENABLED` | ⚠️ (default `true`) | Flag para activar/desactivar el storage R2. `false` fuerza storage local (`media/`) aunque `R2_BUCKET` esté seteado | `true` (o `false` en dev) |

- **Commits**: `946811c` (feat) + `66e9d5b` (docs) — `feat(spec-023-d): flag R2_ENABLED para media`
- **Código**: `src/payload.config.ts` → `enabled: process.env.R2_ENABLED !== 'false' && Boolean(process.env.R2_BUCKET)`
- **Semántica**:
  - **No definida** → R2 **habilitado** si `R2_BUCKET` tiene valor
  - **`true`** → igual que no definida (habilitado si hay bucket)
  - **`false`** → R2 **deshabilitado** aunque `R2_BUCKET` esté seteado (usa `media/` local, útil en dev)
- **En producción**: definir `R2_ENABLED=true` explícitamente (o dejarla sin definir) junto con las 5 variables R2 ya documentadas en la SPEC-023 (`R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_PUBLIC_URL`).

> [!info] Interacción entre ambas variables
> - `R2_ENABLED=true` + R2 configurado → las imágenes se sirven desde `R2_PUBLIC_URL` (R2).
> - `R2_ENABLED=false` → las imágenes se sirven desde `PAYLOAD_PUBLIC_SERVER_URL` (el propio qr-cms). **En este caso `PAYLOAD_PUBLIC_SERVER_URL` es obligatoria** para que el frontend resuelva las URLs.

---

## 📋 Checklist de actualización (si ya desplegaste SPEC-023)

1. **`qr-cms` (Railway)**:
   - [ ] Añadir `PAYLOAD_PUBLIC_SERVER_URL=https://<qr-cms>.up.railway.app`
   - [ ] Añadir `R2_ENABLED=true` (si usas R2) o `R2_ENABLED=false` (si usas storage local)
   - [ ] Redeploy (variables server-side → **no requieren rebuild**)
2. **Verificar**:
   - [ ] En el admin, `media.url` responde con URL absoluta (`https://<qr-cms>.../api/media/file/...`)
   - [ ] Las imágenes del blog cargan en `https://portaqr.cl/blog`
   - [ ] Si `R2_ENABLED=false`: las imágenes se sirven desde el propio qr-cms (no desde R2)

---

## ⚠️ Otros cambios de despliegue relevantes (sin variables nuevas)

> [!note] Cambios de build/comportamiento posteriores a la SPEC-023
> - **Dockerfile** (`9ba4d27`): ahora copia `scripts/` **antes** del `npm install` (el `postinstall` re-aplica `patch-mcp-zod4.mjs`). Si usas build propio, replicar este orden.
> - **Webhook granular** (`3ecb150`): el hook de revalidación ahora envía `diffKeys` y reintenta hasta 3 veces. No requiere variables nuevas, pero verifica que `QR_APP_URL` y `REVALIDATE_SECRET` estén **descomentadas** en el env (un `QR_APP_URL` comentado deja el webhook mudo — `fd8fa4c`).
> - **Bootstrap del admin** (`8e1e787`): el admin se crea automáticamente en el arranque en producción (usa `PAYLOAD_ADMIN_EMAIL`/`PAYLOAD_ADMIN_PASSWORD`). El seed manual sigue disponible.

---

## Referencias

- [[NOTA-despliegue-produccion-SPEC-023]] — nota original con TODAS las variables de `qr-cms` (obligatorias, R2, seed/admin, MCP)
- [[SPEC-023-blog-payload-cms-isr]] — spec completa del blog (RF, CA-01..11, arquitectura)
- [[NOTA-despliegue-produccion-SPEC-002]] — variables R2 base y configuración del bucket