---
title: "SPEC-032: Migración a Node.js 24.20 LTS (qr-app, backend-portaqr, qr-cms)"
date: 2026-09-04
tags:
  - spec
  - nodejs
  - docker
  - qr-app
  - backend-portaqr
  - qr-cms
  - e2e
  - infraestructura
status: implementado
aliases:
  - SPEC-032
  - Node 24 migration
---

# SPEC-032: Migración a Node.js 24.20 LTS (qr-app, backend-portaqr, qr-cms)

> [!abstract] Decisión clave
> `backend-portaqr` y `qr-app` corren sobre `node:20-alpine` en sus Dockerfiles, y **Node 20 está EOL desde el 2026-04-30** (sin parches de seguridad). Se migra a **`node:24.20-alpine` con pin exacto** en los 3 servicios activos (`backend-portaqr`, `qr-app`, `qr-cms` — este último ya está en `node:24-alpine` sin pin menor, se nivela al pin exacto), más `.nvmrc` + `engines` coherentes y rebuild limpio de módulos nativos (`bcrypt`, `sharp`). **Alcance cerrado:** solo servicios activos + `e2e-tests-portaqr` (`@types/node`); los servicios deprecados por SPEC-001 (`bff/user/qr-service`) **no** se tocan. **Sin cambios de código aplicativo:** el grep del 2026-09-04 confirma cero usos de APIs removidas/deprecadas (`url.parse`, `tls.createSecurePair`, `SlowBuffer`, `new Buffer`, `process.assert`).

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-04, merge a `main` en los 4 repos)
> - **Pendiente:** CA-07 (deploy de prueba en Railway con Node 24.20) — resto de criterios verificados en local
> - **Fecha análisis:** 2026-09-04
> - **Componentes destino:** `desarrollo-qr/backend-portaqr/Dockerfile`, `desarrollo-qr/qr-app/Dockerfile`, `desarrollo-qr/qr-cms/Dockerfile`, `package.json` + `.nvmrc` de cada servicio, `desarrollo-qr/e2e-tests-portaqr/package.json`
> - **Relacionado:** [[SPEC-001-migracion-monolito-modular]] (servicios deprecados fuera de alcance), [[SPEC-023-blog-payload-cms-isr]] (qr-cms ya exige Node ≥24.15), [[SPEC-005-pdf-multilink]] (Ghostscript en backend)
> - **Decisión usuario (2026-09-04):** pin exacto `24.20` (no flotante `24-alpine`), alcance solo activos + e2e.

---

## 1. Objetivo

Salir de un runtime sin soporte y dejar los 3 servicios sobre el mismo LTS activo, de forma reproducible.

| Hoy | Con SPEC-032 |
|---|---|
| `backend-portaqr` y `qr-app`: `FROM node:20-alpine` (×3 stages c/u) — Node 20 EOL 2026-04-30, **0 parches de seguridad** | Los 3 servicios: `FROM node:24.20-alpine` pineado (builder + development + production) |
| `qr-cms`: `FROM node:24-alpine` flotante (resuelve a cualquier 24.x según fecha del build) | `qr-cms` nivelado al mismo pin `node:24.20-alpine` |
| Host local en Node v24.18.0 vs contenedores en Node 20 (desalineación dev/prod) | Local (`.nvmrc` 24.20), Docker y Railway sobre el mismo minor |
| `qr-app` y `e2e-tests` con `@types/node@^20`; `backend` ya en `@types/node@^24`; `qr-app` **sin** `.dockerignore` | `@types/node@^24` en los 4 proyectos; `.dockerignore` en `qr-app` |
| Stages de producción con `npm ci --only=production` (flag legacy en npm 11, bundled con Node 24) | `npm ci --omit=dev` (mismo patrón que ya usa `qr-cms`) |

