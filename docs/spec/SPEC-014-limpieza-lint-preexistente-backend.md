---
title: "SPEC-014: Limpieza de deuda de lint preexistente (backend-portaqr)"
date: 2026-08-11
tags:
  - spec
  - backend
  - deuda-tecnica
  - eslint
  - calidad
  - backlog
status: borrador
aliases:
  - SPEC-014
  - Limpieza lint preexistente
---

# SPEC-014: Limpieza de deuda de lint preexistente (`backend-portaqr`)

> [!abstract] Decisión clave
> Reducir a **cero** los errores de ESLint en `src/**/*.ts` (hoy: **17 errores en 12 archivos**, todos preexistentes a SPEC-008) sin cambiar comportamiento de runtime. Esto deja la línea base limpia para que las próximas SPEC (incluida la SPEC-013) no mezclen errores nuevos con deuda vieja, y habilita `eslint` como check de CI.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-11
> - **Autor:** Equipo Plataforma QR
> - **Componente destino:** `desarrollo-qr/backend-portaqr/`
> - **Relacionado:** [[SPEC-008]] (detectó que estos errores eran preexistentes en `main`), [[SPEC-013]] (se beneficia de la línea base limpia)

---

## 1. Objetivo

`npx eslint "src/**/*.ts"` debe terminar **sin errores** (0 problemas), manteniendo `tsc --noEmit` en 0 errores y la suite de tests (146 suites / 1139 tests) verde. Solo se tocan imports, parámetros y `require` tipados — **cero cambios de comportamiento**.

## 2. Contexto

### 2.1 Línea base (verificada 2026-08-11 en `main`, antes de SPEC-008)

Config actual (`.eslintrc.js`): `@typescript-eslint/recommended` + `prettier/recommended`, sin reglas de unused-vars configuradas (usa el default `no-unused-vars` de recommended con `args: after-used`).

### 2.2 Inventario de errores (17 en 12 archivos)

| # | Archivo | Línea | Regla | Fix propuesto |
|---|---|---|---|---|
| 1 | `common/decorators/tracking.decorator.spec.ts` | 10 | `no-unused-vars` (`_tracking`) | Configurar `argsIgnorePattern: '^_'` (el parámetro ES necesario para el decorator) |
| 2 | `common/decorators/user.decorator.spec.ts` | 8 | `no-unused-vars` (`_user`) | Ídem (mismo patrón de test) |
| 3 | `common/types/mongo-doc.ts` | 2 | `no-unused-vars` (`T` generic) | Evaluar: quitar el generic y ajustar callers, o `disable` con justificación (T documenta el tipo del doc) |
| 4 | `interceptors/response-logger.interceptor.ts` | 3 | `no-unused-vars` (`tap` import) | Borrar el import (no se usa) |
| 5 | `interceptors/response-logger.interceptor.ts` | 21 | `prefer-rest-params` (`arguments`) | `res.send = (...args: any[]) => { responseBody = args[0]; return originalSend.apply(this, args); }` |
| 6 | `modules/auth/domain/services/auth.service.ts` | 7 | `no-unused-vars` (`RefreshTokenDto` import) | Borrar el import |
| 7 | `modules/auth/infrastructure/guards/jwt-auth.guard.ts` | 33 | `no-unused-vars` (`info` param) | Renombrar `_info` (con `argsIgnorePattern`) o quitar el parámetro (passport tolera menos args) |
| 8 | `modules/plan/infrastructure/adapters/PlanRepositoryAdapter.ts` | 1 | `no-unused-vars` (`NotFoundException` import) | Borrar el import |
| 9 | `modules/storage/image-processor.service.ts` | 4 | `no-var-requires` (`require('sharp')`) | **Corregir el disable existente**: el comentario usa `no-require-imports` pero la regla activa es `no-var-requires` (o desactivar la regla en eslintrc; sharp es CJS sin esModuleInterop) |
| 10 | `modules/storage/image-processor.service.spec.ts` | 4 | `no-var-requires` | Ídem |
| 11 | `modules/storage/storage.service.spec.ts` | 1 | `no-unused-vars` (`PutObjectCommand`, `DeleteObjectCommand` imports) | Borrar los imports no usados |
| 12 | `modules/webpay/application/use-cases/commit-transaction.usecase.spec.ts` | 17 | `no-unused-vars` (`reader` asignado) | Quitar la asignación si el test no lo usa |
| 13-16 | `shared/utils/logger.util.ts` | 15, 30, 37, 44 | `no-unused-vars` (`trace` param en `log`/`warn`/`debug`/`verbose`) | Quitar el parámetro `trace?: string` de esos 4 métodos (solo `error()` lo usa; es el último param opcional — no rompe callers) |
| 17 | `modules/storage/storage.service.spec.ts` | 1 | `no-unused-vars` (2º) | Ídem #11 |

