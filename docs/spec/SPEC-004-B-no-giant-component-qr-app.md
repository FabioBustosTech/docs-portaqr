---
title: "SPEC-004-B: Refactor componentes gigantes (no-giant-component) en qr-app — spec hija de implementación"
date: 2026-08-09
tags:
  - spec
  - mantenimiento
  - frontend
  - calidad
  - refactor
  - no-giant-component
status: borrador
aliases:
  - SPEC-004-B
  - refactor componentes gigantes
parent: SPEC-004
---

# SPEC-004-B: Refactor componentes gigantes (`no-giant-component`) en qr-app

> [!abstract] Decisión clave
> Spec **hija** de [[SPEC-004-react-doctor-qr-app]]. Hereda la **deuda documentada** de SPEC-004 §3.5.1: 8 componentes de `qr-app/` superan el umbral de 300 líneas (`no-giant-component`). Se aplica el **mismo recipe probado en T-004-07**: baseline funcional → refactor (extraer lógica a módulos + estado a reducer/hooks) → validación (tsc/lint/build/doctor + navegador). Se trabaja en la rama actual `feat/spec-004-ca03-refactor-createqrform`.

> [!info] Metadatos
> - **Estado:** Borrador (dinámica — se actualiza por componente)
> - **Fecha:** 2026-08-09
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Rama:** `feat/spec-004-ca03-refactor-createqrform` (la actual — continuación del trabajo)
> - **Alcance:** Solo `qr-app/`. No incluye servicios backend.
> - **Padre:** [[SPEC-004-react-doctor-qr-app]] (§3.5.1 — deuda 8 componentes)
> - **Relacionado:** [[SPEC-002-qr-multilink-imagen]] (ListUrlForm), [[SPEC-003-auditoria-dependencias-qr-app]]

---

## 1. Objetivo

Reducir los 8 componentes gigantes de `qr-app/` (todos >300 líneas) a un tamaño mantenible (<300 líneas), aplicando el recipe validado en T-004-07 (CreateQrForm: 609 → 249 líneas), para elevar el score de react-doctor de 87 → **~93-95/100** y eliminar la única deuda técnica de calidad restante de SPEC-004.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-004-B |
| --- | --- | --- |
| Mantenibilidad | 8 componentes 324–548 líneas | Todos <300 líneas (split + lógica extraída) |
| Score react-doctor | 87/100 (8 `no-giant-component`) | ~93-95/100 (0 `no-giant-component`) |
| Deuda SPEC-004 | Documentada (8 pendientes) | Eliminada |
| Repetibilidad | Recipe manual por componente | Baseline + checklist por componente (§4) |

### 1.2 Out of scope

- Refactor de lógica de negocio (solo extracción/orquestación — mismo criterio que T-004-07).
- Cambios de UI/UX (JSX se conserva idéntico; ver baseline heredado §3).
- Backend (`bff-service`, `user-service`, `qr-service`).
- Otros hallazgos de react-doctor ya resueltos (falsos positivos, decisiones).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1**. Para cada uno de los 8 componentes: capturar baseline funcional (sección §4) **antes** de tocar código.
- **RF-2**. Refactorizar cada componente a <300 líneas: lógica pura → module scope (helpers), estado → useReducer/custom hooks, JSX → subcomponentes cuando aplique.
- **RF-3**. Conservar contrato público (props), comportamiento observable y UI (bordes/mensajes de error, timing de validación) **idénticos**.
- **RF-4**. Validar tras cada refactor: `npx tsc --noEmit`, `npm run lint`, `npm run build`, y verificación del baseline en navegador.
- **RF-5**. Re-ejecutar `npm run doctor` y documentar en §5.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: `npm run doctor` reporta **0 `no-giant-component`** (score ~93-95/100).
- **CA-02**: Todos los componentes refactorizados <300 líneas (evidencia en §4).
- **CA-03**: Baselines B-XX por componente validados post-refactor en navegador.
- **CA-04**: `tsc --noEmit`, `lint`, `build` pasan al final.
- **CA-05**: Props públicas y consumidores intactos (sin cambios fuera de los 8 componentes).

---

## 3. Inventario de componentes (deuda heredada de SPEC-004 §3.5.1)

> [!note] Estado actual (2026-08-09, doctor 87/100 — 11 issues)
> Los 8 restantes de los 9 originales (CreateQrForm ya refactorizado en T-004-07).