**No objetivos:** actualizar dependencias de aplicación (Nest/Next/Payload), tocar servicios deprecados SPEC-001, cambiar usuario root→non-root (se deja como SPEC futura), rotar claves JWT (RSA-2048 ya es compatible con OpenSSL 3.5).

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (Dockerfiles pineados).** En `backend-portaqr/Dockerfile` y `qr-app/Dockerfile`: reemplazar las 3 ocurrencias de `FROM node:20-alpine` por `FROM node:24.20-alpine` (stages `builder`, `development`, `production`). En `qr-cms/Dockerfile`: reemplazar las 3 ocurrencias de `FROM node:24-alpine` por `FROM node:24.20-alpine`. Ningún otro cambio en los Dockerfiles (mismo `apk`, mismos `CMD`, mismos `ARG`).
- **RF-2 (Pin local).** Crear `.nvmrc` con `24.20.0` en `backend-portaqr/`, `qr-app/` y `qr-cms/`. Agregar `"engines": { "node": "24.20.0" }` en `package.json` de `backend-portaqr` y `qr-app` (`qr-cms` ya declara `>=24.15.0` → se fija a `24.20.0` exacto para coherencia con el pin Docker).
- **RF-3 (Tipos Node 24).** Subir `@types/node` a `^24` en `qr-app` (hoy `^20`) y en `e2e-tests-portaqr` (hoy `^20.14.0`). `backend-portaqr` (`^24.13.3`) y `qr-cms` (`24.12.3`) ya están en línea 24 — solo regenerar lock.
- **RF-4 (npm 11).** En stage `production` de `qr-app`: `npm ci --only=production` → `npm ci --omit=dev`. En `backend-portaqr`: `npm install --only=production` → `npm install --omit=dev` (se mantiene `install`, solo cambia el flag legacy). (`qr-cms` ya usa `--omit=dev`.)
- **RF-5 (`.dockerignore` qr-app).** Crear `desarrollo-qr/qr-app/.dockerignore` con el mismo contenido base de `backend-portaqr` más `.next` (como el de `qr-cms`):
  `node_modules`, `npm-debug.log`, `.next`, `dist`, `.git`, `.env`, `.env.*`, `*.md`, `.gitignore`, `test`, `coverage`.
- **RF-6 (Fix menor documentado).** `backend-portaqr/Dockerfile` declara `EXPOSE 3001` pero el servicio escucha en `3004` → corregir a `EXPOSE 3004`. (Solo metadato Docker; sin efecto funcional.)
- **RF-7 (Rebuild nativo limpio).** Tras el cambio de imagen: rebuild sin caché (`docker compose build --no-cache backend-portaqr qr-app qr-cms`) para forzar recompilación de `bcrypt@6` (backend) y `sharp@0.35.3 / 0.34.2` (backend/cms) contra el ABI de Node 24 (NODE_MODULE_VERSION 137). En local: `rm -rf node_modules package-lock.json` + `npm install` con Node 24.20 (host hoy en 24.18.0 → actualizar nvm al 24.20.0 primero).
- **RF-8 (Railway).** Verificar en el dashboard que el builder de cada servicio use Node 24.20 (variables `NIXPACKS_NODE_VERSION=24.20.0` o `NODE_VERSION=24.20.0` según builder; si Railway infiere desde `engines`, basta con RF-2 — confirmar en deploy de prueba).

### 2.2 Reglas de negocio

- **RN-1 (Sin cambios funcionales).** La SPEC no altera lógica, endpoints, env vars ni versiones de dependencias de aplicación. Si `tsc`/`jest`/E2E revelan una incompatibilidad real con Node 24, se documenta y se decide (fix mínimo vs. excepción), nunca se cuela un upgrade de framework en esta SPEC.
- **RN-2 (Servicios deprecados fuera de alcance).** `bff-service`, `user-service`, `qr-service` (comentados en `docker-compose.yml` por SPEC-001) no se modifican aunque sus Dockerfiles digan `node:20`.
- **RN-3 (Pin exacto, renovación explícita).** El pin `24.20` es intencional (reproducibilidad). Adoptar un parche posterior (24.21+) requiere una mini-SPEC o tarea de mantenimiento, no un cambio silencioso.
- **RN-4 (Sin variables nuevas).** No se agregan variables de entorno → no hay cambios en `.env.example` (salvo nota de versión Node si el servicio la documenta).

### 2.3 Criterios de aceptación

- [ ] **CA-01 (Imágenes).** `docker compose build backend-portaqr qr-app qr-cms` resuelve `node:24.20-alpine` en los 9 stages (verificable con `docker inspect --format '{{.Config.Image}}'` o `node -v` → `v24.20.0` dentro de cada contenedor).
- [ ] **CA-02 (Salud).** `backend-portaqr` (`/health`), `qr-app` (`/`), `qr-cms` (`/admin`) responden OK en contenedores reconstruidos sin caché.
- [ ] **CA-03 (Nativos).** Sin errores `NODE_MODULE_VERSION` / `Module did not self-register` en logs: login con `bcrypt` (backend), subida de imagen multilink + sanitización PDF con Ghostscript (backend), subida de media (cms) funcionan.
- [ ] **CA-04 (Calidad).** `tsc --noEmit`, `lint` y suites `jest`/`vitest` verdes en los 3 servicios con Node 24.20 (mismo umbral que el baseline previo).
- [ ] **CA-05 (E2E smoke).** Suite smoke de Playwright (`e2e-tests-portaqr`) verde contra el stack en Node 24 (login + crear QR + ver `/blog`).
- [ ] **CA-06 (Warnings).** Cero `DeprecationWarning` nuevos de Node en la salida de tests respecto al baseline (comparar logs antes/después).
- [ ] **CA-07 (Railway).** Deploy de prueba en Railway con Node 24.20 OK en los 3 servicios (o registro de la variable a fijar si el builder no infiere `engines`).

## 3. Diseño Técnico

### 3.1 Cambios por archivo

