---
title: "Nota: Variables de entorno para producción — SPEC-003"
date: 2026-08-07
tags:
  - despliegue
  - produccion
  - variables
  - env
  - spec-003
status: activo
aliases:
  - Despliegue producción SPEC-003
  - Variables nuevas eliminadas producción
---

# Nota de despliegue a producción — Variables nuevas y eliminadas (SPEC-003)

> [!important] Resumen
> La migración SPEC-003 cambió el sistema de autenticación: **HS256 (secreto compartido) → RS256 (par de llaves)** y eliminó **next-auth** del frontend. Esto introduce **4 variables nuevas** y elimina **4 variables** en los servicios.

---

## 🔴 BACKEND (`backend-portaqr`) — Variables ELIMINADAS

| Variable eliminada   | Motivo                                                         |
| -------------------- | -------------------------------------------------------------- |
| `JWT_SECRET`         | HS256 eliminado — la firma ahora es RS256 (llaves asimétricas) |
| `JWT_REFRESH_SECRET` | Ídem — un solo par de llaves firma access y refresh            |

> [!warning] En Railway/despliegues
> Eliminar estas 2 variables de la configuración del servicio. Si quedan, no se usan (0 referencias en el código), pero conviene limpiarlas.

---

## 🟢 BACKEND (`backend-portaqr`) — Variables NUEVAS (obligatorias)

| Variable nueva           | Descripción                                                        | Ejemplo                                                               |
| ------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `JWT_PRIVATE_KEY`        | Llave **privada** RSA (firma). **NUNCA exponer.**                  | `"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----"` |
| `JWT_PUBLIC_KEY`         | Llave **pública** RSA (verificación). Se comparte con el frontend. | `"-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----"`   |
| `JWT_EXPIRATION`         | Vida del access token                                              | `24h`                                                                 |
| `JWT_REFRESH_EXPIRATION` | Vida del refresh token                                             | `7d`                                                                  |

> [!tip] Generar las llaves
> ```bash
> cd desarrollo-qr/backend-portaqr
> npm run generate:jwt-env        # genera par nuevo + imprime en una línea para .env
> # o sin rotar las actuales:
> npm run generate:jwt-env -- --use-existing
> ```
> El script imprime ambas variables listas para pegar.

> [!warning] Acepta DOS formatos
> `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` aceptan:
> - **a) Contenido PEM directo** (recomendado Railway): `JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"`
> - **b) Ruta a archivo** (local): `JWT_PRIVATE_KEY=keys/jwt-private.pem`

---

## 🔴 FRONTEND (`qr-app`) — Variables ELIMINADAS

| Variable eliminada | Motivo |
| --- | --- |
| `NEXTAUTH_URL` | next-auth eliminado — ya no hay endpoint `[...nextauth]` |
| `NEXTAUTH_SECRET` | Ídem — el JWT se verifica con la llave pública RS256, no con secreto |

> [!warning] El `.env` local aún las tiene (líneas 13-15) — inofensivas pero eliminables.

---

## 🟢 FRONTEND (`qr-app`) — Variables NUEVAS (obligatorias)

| Variable nueva | Descripción | Ejemplo |
| --- | --- | --- |
| `JWT_PUBLIC_KEY` | Misma llave **pública** que el backend (con `\n` literales) | `"-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----"` |
| `ACCESS_TOKEN_MAX_AGE` | Duración cookie access (segundos) — debe coincidir con `JWT_EXPIRATION` del backend | `3600` |
| `REFRESH_TOKEN_MAX_AGE` | Duración cookie refresh (segundos) — debe coincidir con `JWT_REFRESH_EXPIRATION` | `604800` |

> [!critical] La pública debe COINCIDIR
> La `JWT_PUBLIC_KEY` del frontend **DEBE ser idéntica** a la `JWT_PUBLIC_KEY` del backend. Si difieren, toda verificación falla con 401 en todas las rutas.

---

## 🔄 Variables que CAMBIAN DE VALOR en producción

| Variable | Local (dev) | Producción |
| --- | --- | --- |
| `NEXT_PUBLIC_BFF_URL` (frontend) | `http://localhost:3004` | URL pública del backend (ej. `https://backend-portaqr.up.railway.app`) |
| `NEXT_PUBLIC_API_URL` (frontend) | `http://localhost:3001/api` | Ídem (si se usa) |
| `CORS_ORIGIN` (backend) | `http://localhost:3000` | URL pública del frontend |
| `FRONTEND_BASE_PATH` (backend) | `http://localhost:3000` | URL pública del frontend |
| `FRONTEND_URL` (backend) | `http://localhost:3000` | URL pública del frontend |
| `NODE_ENV` | `development` | `production` |
| `ENABLE_SWAGGER` (backend) | `true` | `false` (recomendado) |

---

## 📋 CHECKLIST de despliegue Railway

1. **Generar llaves** (una sola vez): `npm run generate:jwt-env` en backend → copiar las 2 líneas
2. **Backend**: agregar `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY` → **eliminar** `JWT_SECRET` + `JWT_REFRESH_SECRET`
3. **Frontend**: agregar `JWT_PUBLIC_KEY` (la misma pública) + `ACCESS_TOKEN_MAX_AGE` + `REFRESH_TOKEN_MAX_AGE` → **eliminar** `NEXTAUTH_URL` + `NEXTAUTH_SECRET`
4. **Verificar** que ambas `JWT_PUBLIC_KEY` sean **idénticas**
5. `NODE_ENV=production` → las cookies `Secure` se activan automáticamente (el código usa `isProd`)
6. Desplegar **backend primero**, luego frontend
7. **Smoke test**: login → dashboard → logout → login (flujo completo RS256)

---

## ⚠️ Post-despliegue

- **Rotación de llaves**: si rotas (`npm run generate:jwt-env` sin `--use-existing`), TODOS los tokens se invalidan → los usuarios deben volver a iniciar sesión. Actualizar también la pública del frontend.
- **`tokenVersion`**: el campo se agrega automáticamente (default 0) — no requiere migración de datos.
- **Logout real**: `POST /auth/logout` incrementa `tokenVersion` → revoca todos los tokens del usuario al instante.

---

## Referencias

- [[SPEC-003-auditoria-dependencias-qr-app]] — spec completo de la migración
- `backend-portaqr/README.md` — sección "Creación de llaves JWT (RS256)"
