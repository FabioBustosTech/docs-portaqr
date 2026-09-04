---
title: "SPEC-033: Migración npm → pnpm (qr-app, backend-portaqr, qr-cms, e2e)"
date: 2026-09-04
tags:
  - spec
  - pnpm
  - tooling
  - docker
  - qr-app
  - backend-portaqr
  - qr-cms
  - e2e
  - infraestructura
status: borrador
aliases:
  - SPEC-033
  - pnpm migration
---

# SPEC-033: Migración npm → pnpm (qr-app, backend-portaqr, qr-cms, e2e)

> [!abstract] Decisión clave
> Migrar los 4 proyectos activos de **npm 10.8.1 → pnpm 11.9.0 (via corepack)** con `packageManager` pineado, locks regenerados con `pnpm import`, Dockerfiles y `docker-compose.yml` convertidos a `pnpm --frozen-lockfile`, y workarounds npm reescritos (`overrides` → `pnpm.overrides`, `legacy-peer-deps` → flags pnpm, `patch-mcp-zod4.mjs` → mecanismo pnpm). **Estrategia gradual por riesgo creciente:** e2e → backend → qr-app → qr-cms. **Sin upgrades de frameworks.**

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-09-04
> - **Componentes destino:** `desarrollo-qr/qr-app/`, `desarrollo-qr/backend-portaqr/`, `desarrollo-qr/qr-cms/`, `desarrollo-qr/e2e-tests-portaqr/`, `desarrollo-qr/docker-compose.yml`
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]] (servicios deprecados fuera de alcance), [[SPEC-032-migracion-node-24-lts]] (precedente: pin Node 24.20, rebuild nativos), [[SPEC-023-blog-payload-cms-isr]] (qr-cms, postinstall patch)
> - **Decisión usuario (2026-09-04):** evaluar migración a pnpm en los 4 proyectos activos.

---

## 1. Objetivo

Reducir tiempos de install, disco y acoplamiento al registry (store global + hardlinks), fijar resolución reproducible con `pnpm-lock.yaml`, y alinear los 4 repos al mismo gestor.

| Hoy | Con SPEC-033 |
|---|---|
| 4× `package-lock.json` (npm), installs duplicados, `node_modules` planos gigantes | 4× `pnpm-lock.yaml`, store compartido, installs ~2-3× más rápidos |
| Dockerfiles con `npm ci/install`, `COPY package*.json`, `npx` en scripts | Dockerfiles con `corepack + pnpm install --frozen-lockfile`, `COPY package.json pnpm-lock.yaml` |
| `docker-compose.yml` con `command: npm run dev`, `npm install \|\| true` | Commands con `pnpm dev / pnpm build / pnpm start` |
| Workarounds npm: `overrides js-yaml`, `.npmrc legacy-peer-deps`, `postinstall patch-mcp-zod4.mjs` escribiendo en `node_modules` | Equivalentes pnpm: `pnpm.overrides`, `strict-peer-dependencies=false + auto-install-peers`, patch via `pnpm patch` / `patchedDependencies` |
| Sin `packageManager` (versión pnpm flotante) | `"packageManager": "pnpm@11.9.0"` en los 4 `package.json` (Nixpacks + corepack lo respetan) |

**No objetivos:** actualizar Nest/Next/Payload/Playwright, tocar servicios deprecados SPEC-001 (`bff/user/qr-service`), unificar los 4 repos en un monorepo/workspace, cambiar versiones de `mongoose`/`nanoid` (lección SPEC-001), rotar secretos.

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Pin del gestor).** En cada `package.json` agregar `"packageManager": "pnpm@11.9.0"`. Activación via `corepack enable && corepack prepare pnpm@11.9.0 --activate` en local, Docker y Railway. No usar un pnpm global flotante.
- **RF-2 (Locks regenerados, no a ciegas).** En cada repo: `pnpm import` (genera `pnpm-lock.yaml` desde `package-lock.json`) + `pnpm install --lockfile-only` + `git diff --stat` del árbol auditado. Conservar `package-lock.json` en un tag (`pre-pnpm`) para rollback; eliminarlo del branch solo cuando el deploy preview del repo esté verde.
- **RF-3 (Build scripts nativos).** Declarar en cada `package.json` que lo necesite:
  ```json
  "pnpm": { "onlyBuiltDependencies": ["sharp", "bcrypt", "esbuild"] }
  ```
  backend: `sharp + bcrypt`; qr-cms: `sharp`; qr-app: `sharp` (se agrega como dep explícita, ver RF-7) + `esbuild` si aplica. Ejecutar `pnpm approve-builds` y commitear la selección.