```
backend-portaqr/Dockerfile   3× node:20-alpine → node:24.20-alpine ; EXPOSE 3001 → 3004 ; npm install --only=production → --omit=dev
qr-app/Dockerfile            3× node:20-alpine → node:24.20-alpine ; --only=production → --omit=dev
qr-cms/Dockerfile            3× node:24-alpine  → node:24.20-alpine   (resto idéntico)
backend-portaqr/package.json + "engines": {"node": "24.20.0"} ; .nvmrc = 24.20.0
qr-app/package.json          + "engines": {"node": "24.20.0"} ; @types/node ^20 → ^24 ; .nvmrc = 24.20.0
qr-cms/package.json          engines >=24.15.0 → 24.20.0 ; .nvmrc = 24.20.0
qr-app/.dockerignore         nuevo (ver RF-5)
e2e-tests-portaqr/package.json  @types/node ^20.14.0 → ^24
```

### 3.2 Análisis de compatibilidad (2026-09-04, verificado)

| Riesgo | Veredicto |
|---|---|
| APIs removidas Node 20→24 (`url.parse` runtime-deprecated, `tls.createSecurePair` removido, `SlowBuffer`, `new Buffer`, `process.assert`, `dirent.path`) | ✅ Grep en `src/` de los 3 servicios: **0 coincidencias**. `spawn('gs', [...array])` en `pdf-sanitizer.service.ts` es uso canónico (el deprecation cubre pasar `args` como string, no arrays) |
| NestJS 11.1.28 en Node 24 | ✅ Soportado (docs Nest: runtime ≥20.19/22.12; CLI ≥22.22.3/24.15/26+ — 24.20 cumple ambas) |
| Next 16.3 + React 19 en Node 24 | ✅ Mínimo exigido por Next 16 es Node 20.9 (docs Vercel); 24.20 lo supera |
| Payload 3.88 (`engines >=24.15.0`) | ✅ 24.20 cumple; además qr-cms ya corre en `node:24-alpine` en producción → precedente exitoso |
| `bcrypt@6` / `sharp@0.35/0.34` (módulos nativos, ABI 115→137) | ⚠️ Requieren **rebuild limpio** (RF-7); ambos publican prebuilds para Node 24 + musl (alpine) |
| OpenSSL 3.5 security level 2 (RSA <2048 prohibido) | ✅ `scripts/generate-jwt-env.js` genera RSA-2048 (mínimo exacto permitido) |
| npm 11 (bundled con Node 24) + `lockfileVersion: 3` | ✅ Compatible; solo unificar flag legacy `--only=production` → `--omit=dev` (RF-4). Nota: `qr-cms` ya usa `npm install` (no `ci`) por divergencia npm 11 vs lock — no tocar esa decisión |
| Jest 29 (backend) / 30 (qr-app) / Vitest 4 (cms), TS 5.1 (backend) / 6.0 (front/cms), `ts-node`, `tsconfig-paths` | ✅ Sin incompatibilidades conocidas con Node 24; se confirma en CA-04 |
| Ghostscript (`apk ghostscript`), `libc6-compat`, `python3/make/g++` | ✅ Paquetes Alpine independientes de la versión Node; sin cambios |
| `transbank-sdk@5`, `mongoose@8`, `jose@6` | ✅ JS puro, sin bindings nativos |

### 3.3 Secuencia de ejecución

1. Baseline: `tsc`/`lint`/`jest` verdes + `node -v` en contenedores (evidencia "antes").
2. Ramas `feat/spec-032-node-24` en `backend-portaqr`, `qr-app`, `qr-cms`, `e2e-tests-portaqr` (una por repo afectado, según workflow).
3. Aplicar RF-1..RF-6 (commits atómicos por repo).
4. `docker compose build --no-cache` + levantar stack + CA-01/CA-02/CA-03.
5. Suites + E2E smoke (CA-04/CA-05/CA-06).
6. Deploy prueba Railway (CA-07). Merge + SPEC a `implementado`.

### 3.4 Rollback

Revertir los commits de Dockerfile/`engines` (el pin anterior `node:20-alpine` sigue publicado) y reconstruir con caché. Sin migraciones de datos involucradas, el rollback es solo de imagen.

## 4. Tests

- **Unit/integración existentes como guardianes:** suites `jest` (backend, qr-app) y `vitest` (cms) deben pasar idénticas antes/después; cualquier fallo nuevo se triagea en orden: 1) rebuild nativo, 2) API deprecada Node 22–24, 3) OpenSSL/JWT.
- **E2E (Playwright, `e2e-tests-portaqr`):** smoke post-migración — login, crear QR multilink, subir imagen, listar `/blog` público (cubre backend + qr-app + qr-cms de una pasada).
- **Comparativa de warnings:** guardar `npm test 2>&1 | grep -i deprecat` del baseline y del post-migración; CA-06 exige delta cero.