| ID | Componente | Líneas | Rol | Prioridad | Estado |
| --- | --- | --- | --- | --- | --- |
| C-01 | `src/components/SignUpForm/index.tsx` | 548 → **276** | Registro de usuarios | 🔴 Alta | ✅ done |
| C-02 | `src/components/qr/forms/ListUrlForm.tsx` | 489 | Núcleo QR multilink (producto principal) | 🔴 Alta | pendiente |
| C-03 | `src/components/qr/QrGrid.tsx` | 461 | Listado principal dashboard | 🔴 Alta | pendiente |
| C-04 | `src/app/dashboard/admin/qr/activate/send/page.tsx` | 441 | Envío masivo admin | 🟠 Media | pendiente |
| C-05 | `src/components/PlanForm.tsx` | 429 | Formulario de planes | 🟠 Media | pendiente |
| C-06 | `src/components/home/HomePageClient.tsx` | 413 | Home del sitio | 🟠 Media | pendiente |
| C-07 | `src/app/dashboard/qr/edit/[id]/page.tsx` | 362 | Edición de QR | 🟡 Baja | pendiente |
| C-08 | `src/app/dashboard/qr/pay/page.tsx` | 324 | Checkout Webpay | 🟡 Baja | pendiente |

> [!warning] Notas por componente
> - **C-02 ListUrlForm**: validación interna propia (`localError`, rows, modal vCard) — ver SPEC-004 §3.4.2 (excepción LIST). Cuidado: es el componente con más lógica local de filas dinámicas.
> - **C-04 activate/send**: page.tsx de App Router — puede requerir split en componentes + extraer lógica de envío a un hook.
> - **C-07 / C-08**: page.tsx de dashboard — mismo patrón URL-fuente-de-verdad ya aplicado en otros (ver SPEC-004 ejecución 2).

---

## 4. Metodología por componente (recipe T-004-07)

> [!important] Baseline heredado
> La metodología de baseline y la plantilla de verificación de UI de inputs (B-09..B-12 + matriz de validación por tipo) viven en **SPEC-004 §3.4 y §3.4.2**. Esta spec la **hereda**: cada componente nuevo captura su propio baseline usando el mismo formato de tabla B-XX, con énfasis en:
> - **Flujos observables** (estados, render condicional, handlers)
> - **UI de inputs**: no mutado / mutado inválido (typing) / inválido tras submit / válido — incluyendo timing del error (solo tras submit, persiste al escribir) y strings de error exactos
> - **Payload/contrato**: props públicas, llamadas a servicios, payload enviado

Pasos por componente (por cada C-XX):

```
1. LEER componente completo + consumidores (grep imports)
2. Capturar baseline: tabla B-XX (flujos + UI inputs + payload) + screenshot/verificación navegador
3. Refactor: extraer lógica pura a module scope / helpers; estado → useReducer o hooks;
   JSX condicional → subcomponentes; mantener JSX visible idéntico
4. Validar: tsc --noEmit + lint + build
5. Verificar baseline post-refactor en navegador (mismos pasos que el pre)
6. npm run doctor (verificar que el componente ya no aparece en no-giant-component)
7. Commit por tarea (mensaje: "refactor: C-XX - <componente> (SPEC-004-B)")
8. Marcar tarea done en Taskmaster + actualizar §4 tabla y §11 changelog
```

> [!warning] Reglas de oro (aprendidas en T-004-07)
> 1. **No cambiar timing de validación**: error UI solo tras submit (nunca onBlur/typing).
> 2. **Strings de error idénticos** (copiar tal cual).
> 3. **Subformularios/hijos no se tocan** salvo que el componente sea el dueño de su propio JSX.
> 4. **RESET via createInitialState()** para limpiar estado (previewId nuevo, sin regeneración por render).
> 5. `useReducer(reducer, undefined, createInitialState)` para lazy init de IDs.

> [!warning] ⚠️ Regla de oro #1 NO aplica a SignUpForm (C-01)
> SignUpForm **SÍ usa validación onBlur + onChange en vivo** con estado `touchedFields` (a diferencia de CreateQrForm). Aquí el error se muestra en el input cuando `touchedFields.x && validationErrors.x`, con borde rojo/verde + icono + texto bajo el campo (ver baseline C-01 B-XX). El refactor debe preservar ESTE timing, no el de CreateQrForm.

### 4.1 Baseline C-01 — `SignUpForm` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/components/SignUpForm/index.tsx` (582 líneas). **Consumidor único:** `src/app/signup/SignUpPageClient.tsx` (props `{ onSubmit, isLoading, error }` → hace fetch a `/api/auth/signup` + `router.push('/verify-email?...')`). **Subcomponentes usados:** `Button`, `Input` (con estados error/isValid/loading), `PasswordStrengthMeter`, `Tooltip`, `authService`. **Verificado en navegador:** `localhost:3000/signup` (sesión visitante).

#### Estados UI de inputs (patrón DIFERENTE a CreateQrForm)