- **RF-4 (backend: overrides).** Migrar `"overrides": { "js-yaml": "^5.2.3" }` → `"pnpm": { "overrides": { "js-yaml": "^5.2.3" } }` (mantener compat: verificar que el audit de `js-yaml` sigue forzado con `pnpm why js-yaml`).
- **RF-5 (qr-cms: peers + patch MCP).** (a) Traducir `.npmrc` `legacy-peer-deps=true` → `strict-peer-dependencies=false` + `auto-install-peers=true` (resolver el conflicto `@modelcontextprotocol/sdk 1.26 vs 1.30` sin `--force`). (b) Reescribir `scripts/patch-mcp-zod4.mjs`: **prohibido escribir dentro de `node_modules`** (symlink al store read-only). Migrar a `pnpm patch @payloadcms/plugin-mcp` + `"pnpm": { "patchedDependencies": { ... } }`, manteniendo idempotencia y el mismo comportamiento (tools create/update exponen campos).
- **RF-6 (Dockerfiles).** En los 3 stages de cada Dockerfile (`builder`, `development`, `production`):
  - `COPY package*.json ./` → `COPY package.json pnpm-lock.yaml ./` (+ `COPY scripts/ ./scripts/` donde ya existe por postinstall).
  - `RUN npm ci / npm install [--omit=dev]` → `RUN corepack enable && corepack prepare pnpm@11.9.0 --activate && pnpm install --frozen-lockfile [--prod]`.
  - `CMD ["npm", "run", "dev"]` / `CMD ["npm", "start"]` → equivalentes `pnpm` (`CMD ["pnpm", "dev"]`, `CMD ["pnpm", "start"]`).
  - `RUN npm run build` → `RUN pnpm build`.
- **RF-7 (qr-app: sharp explícito + npx).** Agregar `"sharp"` a `dependencies` (hoy solo transitivo; `next/image` en producción lo requiere y pnpm estricto no lo hoistea). Cambiar scripts `npx eslint / npx tsc / npx react-doctor` → `pnpm exec eslint / pnpm exec tsc / pnpm dlx react-doctor`.
- **RF-8 (docker-compose.yml).** `backend-portaqr.command: npm run dev` → `pnpm dev`; `qr-cms.command: npm run dev` → `pnpm dev`; `qr-app.command: sh -c "npm install || true && ... npm run build && npm start"` → `sh -c "pnpm install --frozen-lockfile || true && pnpm build && pnpm start"`. Mantener volúmenes anónimos `/app/node_modules` (siguen válidos con `.pnpm`).
- **RF-9 (e2e).** `packageManager` + `pnpm import`. Docs: `pnpm exec playwright install --with-deps`. Sin cambios de config (`playwright.config.ts` intacto).
- **RF-10 (Windows/OneDrive).** Documentar en cada README: activar **Modo desarrollador de Windows** (symlinks) y excluir `node_modules/.pnpm` del sync de OneDrive (el repo vive en `OneDrive/Escritorio`), o mover el store: `pnpm config set store-dir`. Si EPERM persiste en dev-Windows, fallback aprobado: `node-linker=hoisted` **solo local** (nunca en Docker/Linux, para no ocultar phantom deps).
- **RF-11 (Railway).** Por servicio: verificar que el builder detecta pnpm (`pnpm-lock.yaml` + `packageManager`); fijar `NIXPACKS_PNPM_VERSION=11.9.0` si no lo infiere. Deploy preview por repo antes del merge (el workaround `npm install` tolerante de qr-cms desaparece con pnpm).

### 2.2 Reglas de negocio

