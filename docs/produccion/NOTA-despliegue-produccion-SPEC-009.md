---
title: "Nota: Paso a producción — SPEC-009 (Hardening autorización/autenticación)"
date: 2026-08-12
tags:
  - despliegue
  - produccion
  - variables
  - env
  - seguridad
  - jwt
  - refresh-tokens
  - spec-009
status: activo
aliases:
  - Despliegue producción SPEC-009
  - Paso a producción hardening autorización
  - Variables SPEC-009
---

# Nota de despliegue a producción — SPEC-009 (Hardening de autorización y autenticación)

> [!important] Resumen
> La SPEC-009 endurece autorización (ownership owner-or-admin en users/webpay/qr-activate/scan), autenticación (rotación de refresh tokens, códigos CSPRNG con límite de intentos) y criptografía (fail-fast de llaves JWT). Para producción: **1 cambio de comportamiento crítico** (las llaves JWT ahora son **obligatorias** — el backend **no arranca en prod sin ellas**), **3 variables nuevas opcionales** (con default seguro, se pueden omitir), **0 variables eliminadas**, y una **dependencia nueva de base de datos** (colección `refresh_tokens`). El frontend **no** requiere variables nuevas, pero **debe desplegarse junto con el backend** (los payloads viejos reciben 401/400).

---

## 🔴 CRÍTICO — `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` pasan a OBLIGATORIAS en producción

> [!warning] Antes vs. ahora
> - **Antes (SPEC-003)**: si faltaban las llaves, el backend generaba un **par RSA efímero en memoria** y "arrancaba bien" — pero los tokens se invalidaban en cada reinicio/instancia (falsa seguridad).
> - **Ahora (SPEC-009 A6, `jwt-keys.ts:68-69`)**: con `NODE_ENV=production` y sin llaves válidas → **`throw` en bootstrap → el proceso NO arranca** (crash temprano, fail-fast). El par efímero solo existe en `development`/`test`.

| Variable | Antes | Ahora | Formato |
| --- | --- | --- | --- |
| `JWT_PRIVATE_KEY` | Opcional (fallback efímero) | **Obligatoria en prod** | PEM inline con `\n` literales (recomendado Railway) **o** ruta a archivo PEM |
| `JWT_PUBLIC_KEY` | Opcional (fallback efímero) | **Obligatoria en prod** | Ídem — debe ser **idéntica** a la del frontend |

> [!critical] En Railway
> **Verificar ANTES del deploy** que ambos secrets estén definidos en el servicio `backend-portaqr`. Si faltan, el deploy entrará en **crash loop** (el proceso muere al arrancar) — es el comportamiento deseado, pero hay que esperarlo. El mensaje de error incluye `JWT_PRIVATE_KEY/JWT_PUBLIC_KEY` en los logs.
>
> Si ya están cargadas (desde SPEC-003), **no hay que tocar nada** — solo tener presente que ya no hay modo degradado.

---

## 🟢 BACKEND (`backend-portaqr`) — Variables NUEVAS (todas opcionales, con default seguro)

| Variable nueva | Descripción | Default | Dónde se lee |
| --- | --- | --- | --- |
| `REFRESH_TOKEN_TTL_DAYS` | TTL del refresh token (días). Con la **rotación** de SPEC-009 un TTL de 7 días es seguro: el primer reuso de un token ya rotado **delata el robo** y revoca toda la familia (no es necesario acortarlo) | `7` | `auth.service.ts:193` |
| `PET_TAG_MAX_ATTEMPTS` | Máximo de PINs fallidos en activación pet-tag antes del bloqueo temporal | `5` | `mongo-pet-tag.repository.ts:299` |
| `PET_TAG_LOCK_MINUTES` | Duración del bloqueo temporal tras exceder intentos | `30` | `mongo-pet-tag.repository.ts:300` |

> [!note] `VERIFICATION_MAX_ATTEMPTS` NO es variable (corrección a la SPEC §5)
> La SPEC listó `VERIFICATION_MAX_ATTEMPTS` como env opcional, pero se implementó como **constante en código** (`common/utils/code-generator.util.ts:15` → `= 5`, usada por verify-email y reset-password). **No existe `process.env.VERIFICATION_MAX_ATTEMPTS`**: si quieres cambiar el límite de intentos de verificación, es **cambio de código + redeploy**, no una variable.

> [!info] ¿Y `amount` de Webpay / `sessionId`?
> No eran variables de entorno: `amount` salía del body del frontend y ahora se calcula del **snapshot del plan** (B12); `sessionId` sale del **token JWT** (B2). Nada que configurar.

---

## 🔴 BACKEND — Variables ELIMINADAS