> [!note] Input component (`src/components/Input/index.tsx` — NO se toca)
> `getBorderColor()`: `error` → `border-red-500` · `isValid === true` → `border-green-500` · `isValid === false` → `border-red-500` · neutral → `border-slate-200 dark:border-slate-700`. Iconos: check verde (`showSuccessIcon && isValid`), alerta roja (`error`), spinner gris (`isLoadingIcon`). Texto de error siempre reserva espacio (`min-h-[1.25rem]`, NBSP si vacío). Botón mostrar/ocultar contraseña en `type=password`.

| ID | Estado | Comportamiento visual (PRE-refactor) | Evidencia |
| --- | --- | --- | --- |
| C01-B-01 | **No mutado (untouched)** | 8 inputs vacíos con borde slate neutral, sin mensajes (NBSP reservado), checkbox términos sin marcar, botón "Crear cuenta" **disabled**, PasswordStrengthMeter "Ingrese una contraseña" | screenshot `baseline-c01-1-untouched.png` |
| C01-B-02 | **Mutado inválido (onChange)** | Email `correo-invalido` → **error inmediato en vivo** (sin blur): `invalid="true"` + mensaje rojo "El correo electrónico no es válido." + borde rojo + icono alerta | snapshot (fill email) |
| C01-B-03 | **Mutado válido (onChange)** | Email válido → error limpio (NBSP), borde verde + check verde (`showSuccessIcon && isValid`) | snapshot (fill email válido) |
| C01-B-04 | **Check async en blur** | Email/userName en blur: `isCheckingEmail/isCheckingUsername` → input `disabled` + `isLoadingIcon` spinner + `aria-disabled`; si existe → error "Este correo electrónico ya está registrado." / "Este nombre de usuario ya está en uso." | código `handleBlur` + Input |
| C01-B-05 | **PasswordStrengthMeter** | `Passw0rd!` → "Complejidad de contraseña: FUERTE" (reacciona en vivo al typing) | screenshot `baseline-c01-2-valid.png` |
| C01-B-06 | **Botón habilitado** | Todos los campos touched + válidos + `acceptTerms=true` → botón "Crear cuenta" **enabled** | evaluate (botonDisabled: false) |
| C01-B-07 | **Submit completo** | Valida todos los campos (con checkExists) → `authService.signUp` → `onSubmit(response)` → limpia form → `router.push('/verify-email?userId=...&email=...')` → página "Verifica tu Email" muestra el email | navegación real post-submit |

> [!note] ⚠️ Datos de prueba creados durante el baseline
> Submit real con `baselinec01` / `baseline-c01@test.cl` / `Passw0rd!` → **usuario creado en la DB de desarrollo** (sin verificar email). Borrar si molesta.

#### Estructura interna (para el refactor)

- **Estado (9 useState)**: `formData` (9 campos), `showPassword`, `showConfirmPassword`, `validationErrors`, `touchedFields`, `isCheckingEmail`, `isCheckingUsername`, `error`, `isLoading` + `isClient` (useSyncExternalStore para Tooltip password).
- **Lógica pura extraíble**: `validateField` (switch por campo, ~90 líneas, incluye checks async con authService), `isFormValid`, `isFieldValid` (estado touched/neutral), `dataToSubmit` mapper.
- **JSX**: 3 secciones (Datos Personales / Información de la Cuenta / Términos) con 8 `Input` + tooltips + checkbox + botón. Patrón repetido por campo (error condicional + isValid condicional + aria) → **candidato a un subcomponente `FormField`**.
- **Timing a preservar**: validación onChange (vivo) + onBlur (checkExists) + submit (todo con checkExists). Errores solo visibles si `touchedFields[x]`.

---

## 5. Ejecuciones de react-doctor (dinámica)

### 5.1 Ejecución B-0 (2026-08-09, previa)

**Resultado: Score 87/100 — 11 issues** (8 `no-giant-component` + 2 falso positivo + 1 decisión). Línea base de esta spec. Ver SPEC-004 §3.5.

### 5.2 Ejecución B-1 (2026-08-09, tras C-01)

**Resultado: Score 87/100 — 10 issues** (7 `no-giant-component` + 2 falso positivo + 1 decisión). C-01 SignUpForm resuelto: **582 → 276 líneas** (`index.tsx`) + `SignUpFormField.tsx` (77) + `SignUpFormContext.ts` + `state.ts` + `helpers.ts`.