- **RN-1 (Sin cambios funcionales).** La SPEC no altera lógica, endpoints, env vars ni versiones de app. Si `tsc/jest/E2E` revela incompatibilidad real, se documenta y se decide (fix mínimo vs. excepción), nunca se cuela un upgrade de framework.
- **RN-2 (Servicios deprecados fuera de alcance).** `bff-service`, `user-service`, `qr-service` no se tocan aunque tengan `package-lock.json`.
- **RN-3 (Orden gradual obligatorio).** e2e → backend → qr-app → qr-cms. No avanzar al siguiente sin el preview Railway verde del anterior. qr-cms va último (R2+R5+R8 concentrados).
- **RN-4 (Rollback por repo).** Cada repo conserva tag `pre-pnpm` con su `package-lock.json`. Rollback = `git revert` + rebuild con npm. Sin migraciones de datos, el rollback es solo de toolchain.
- **RN-5 (Sin variables nuevas).** No se agregan env vars de app; solo vars de builder (`NIXPACKS_PNPM_VERSION`) si Railway lo exige. No hay cambios en `.env.example`.

### 2.3 Criterios de aceptación

- [ ] **CA-01 (Locks).** `pnpm install --frozen-lockfile` limpio en los 4 repos, sin `--force` ni `--no-frozen-lockfile`.
- [ ] **CA-02 (Nativos).** Cero `Ignored build scripts` bloqueantes; login `bcrypt` (backend), subida imagen multilink + sanitización PDF con Ghostscript (backend), subida de media (cms), `next/image` (qr-app) funcionan.
- [ ] **CA-03 (Salud Docker).** `docker compose build --no-cache` + stack verde: `backend /health`, `qr-app /`, `qr-cms /admin`.
- [ ] **CA-04 (Calidad).** `tsc --noEmit`, `lint`, `jest` (backend/qr-app), `vitest` (cms) verdes con pnpm, mismo umbral que baseline npm.
- [ ] **CA-05 (E2E smoke).** Suite smoke Playwright (`e2e`, instalado via `pnpm exec`) verde contra el stack pnpm.
- [ ] **CA-06 (Phantom deps).** Cero `Cannot find module` nuevos vs. baseline; todo import directo está declarado en su `package.json`.
- [ ] **CA-07 (Railway).** Deploy preview OK en los 4 servicios con pnpm 11.9.0 (o variable fijada y registrada).

## 3. Diseño Técnico

### 3.1 Cambios por archivo

```
e2e-tests-portaqr/package.json      + packageManager pnpm@11.9.0 ; pnpm-lock.yaml nuevo (via pnpm import)
backend-portaqr/package.json        + packageManager ; overrides -> pnpm.overrides ; + pnpm.onlyBuiltDependencies [sharp,bcrypt]
                                      ; build: "nest build && npm run copy-assets" -> "nest build && pnpm copy-assets"
backend-portaqr/Dockerfile          3 stages: COPY pnpm-lock + corepack + pnpm install --frozen-lockfile ; CMD pnpm dev
qr-app/package.json                 + packageManager ; + sharp (dep) ; npx -> pnpm exec/dlx ; + pnpm.onlyBuiltDependencies [sharp]
qr-app/Dockerfile                   3 stages: idem backend ; RUN pnpm build ; CMD pnpm start/dev
qr-app/.npmrc                       nuevo solo si hace falta (auto-install-peers) — por defecto no crear
qr-cms/package.json                 + packageManager ; postinstall intacto hasta RF-5b ; + pnpm.patchedDependencies (MCP)
                                      + pnpm.onlyBuiltDependencies [sharp]
qr-cms/.npmrc                       legacy-peer-deps=true -> strict-peer-dependencies=false + auto-install-peers=true
qr-cms/scripts/patch-mcp-zod4.mjs   REESCRIBIR a `pnpm patch` (no escribir en node_modules)
qr-cms/Dockerfile                   3 stages: idem + COPY scripts/ antes del install (ya existe, mantener)
desarrollo-qr/docker-compose.yml    3 commands npm -> pnpm (backend, qr-app, qr-cms)
*/README.md                          notas pnpm + corepack + OneDrive/store + playwright install via pnpm exec
```

### 3.2 Análisis de compatibilidad (2026-09-04)