### 2.3 Por qué no se tocó en SPEC-008

La SPEC-008 (seguridad) verificó que estos errores eran preexistentes en `main` (git diff de la rama no los incluye) y los dejó fuera de alcance, documentándolos en su §10 como backlog.

## 3. Solución propuesta

### 3.1 Config (fix de mayor impacto, 1 línea)

```js
// .eslintrc.js → rules
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
```

Resuelve los casos 1, 2 y 7 (parámetros intencionalmente no usados pero necesarios por firma — patrón legítimo en decorators y callbacks de passport).

### 3.2 Fixes por archivo

| Grupo | Fix |
|---|---|
| Imports sobrantes (4, 6, 8, 11) | Borrar el import |
| `arguments` → rest (5) | Reescribir con rest params (ver §2.2) |
| `require` tipado (9, 10) | Corregir el eslint-disable a `no-var-requires` (la regla real) o `off` en eslintrc |
| Generic sin uso (3) | Evaluar impacto de quitar `MongoDoc<T>` → `MongoDoc` (grep de callers); si >5 callers, `disable` con justificación |
| Params sin uso (13-16) | Quitar `trace?` de log/warn/debug/verbose (verificar que ningún caller pase 5º arg) |
| Variable asignada sin uso (12) | Quitar o usar en el test |

### 3.3 Verificación

1. `npx eslint "src/**/*.ts"` → 0 errores
2. `npx tsc --noEmit` → 0 errores
3. `npx jest` → 146 suites / 1139 tests verdes (sin cambios de comportamiento)
4. `git diff` revisado: solo imports/params/require — sin lógica tocada

## 4. Criterios de aceptación

- [ ] **CA-01**: `npx eslint "src/**/*.ts"` → **0 errores** (exit code 0)
- [ ] **CA-02**: `npx tsc --noEmit` → 0 errores
- [ ] **CA-03**: suite completa verde (146 suites / 1139 tests) sin ajustes de tests por comportamiento
- [ ] **CA-04**: el diff NO toca lógica de negocio (solo imports, parámetros, `require` tipado y config de eslint)
- [ ] **CA-05**: los tests que usan decorators (`tracking`/`user`) siguen pasando (el prefijo `_` no altera la firma)

## 5. No funcionales

- **Rendimiento**: sin impacto (no se toca runtime salvo rest params en `response-logger`, equivalente).
- **Compatibilidad**: las firmas de `CustomLogger` se reducen en el último parámetro opcional (`trace`) — ningún caller del repo lo usa en `log/warn/debug/verbose` (verificado por grep).
- **Mantenibilidad**: con línea base en cero, los pipelines de CI pueden ejecutar `eslint` como gate; SPEC-013 arranca sin ruido.

## 6. Trade-offs

| Decisión | Alternativa | Motivo |
|---|---|---|
| `argsIgnorePattern: '^_'` en la regla | Borrar parámetros de firmas | Decorators (Tracking/User) y `handleRequest` de passport requieren la firma completa; el prefijo `_` es convención estándar TS |
| Quitar `trace?` de 4 métodos de CustomLogger | Pasar el arg a `super.log/warn/...` | El arg no se usaba (se formatea manualmente); pasarlo a super cambiaría el formato del log (comportamiento) |
| `disable` puntual en `mongo-doc.ts` (si aplica) | Refactor de callers | Si el generic tiene muchos callers, el disable con justificación es más barato que el refactor (deuda futura documentada) |

## 7. Plan de implementación (estimación: ~30-45 min)

1. Config `argsIgnorePattern` + fix de imports sobrantes — 10 min
2. `response-logger` rest params + `logger.util` firmas — 15 min
3. `require` sharp (disable correcto) + `mongo-doc` + `commit-transaction.spec` — 10 min
4. Validación: eslint + tsc + jest + diff — 10 min

## 8. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-11 | Equipo | Borrador inicial — documenta la deuda de lint preexistente detectada en la auditoría de SPEC-008: inventario completo (17 errores / 12 archivos / reglas / fixes propuestos), config `argsIgnorePattern`, CAs y plan de ~30-45 min |