> [!success] C-01 implementado (commit `31b8022` en qr-app)
> - `state.ts`: reducer (`SET_FIELD`/`SET_TOUCHED`/`SET_VALIDATION_ERROR`/`SET_CHECKING`/`SET_ERROR`/`SET_LOADING`/`RESET`) reemplaza 9 useState
> - `helpers.ts`: `validateFieldValue` (mensajes exactos baseline), `isFieldValid`, `isFormValid`, `buildSubmitData`, `EXISTENCE_ERRORS`
> - `SignUpFormField.tsx`: subcomponente `FormField` con patrón Input+error/isValid/aria (baseline C-01)
> - `SignUpFormContext.ts`: contexto separado (cumple `only-export-components`)
> - `index.tsx`: orquestador con `useReducer` + `useCallback`/`useMemo` (cumple `context-provider-value-from-unmemoized-local-literal`)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C01-B-01..B-07: no mutado, error en vivo onChange, blur con checkExists, botón habilitado, submit → /verify-email)
> - **Sin regresiones de doctor**: las 2 nuevas reglas que aparecieron al refactorizar (`only-export-components`, `context-provider-value-from-unmemoized-local-literal`) se resolvieron en el mismo commit
> - ⚠️ Datos de prueba creados en DB dev durante baseline: `baselinec01`, `baselinec01b` (borrar si molesta)

_(Se agregará Ejecución B-1 al final, con score objetivo ~93-95/100.)_

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registradas en `docs/tarea/SPEC-004-B-tareas.json` (formato Taskmaster-compatible).

| ID | Tarea | Estado |
| --- | --- | --- |
| T-004B-01 | **C-01 SignUpForm** (548→276): baseline + refactor + validación | ✅ done (commit `31b8022`) |
| T-004B-02 | **C-02 ListUrlForm** (489): baseline + refactor + validación | pendiente |
| T-004B-03 | **C-03 QrGrid** (461): baseline + refactor + validación | pendiente |
| T-004B-04 | **C-04 activate/send** (441): baseline + refactor + validación | pendiente |
| T-004B-05 | **C-05 PlanForm** (429): baseline + refactor + validación | pendiente |
| T-004B-06 | **C-06 HomePageClient** (413): baseline + refactor + validación | pendiente |
| T-004B-07 | **C-07 qr/edit/[id]** (362): baseline + refactor + validación | pendiente |
| T-004B-08 | **C-08 qr/pay** (324): baseline + refactor + validación | pendiente |
| T-004B-09 | Validación final: doctor (0 no-giant-component) + cierre de spec | pendiente |

> [!note] Orden de ejecución sugerido
> Por prioridad: C-01 → C-02 → C-03 → C-04 → C-05 → C-06 → C-07 → C-08. Los de prioridad 🔴 Alta primero (mayor impacto en mantenibilidad). Alternativa: de menor a mayor líneas (quick wins primero: C-08 → C-07 → C-06...) si se quiere feedback rápido.

---

## 7. Testing

- `npx tsc --noEmit` — sin errores de tipos (tras cada refactor).
- `npm run lint` — sin errores.
- `npm run build` — build de producción exitoso.
- `npm run doctor` — 0 `no-giant-component` al final.
- Baseline B-XX en navegador (pre y post por componente).

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Refactor rompe funcionalidad (especialmente C-02 ListUrlForm) | Media | Alto | Baseline B-XX pre/post por componente; validación navegador; cambios incrementales |
| Componente no baja de 300 líneas en un paso | Media | Medio | Split en 2 pasos (lógica → estado → JSX); documentar parcial |
| JSX cambia visualmente sin querer | Media | Medio | Verificación visual por snapshot pre/post + checklist UI inputs |
| Regresión en timing de validación | Baja | Alto | Regla de oro #1-2 (§4) — helpers replican strings y timing exactos |

---

## 9. Observabilidad

- Cada componente completado se registra en §4 (baseline + estado) y §11 (changelog).
- Cada ejecución de `npm run doctor` se registra en §5 con fecha.
- Estado de la spec se actualiza a `implementado` al cumplir todos los CA (§2.2).

---

## 10. Referencias

- [[SPEC-004-react-doctor-qr-app]] — padre (metodología baseline §3.4, matriz UI §3.4.2, deuda §3.5.1).
- [[SPEC-002-qr-multilink-imagen]] — ListUrlForm (imagen portada).
- react-doctor: https://github.com/millionco/react-doctor

---

## 11. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-09 | Equipo | Borrador inicial: inventario de 8 componentes (deuda SPEC-004 §3.5.1), metodología recipe T-004-07, RF/CA, tareas T-004B-01..09, Ejecución B-0 (87/100). Rama `feat/spec-004-ca03-refactor-createqrform` |
| 2026-08-09 | Equipo | **C-01 SignUpForm completado**: baseline §4.1 (C01-B-01..B-07 con UI de inputs y timing onBlur/onChange), refactor 582→276 líneas (state.ts + helpers.ts + FormField + contexto separado). Ejecución B-1: 87/100, 10 issues (7 giants). Commit `31b8022` qr-app. Validado tsc/lint/build/navegador + 2 reglas doctor nuevas resueltas sin regresión |