| Riesgo | Veredicto |
|---|---|
| pnpm 11.9 + Node 24.20 | ✅. corepack 0.35 incluido en Node 24; pin exacto reproducible |
| NestJS 11 CLI (`nest build/start`) con pnpm | ✅. Binarios en `node_modules/.bin`, `pnpm exec` los resuelve; `ts-node/tsconfig-paths` igual |
| Next 16.3 + React 19 con pnpm estricto | ⚠️. Requiere `sharp` declarado (RF-7) y `extensionAlias` de `qr-cms/next.config.ts` intacto |
| Payload 3.88 + `postinstall` escribiendo en `node_modules` | 🔴. Bloqueante sin RF-5b (store read-only). Migrar a `pnpm patch` |
| `bcrypt@6` / `sharp` (nativos, MUSL alpine) | ⚠️. Requieren `onlyBuiltDependencies` + rebuild `--no-cache` (igual lección SPEC-032) |
| `overrides js-yaml` | ⚠️. Migrar a `pnpm.overrides`, verificar con `pnpm why` |
| `legacy-peer-deps` (conflicto MCP SDK 1.26 vs 1.30) | ⚠️. Traducir a flags pnpm y validar resolución sin force |
| OneDrive `Escritorio` + symlinks Windows | 🔴 en dev-Windows sin RF-10 (EPERM). Docker/Linux no afectados |
| Railway Nixpacks + pnpm | ⚠️. Soportado (detecta `pnpm-lock.yaml`), pero exige preview por servicio (RF-11) |
| Playwright browsers | ✅. Fuera de `node_modules`; `pnpm exec playwright install` OK |
| `^` flotantes al importar (`mongoose`, `nanoid`, lección SPEC-001) | ⚠️. Auditar diff de `pnpm import`, no aceptar upgrades silenciosos |

### 3.3 Secuencia de ejecución

```
1. Baseline npm (evidencia "antes": tsc/lint/jest + node -v en contenedores + tiempos install)
2. Ramas feat/spec-033-pnpm-<e2e|backend|qr-app|qr-cms> (una por repo) + tag pre-pnpm por repo
3. e2e: packageManager + pnpm import + frozen-lockfile + playwright install (CA-01/05 piloto)
4. backend: RF-4 + RF-3 + Dockerfile + compose + CA-02/03/04
5. qr-app: RF-7 + RF-3 + Dockerfile + compose + build/start + CA-02/03/04
6. qr-cms: RF-5a/5b + RF-3 + Dockerfile + compose + /admin + media R2 + CA-02/03/04
7. Railway previews (CA-07) → merge por repo → SPEC a `implementado`
```

### 3.4 Rollback

Por repo: revertir commits de la rama `feat/spec-033-*`, restaurar `package-lock.json` desde el tag `pre-pnpm`, `docker compose build --no-cache` con npm. Sin migraciones de datos, rollback solo de toolchain. Prohibido mezclar locks (`package-lock.json` + `pnpm-lock.yaml` conviviendo) más allá de la ventana de migración del repo.

## 4. Mockups / Referencias

- Docs pnpm: `pnpm import`, `pnpm.onlyBuiltDependencies`, `pnpm.patchedDependencies` (`pnpm patch`), `.npmrc` (`strict-peer-dependencies`, `auto-install-peers`, `node-linker`, `store-dir`).
- Railway: detección pnpm via `pnpm-lock.yaml` + `packageManager`; variable `NIXPACKS_PNPM_VERSION`.
- Precedente interno: [[SPEC-032-migracion-node-24-lts]] (pins exactos, rebuild nativos, baseline antes/después).

## 5. Trade-offs

| Alternativa | Pros | Contras | Decisión |
|---|---|---|---|
| Big-bang (4 repos a la vez) | Un solo corte | Un fallo en qr-cms bloquea todo; rollback 4 repos | ❌ Rechazado |
| **Gradual e2e→backend→qr-app→qr-cms** | Revertible por repo, aprendizaje en el fácil | Más ramas/previews | ✅ Elegido (RN-3) |
| `node-linker=hoisted` global | Cero fricción Windows/OneDrive | Oculta phantom deps, diverge de Docker | ❌ Solo fallback local (RF-10) |
| Monorepo `pnpm-workspace.yaml` raíz | Un lock, deduplicación máxima | Reestructura git (4 repos → 1), fuera de alcance | ❌ Futura SPEC si se desea |
| Quedarse en npm | Cero riesgo | Sin ahorro install/disco, sin lock moderno | ❌ Rechazado por el usuario |