**Ninguna.** SPEC-009 no elimina variables de entorno. Solo cambió la **obligatoriedad** de `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (ver arriba).

---

## 🔵 FRONTEND (`qr-app`) — Variables NUEVAS / ELIMINADAS

**Ninguna.** Los ajustes F1-F12 (Bearer en webpay, payloads sin `state`/`sessionId`/`price`, `planId` en qrList) usan las variables existentes (`NEXT_PUBLIC_BFF_URL`, `JWT_PUBLIC_KEY`, etc.).

> [!critical] PERO: desplegar backend y frontend EN EL MISMO deploy (contratos)
> | Si el frontend viejo sigue... | Respuesta del backend nuevo |
> | --- | --- |
> | Enviando `sessionId` en `POST /webpay/create` | **400** (forbidNonWhitelisted) — pago roto |
> | Enviando `state`/`WebpayTransaction` en `POST /qr-activate` | **400** — activación rota |
> | Enviando `price` en lugar de `planId` en `qrList` | **400** — activación/pago roto |
> | Llamando webpay sin `Authorization: Bearer` | **401** — status/transaction/refund rotos |
>
> Un **deploy atómico** (backend + frontend juntos) evita la ventana rota. Ver orden en la SPEC §4 Bloque 11.

---

## 🗄️ Dependencia nueva: colección `refresh_tokens` (MongoDB)

La rotación de refresh (A8) persiste tokens **hash (SHA-256)** en la colección `refresh_tokens` con **índice TTL en `expiresAt`** (los expirados se limpian solos). El índice lo crea Mongoose en el boot — no requiere script manual, pero **verificar tras el deploy**:

```bash
docker exec mongo_qr mongosh --quiet "mongodb://root:example@localhost:27017/sistema?authSource=admin" --eval "db.refresh_tokens.getIndexes().map(i => i.name)"   # local
# En Railway: misma consulta desde el CLI de Mongo, o revisar los logs del boot del backend
# (debe aparecer la creación del índice TTL sin error)
```

> [!warning] Efecto esperado en el primer deploy: **1 re-login por usuario**
> Los refresh tokens emitidos **antes** del deploy no están en la colección (no se pueden "migrar" — solo se guarda el hash del nuevo). El primer refresh post-deploy responde **401** y el usuario debe **iniciar sesión una vez**; desde ahí la rotación funciona normal. No es un bug: es la frontera del cambio.

---

## ⚠️ Otros comportamientos nuevos a tener presentes en producción

| Comportamiento | Detalle |
| --- | --- |
| `POST /webpay/refund` → **solo admin** | Antes era público. Cualquier rol `user` → 403. La UI de refund solo se muestra a admins. |
| `GET /webpay/status` y `GET /webpay/transaction/:token` → **requieren auth + ownership** | Antes públicos (IDOR de montos). Ahora 401 sin token / 403 si la tx no es del actor (admin: 200 siempre). |
| `GET /users/:id` ajeno → **403** (antes: cualquiera autenticado veía perfiles) | El dashboard solo carga el perfil propio — sin impacto funcional. |
| `GET /users/search` → **solo admin** | Endpoint de administración; el frontend no lo usa en flujos de usuario. |
| Login/forgot-password → **mensajes homogéneos** | Login siempre `"Credenciales inválidas"`; forgot-password responde **200 genérico** aunque el email no exista. |
| Códigos de verificación → **10 hex + 5 intentos** | Tras 5 fallos el código se invalida (mensaje "código inválido/expirado"). Pet-tag: bloqueo temporal 30 min tras 5 PINs fallidos. |
| Precio de activación → **snapshot del plan (B12)** | El backend calcula y congela `price` desde el plan; el cliente ya no decide montos. Las **activaciones anteriores conservan su precio** (snapshot histórico — no se recalcula). |
| Logs → **whitelist** | `token_ws`, passwords, códigos y PINs nunca se loguean; los bodies pasan por `sanitizeForLog`. |

---

## 📋 CHECKLIST de despliegue

1. **Verificar secrets del backend (Railway)**: `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY` presentes (formato PEM inline con `\n`). Sin ellas **el servicio no arranca** (fail-fast).
2. **(Opcional) Variables nuevas**: `REFRESH_TOKEN_TTL_DAYS=7`, `PET_TAG_MAX_ATTEMPTS=5`, `PET_TAG_LOCK_MINUTES=30` — solo si se quiere otro valor; los defaults son los seguros.
3. **Merge + deploy ATÓMICO**: backend-portaqr y qr-app **juntos** (contratos F1-F12: payloads viejos → 401/400).
4. **Verificar tras el boot**: índice TTL de `refresh_tokens` creado (colección nueva).
5. **Smoke test**:
   - Login → dashboard → **recargar página** (sesión persistente con refresh rotado — el usuario ya logueado NO debe caer al login en el mismo deploy; solo los que tenían sesión de ANTES necesitan 1 re-login)
   - `POST /webpay/refund` con token de usuario `user` → 403; con `admin` → 200
   - `POST /qr-activate` con `planId` → 201 y `price` calculado del plan en BD; con `price` en el body → 400
   - Login con usuario inexistente vs. contraseña errónea → mismo mensaje y status
   - forgot-password con email inexistente → 200 genérico
   - 6 PINs pet-tag fallidos → bloqueo temporal (mensaje "demasiados intentos")
   - Logs de `/webpay/return` → `token_ws` truncado (≤ 8 chars), nunca completo

---

## ⚠️ Post-despliegue

- **Rotación de llaves JWT**: si rotas el par (SPEC-003), todos los tokens quedan inválidos → re-login global; actualizar también la pública del frontend. Recuerda que en prod ya **no existe** el modo "arrancar sin llaves" — la rotación debe subir el par nuevo ANTES de reiniciar.
- **Cambiar límites después**: `PET_TAG_MAX_ATTEMPTS`/`PET_TAG_LOCK_MINUTES`/`REFRESH_TOKEN_TTL_DAYS` se leen en runtime (basta redeploy sin rebuild); `VERIFICATION_MAX_ATTEMPTS` es constante en código (requiere rebuild).
- **Monitoreo sugerido**: crashes de arranque por llaves faltantes (debe ser 0 — significa que las llaves están bien), 401 en `/auth/refresh` (una oleada única tras el deploy = esperado; repetido = posible robo de tokens), `refresh_tokens` document count (crecimiento ≈ sesiones activas).

---

## Referencias

- [[SPEC-009-hardening-autorizacion-autenticacion-backend-portaqr]] — spec completa (12 bloques, CA-01..14, orden de despliegue F1-F12)
- [[NOTA-despliegue-produccion-SPEC-003]] — variables de auth RS256 y rotación de llaves (base de `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`)
- [[NOTA-despliegue-produccion-SPEC-005]] — variables PDF multilink (patrón de nota de despliegue)
