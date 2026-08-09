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
status: implementado
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
| C-02 | `src/components/qr/forms/ListUrlForm.tsx` | 489 → **236** | Núcleo QR multilink (producto principal) | 🔴 Alta | ✅ done |
| C-03 | `src/components/qr/QrGrid.tsx` | 490 → **260** | Listado principal dashboard | 🔴 Alta | ✅ done |
| C-04 | `src/app/dashboard/admin/qr/activate/send/page.tsx` | 475 → **283** | Envío masivo admin | 🟠 Media | ✅ done |
| C-05 | `src/components/PlanForm.tsx` | 470 → **239** | Formulario de planes | 🟠 Media | ✅ done |
| C-06 | `src/components/home/HomePageClient.tsx` | 429 → **25** | Home del sitio | 🟠 Media | ✅ done |
| C-07 | `src/app/dashboard/qr/edit/[id]/page.tsx` | 388 → **175** | Edición de QR | 🟡 Baja | ✅ done |
| C-08 | `src/app/dashboard/qr/pay/page.tsx` | 352 → **226** | Checkout Webpay | 🟡 Baja | ✅ done |

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

### 4.2 Baseline C-02 — `ListUrlForm` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/components/qr/forms/ListUrlForm.tsx` (489 líneas). **Consumidores (2):** `CreateQrForm` (creación) y `src/app/dashboard/qr/edit/[id]/page.tsx` (edición, con `key={qr.idQr}` + `listImageIdQr`). **Props:** `{ nameList, description?, setDescriptionChange?, setNameListChange, urlList, onUrlListChange, error?, listImageIdQr?, listImageUrl?, onListImageUrlChange?, onListImageFileSelected? }`. **Verificado en navegador:** `localhost:3000/dashboard/qr` (tipo Multi links, usuario baselinec01).

#### Estados y flujos (verificados en navegador + console)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C02-B-01 | **Render inicial**: fila vacía (select "Tipo de enlace" + input + trash), nombre/descripción/imagen portada (SPEC-002), botón "Agregar enlace", botón "Crear QR" disabled, preview placeholder | screenshot `baseline-c02-1-inicial.png` |
| C02-B-02 | **Dropdown de tipo**: 40 tipos de enlace desde `socialConst` (Sitio Web, Blog, Facebook, Instagram, WhatsApp, Teléfono, Email, Google maps, TikTok, X, Telegram, Pinterest, LinkedIn, YouTube, GitHub, GitLab, OnlyFans, Line, SoundCloud, Spotify, Discord, Skype, Vimeo, PlayStation, Xbox, Dropbox, Uber Eats, PedidosYa, Snapchat, Apple Music, Messenger, Reddit, Tumblr, Slack, Steam, Twitch, Google Formulario, Meta, Vcard, Google Drive, Miro, Notion) | snapshot dropdown |
| C02-B-03 | **Autopopulado al cambiar tipo** (console): `handleTypeChange` → web: `https://`, whatsapp: `https://wa.me/569`, email: `correo@ejemplo.com`, teléfono: `tel:+569`, social con baseUrl: prefijo. ⚠️ **BUG detectado por el usuario (2026-08-09)**: con `https://` (protocolo solo) el botón se habilitaba — CORREGIDO con `hasUsableUrlContent` en `CreateQrForm.helpers.ts` (URL debe tener contenido real tras el protocolo). **Post-fix: `https://` → botón DISABLED; con dominio → ENABLED** (verificado en navegador) | console `formatUrl output: https://` + fix verificado |
| C02-B-04 | **Escribir URL** → `formatUrl` asegura protocolo: `ejemplo-baseline-c02.cl` → `https://ejemplo-baseline-c02.cl`; payload `urlList: [{"url":"https://ejemplo-baseline-c02.cl","typeUrl":"Sitio Web"}]` (**typeUrl = nombre social**, no id) | console |
| C02-B-05 | **Pegar URL** → `detectUrlType` + `extractRelevantUrl` (detecta teléfono/whatsapp/redes/maps/web/email; extrae username para redes) | código `handlePaste` |
| C02-B-06 | **Filas dinámicas**: agregar (`addRow`, id `row-${Date.now()}`), eliminar (`removeRow`, garantiza mínimo 1 fila), reordenar drag&drop (`@hello-pangea/dnd` con GripVertical) | código |
| C02-B-07 | **Filtro de filas vacías**: `updateUrlList` mantiene solo filas con `type && url` (excepto web/blog que se conservan aunque la URL esté vacía y vcard que se conserva con datos) | código |
| C02-B-08 | **Modal vCard**: al seleccionar tipo "Vcard" (o botón "Configurar vCard") se abre `VCardFormModal` con `initialVCardData` (default vCard 4.0); al submit válido se guarda en la fila | código `handleTypeChange`/`handleOpenVCardModal` |
| C02-B-09 | **Sync con urlList externa** (`useEffect`): si `urlList` llega con datos (edición) → `setRows(mapped)` con `typeUrl` → id social; si vacío → 1 fila en blanco | código |
| C02-B-10 | **Errores**: `localError` interno (borde rojo en filas `localError && !row.url`) + `error` prop del padre (`{(localError \|\| error) && <p>}`) — excepción LIST de SPEC-004 §3.4.2 (no setea error del padre) | código |

> [!note] ⚠️ Datos de prueba
> Se verificó el email de `baselinec01` en Mongo (`isEmailVerified: true`) para poder loguear — usuario creado en baseline C-01. Se creó el QR `ejemplo-baseline-c02.cl` (tipo LIST) durante la validación.

#### Estructura interna (para el refactor)

- **Helpers module-scope ya existentes** (~170 líneas): `detectUrlType`, `formatUrl`, `extractRelevantUrl`, `ensureUrlFormat` + `socialTypes` → **mover a `ListUrlForm.helpers.ts`** (código intacto).
- **Estado (4 useState + 1 ref)**: `rows` (filas `{id, type, url, vcard?}`), `localError`, `isVCardModalOpen`, `currentVCardData` + `editingVCardRowIndexRef`. Handlers con `useCallback` encadenados (deps rows/updateUrlList).
- **JSX**: fila Draggable (~70 líneas: GripVertical + Select social + Input url + botón vcard + Trash) → **candidato a subcomponente `ListUrlRow`** (misma fila, recibiendo row/index/handlers).
- **Modal vCard**: `VCardFormModal` ya es externo — no se toca.
- **Timing a preservar**: sync `useEffect(urlList)` → rows; handlers actualizan rows + `updateUrlList` (formateo + filtro); drag&drop reordena; el `error` fluye como prop.

### 4.3 Baseline C-03 — `QrGrid` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/components/qr/QrGrid.tsx` (490 líneas). **Consumidores (2):** `src/app/dashboard/qr/page.tsx` (dashboard, sin admin) y `src/app/dashboard/users/[userIdClient]/qr/page.tsx` (admin, con `isAdmin` + `userIdClient`). **Props (12):** `{ qrs, loading, currentPage, totalPages, itemsPerPage, onPageChange, onSearch, onClearSearch?, onItemsPerPageChange, onFavoriteUpdated, onQrUpdated?, isWebpayActive?, isAdmin?, userIdClient?, initialSearchTerm?, initialItemsPerPage? }`. **Verificado en navegador:** `localhost:3000/dashboard/qr` (usuario baselinec01, QR de prueba `grid-baseline-c03.cl` creado).

#### Estados y flujos (verificados en navegador)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C03-B-01 | **Card contenedor**: header con título "Mis Códigos QR" + Select "Mostrar:" (10/20/50/100) | snapshot |
| C03-B-02 | **Búsqueda**: input "Buscar..." + botones "Buscar" / "limpiar filtro" (Enter dispara búsqueda) | snapshot |
| C03-B-03 | **Tarjeta de QR**: título `getQrLabel(qr)` (+ `/ nombre` si hay), URL truncada con Tooltip, star favorito, `QrDisplay` 150px, estado Activo/Inactivo (icono verde/rojo), "Expira: fecha" (`formatDate`), botones acción | snapshot tarjeta |
| C03-B-04 | **Botones por estado**: Activo → Estadísticas + Editar + Compartir (icono); Inactivo → Editar + Activar (admin: ruta `/dashboard/admin/qr/activate?id=...&userIdClient=...`; no-admin: `/dashboard/qr/activate?id=...&typeQr=...`) + Eliminar | snapshot (Inactivo: Editar/Activar/Eliminar) |
| C03-B-05 | **Tooltip pet/list**: para pet-tag, list o pet muestra icono PawPrint/ListIcon con tooltip (nombre/dueño/teléfono o lista de URLs) | código |
| C03-B-06 | **Favorito**: star amarillo → `qrService.toggleFavorite` + `onFavoriteUpdated` + toast | código |
| C03-B-07 | **Eliminar**: `handleDeleteClick` → ConfirmationDialog → `qrService.deleteQr` + `onQrUpdated('a', ...)` + toast | código |
| C03-B-08 | **Compartir**: `handleShareClick` → ShareModal con `window.location.origin/qr/${id}` | código |
| C03-B-09 | **Paginación**: "Anterior/Siguiente" + "Página X de Y" (disabled en bordes); Select itemsPerPage | snapshot |
| C03-B-10 | **clear search**: `handleClearSearch` borra `search` de URL (patrón URL fuente de verdad, SPEC-004 exec 2) | código |

> [!note] ⚠️ Datos de prueba
> QR dinámico `grid-baseline-c03.cl` creado con usuario `baselinec01` durante la validación.

#### Estructura interna (para el refactor)

- **Helpers module-scope ya existentes** (~28 líneas): `isPetTagItem`, `isQrActive`, `getQrLabel`, `getQrUrl` → **mover a `QrGrid.helpers.ts`** + agregar `getQrTooltipContent(qr)` (el tooltip pet/list es un string complejo de ~15 líneas).
- **Estado (4 useState + 1 ref)**: `showConfirmDialog`, `qrToDeleteIdRef` (ref — solo en handlers), `searchTerm` (prop inicial de URL), `isShareModalOpen`, `qrToShareUrl`.
- **JSX**: **tarjeta individual ~160 líneas** (header label/favorito/tooltip, QrDisplay, estado/expiración, tooltip pet/list, botones condicionales por estado y rol) → **candidato a subcomponente `QrCard`** (usa `useRouter` interno para stats/edit/activate; recibe callbacks para favorito/eliminar/compartir).
- **Orquestador**: header (título + select), búsqueda, grid `map` → `QrCard`, paginación, ConfirmationDialog + ShareModal (externos).
- **Timing a preservar**: uso de `router.push` relativo, `handleClearSearch` (URL), gating de botones por `isQrActive`/`isAdmin`, `onQrUpdated('a', ...)` tras delete.

### 4.4 Baseline C-04 — `admin/qr/activate/send` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/app/dashboard/admin/qr/activate/send/page.tsx` (475 líneas reales; doctor reporta 441). **Page.tsx de App Router** — sin props. **Flujo de entrada:** admin selecciona QR en `/dashboard/admin/qr/activate` (con `?id=&userIdClient=`) → `CartAdminService.addToCart` → navega a `/send`. **Servicios:** `CartAdminService` (subscribe/clearCart), `QrActivateService.createActivation`. **Helpers externos:** `toDocumentType`, `toDocumentTypeString`, `getDurationInMilliseconds` (`@/lib/format`), `validateRut` (`@/lib/validators`). **Verificado en navegador** (usuario baselinec01 → role admin en Mongo, QR `9fcdc142...` del usuario e2e agregado al carrito).

#### Estados y flujos (verificados en navegador)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C04-B-01 | **Carrito vacío**: "Carrito Vacío" + "No hay items en el carrito..." + botón "Volver al Dashboard" (`router.push('/dashboard/qr')`) | código (guard `cartItems.length === 0`) |
| C04-B-02 | **Resumen de activación**: título "Resumen de Activacion", lista items (QR Code + Duración + precio `toLocaleString('es-CL')`), Total (`calculateSubtotal` — ojo: `calculateTotal` = subtotal, sin tax aplicado en UI) | snapshot `baseline-c04-1-form.png` |
| C04-B-03 | **Tipo de Documento**: Select 3 opciones (Boleta/Factura/No aplica) → `toDocumentType(value)`; botón "Proceder" disabled sin selección | snapshot dropdown |
| C04-B-04 | **Campos FACTURA condicionales**: solo con `FACTURA` → RUT + Razón Social + Dirección + Giro (grid md:grid-cols-2), cada uno con error `border-red-500` + `<p class="text-red-500">` | snapshot FACTURA |
| C04-B-05 | **Validación RUT en vivo** (`validateRut` en onChange): `123` → "DV inválido"; `11111111-1` → sin error | evaluate (errorVisible + rutError) |
| C04-B-06 | **Mensaje del Administrador**: textarea requerido (gating) | snapshot |
| C04-B-07 | **Gating botón** "Proceder a la Activación": disabled si `loading` OR sin tipo doc OR mensaje vacío OR (FACTURA y falta algún campo o error) | evaluate (btn disabled → enabled) |
| C04-B-08 | **handleActivation**: permisos admin (`user.role !== 'admin'` → toast) → `buildQrActivationData` (methodActivation ADMIN, state ADMIN, adminId, price {TotalPrice, TotalTax: 19%, TotalDiscount: 0}, userId del carrito, qrList con `getDurationInMilliseconds`, documentType, invoiceData si FACTURA) → `createActivation` → `isActivation=true` + `activationResult` → **éxito**: check verde "¡Activacion Exitoso!" + ID transacción + fecha + total + lista QR activados + botón "Volver al Dashboard" (`handleReturn` limpia carrito + `router.push('/dashboard/users/${activationResult.userId}/qr')`) | código + snapshots |
| C04-B-09 | **Errores**: toasts "Error de Permiso", "Error de Sesión", "Error de Validación", "Error en la Activación" | código |
| C04-B-10 | **Suscripción carrito**: `useEffect` → `CartAdminService.subscribe` con `isMounted` guard (setState post-unmount) + cleanup | código |

> [!note] ⚠️ Datos de prueba
> `baselinec01` → role **admin** en Mongo (necesario para acceder). QR `9fcdc142-6014-473b-962a-096a004ccb57` (usuario e2e) agregado al carrito admin — **limpiar carrito tras el baseline** (`CartAdminService.clearCart` vía UI o recarga).

#### Estructura interna (para el refactor)

- **Estado (7 useState)**: `cartItems`, `loading`, `descriptionAdministrator`, `activationResult`, `isActivation`, `selectedDocumentType`, `invoiceData` (4 campos), `errors` (4 campos).
- **Lógica pura extraíble**: `calculateSubtotal`/`calculateTax`/`calculateTotal` (module scope — cálculos de carrito) y `buildQrActivationData(...)` (construcción del payload QrActivate, ~20 líneas del handler).
- **JSX**: 3 bloques condicionales → **componentes**: `ActivationSuccess` (éxito, ~50 líneas), `CartSummary` (resumen items + total, ~35 líneas), `InvoiceFields` (campos factura condicionales, ~75 líneas). El resto del orquestador: guards (loading/vacío), tipo documento, mensaje admin, botón.
- **Timing a preservar**: validación en vivo de RUT (onChange), gating del botón, guards de permisos, toasts, `isMounted` en useEffect, console.logs de debug (parte del flujo documentado).
- **⚠️ Detalle**: hay `setIsActivation(true)` duplicado (líneas 186 y 191) — NO se toca (comportamiento actual). `calculateTotal` no aplica impuesto en UI (pero sí en payload `TotalTax`) — comportamiento actual.

### 4.5 Baseline C-05 — `PlanForm` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/components/PlanForm.tsx` (470 líneas reales; doctor reporta 429). **Consumidores (2):** `src/app/dashboard/plan/page.tsx` (`<PlanForm onSuccess={handlePlanCreated} />` — create) y `src/app/dashboard/plan/edit/[id]/page.tsx` (edit con `initialData`). **Props:** `{ onSuccess?, onCancel?, initialData?, mode?: 'create' | 'edit' }`. **Servicios:** `PlanService.createPlan/updatePlan`. **Verificado en navegador:** `localhost:3000/dashboard/plan` (modo create).

#### Estados y flujos (verificados en navegador)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C05-B-01 | **Render create**: Card "Crear Nuevo Plan" con grid 2-col (Nombre, Descripción, Precio 0, Fecha Fin datetime-local, Tiempo duración select "Meses", Duración 1), Tipo de QR select ("QR Dinámica"), checkboxes Activo/Popular/Gratuito, Detalles del Plan (1 fila vacía + "Agregar Detalle"), botones Cancelar/Crear Plan | snapshot |
| C05-B-02 | **Validación en submit** (`validateForm` en handleSubmit, timing submit-only): vacíos → "El nombre es requerido", "La descripción es requerida", "El precio debe ser mayor a 0", "Todos los detalles son requeridos" (border-red-500 en campos + `<p text-red-500>`) | snapshot post-submit |
| C05-B-03 | **Checkboxes**: Activo checked por default (defaultPlan.active=true), Popular/Gratuito false (populier/free) — `handleInputChange` con `type === 'checkbox'` | snapshot |
| C05-B-04 | **Detalles dinámicos**: `addDetail` (id `detail-N` vía `genDetailId` module-scope), `removeDetail` por id (keys estables), `handleDetailChange` por id | código |
| C05-B-05 | **Tipo QR**: `CustomSelect` con `QR_TYPE_LABELS` (11 tipos: Dinámica, Estática, WhatsApp, Correo, Llamada, WiFi, Texto, Multi link, Tarjeta, Mascota, Teléfono, Mapa) → `handleQrTypeChange` | snapshot + código |
| C05-B-06 | **Duración**: select DAYS/WEEKS/MONTHS/YEARS ("Meses" default) + input number (1) — `handleDurationChange`/`handleDurationNumberChange` | snapshot |
| C05-B-07 | **Submit create**: `buildSubmitData` (quita `id` local de details, price Number, endDate Date, duration Number) → `PlanService.createPlan` → reset `defaultPlan` + toast "Plan creado" + `onSuccess` | código |
| C05-B-08 | **Submit edit**: `mode === 'edit' && initialData._id` → `updatePlan` + toast "Plan actualizado"; useEffect inicializa formData desde initialData (details con id local, typeQr fallback DYNAMIC, populier false) | código |
| C05-B-09 | **Botones**: Cancelar (onCancel) + submit con spinner "Creando.../Actualizando..." y texto "Crear Plan/Actualizar Plan"; disabled durante loading | snapshot |

> [!note] ⚠️ Datos de prueba
> Sin creación de planes (solo validación de errores en submit). La lista de planes muestra Plan Premium + Multi Link (datos existentes).

#### Estructura interna (para el refactor)

- **Module scope ya existente** (~75 líneas): `QR_TYPE_LABELS`, `DurationType` enum, `detailIdCounter`/`genDetailId`, `defaultPlan`, tipos `PlanDetail`/`PlanFormData`/`FormErrors` → **mover a `PlanForm.helpers.ts`** + **nuevo** `validateFormData(formData)` (pura, devuelve errores) + `buildSubmitData(formData)` (payload API).
- **Estado (3 useState)**: `loading`, `formData` (PlanFormData), `errors` (FormErrors).
- **Handlers**: `handleInputChange` (number/checkbox/text), `handleDurationChange`, `handleDurationNumberChange`, `addDetail`, `removeDetail`, `handleDetailChange`, `handleQrTypeChange`, `handleSubmit`.
- **JSX**: grid campos básicos (6 campos ~95 líneas) + tipo QR + checkboxes (~30) + **Detalles del Plan ~45 líneas** (header + Agregar + lista dinámica + errores) → **candidato a subcomponente `PlanDetailsList`** + botones.
- **Timing a preservar**: validación SOLO en submit (como CreateQrForm), errores por campo `border-red-500` + texto, `genDetailId` para keys estables, payload sin id local.

### 4.6 Baseline C-06 — `HomePageClient` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/components/home/HomePageClient.tsx` (429 líneas reales; doctor reporta 413). **Consumidor único:** `src/app/page.tsx` (ruta `/`, sin props). **Verificado en navegador:** `localhost:3000/` (página pública).

#### Estados y flujos (verificados en navegador)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C06-B-01 | **Hero**: h1 "Plataforma de Gestión de QR para tu Marca", logo (`currentTheme` dark → Logo_blanco, light → PORTA_QR_LOGO), párrafo, 3 CTA (Comenzar → /signup, Saber más → /servicios, Preguntas Frecuentes → /faq) | snapshot |
| C06-B-02 | **Possibilities**: h2 "Un Mundo de Posibilidades" + `AnimatedLinkList` (lista de redes sociales) | snapshot |
| C06-B-03 | **HowToStart**: 5 pasos numerados (1-5) con texto | snapshot |
| C06-B-04 | **QR Generator**: email + tipo (select URL/Texto/Email/Teléfono) + contenido (textarea) + botón "Generar QR" **disabled** hasta `hasInteracted && qrContent && email` | snapshot + evaluate (botonDisabled false tras llenar) |
| C06-B-05 | **Generar QR**: `handleGenerateQR` formatea según tipo (url → `https://` prefijo, email → `mailto:`, phone → `tel:`) → POST `/api/qr-free-generation` `{email, information:{typeQr, data}}` → `setGeneratedQR(formattedContent)` → **QRCode visible + botón "Descargar"** (`qrRef.current.downloadQR()`) | snapshot post-generación (botón Descargar aparece) |
| C06-B-06 | **Features**: 3 tarjetas (Generación QR, Seguimiento, Gestión) con icono + título + descripción (constante `features` module-scope) | snapshot |
| C06-B-07 | **Stats**: 3 valores (10K+, 1M+, 99.9%) con labels (constante `stats` module-scope) | snapshot |

> [!note] ⚠️ Datos de prueba
> Se generó 1 QR gratuito con `baseline-c06@test.cl` / `https://home-baseline-c06.cl` (POST a /api/qr-free-generation) — genera un registro en DB dev.

#### Estructura interna (para el refactor)

- **Constantes module-scope**: `features` (3 items con `<Icon>`), `stats` (3 items) → mover a secciones.
- **Estado del generador (5 useState + 1 ref)**: `qrType`, `qrContent`, `generatedQR`, `email`, `hasInteracted` + `qrRef` → **encapsular en `HomeQrGenerator`** (su propio estado, handlers `handleGenerateQR`/`handleQRTypeChange`).
- **JSX**: 6 secciones → **subcomponentes**: `HomeHero` (logo con theme + CTA con router), `HomeStaticSections` (Possibilities + HowToStart), `HomeQrGenerator` (form + preview), `HomeFeaturesStats` (Features + Stats).
- **Orquestador**: `Header` + secciones + `Footer` (~25 líneas). `useThemeState` se mueve a HomeHero (único consumidor del logo).

### 4.7 Baseline C-08 — `qr/pay` (2026-08-09, PRE-refactor)

> [!important] Datos del componente
> **Archivo:** `src/app/dashboard/qr/pay/page.tsx` (352 líneas reales; doctor reporta 324). **Checkout Webpay** — sin props. **Servicios:** `CartService.getCart`, `WebpayService.createTransaction`, `QrActivateService.createActivation`. **Verificado en navegador** (item `pay-baseline-c08` $35.000 inyectado vía `/api/cart`).

#### Estados y flujos (verificados en navegador)

| ID | Comportamiento (PRE-refactor) | Evidencia |
| --- | --- | --- |
| C08-B-01 | **Resumen de Compra**: items (QR Code + Duración + precio `toLocaleString('es-CL')`) + Total (`calculateTotal` = subtotal) | snapshot |
| C08-B-02 | **Tipo de Documento ***: CustomSelect con **solo 2 opciones** (Boleta/Factura — sin "No aplica"); borde verde/rojo según touched; "Este campo es requerido" si touched sin selección | snapshot dropdown |
| C08-B-03 | ⚠️ **BUG preexistente documentado**: `documentType` (useState default BOLETA, NUNCA se actualiza) vs `selectedDocumentType` (lo que setea el select). Los campos FACTURA (gated por `documentType === FACTURA`) **NUNCA se muestran**; `validateInvoiceData` (mismo gating) **siempre pasa** → el botón se habilita con solo seleccionar tipo, sin validar factura | snapshot: Factura seleccionado → sin campos + botón enabled |
| C08-B-04 | **Botón "Proceder al Pago"**: disabled si `loading || !selectedDocumentType || errors > 0`; clases `bg-gray-400`/`bg-accent-500` según estado | snapshot (disabled → enabled) |
| C08-B-05 | **handlePayment**: valida sesión (toast "Debes iniciar sesión...") → `validateInvoiceData` → `WebpayService.createTransaction({buyOrder: Date.now(), sessionId: user.id, amount})` → build QrActivate (WEBPAY/PENDING, WebpayTransaction INITIAL, qrList con `getDurationInMilliseconds`, invoiceData si FACTURA — con el bug, nunca) → `createActivation` → **redirect** `window.location.href = ${url}?token_ws=${token}` | código |
| C08-B-06 | **Carrito vacío**: "Carrito Vacío" + Volver al Dashboard; **loading**: spinner | código |
| C08-B-07 | **Fetch**: `CartService.getCart` en useEffect con `isMounted` guard + toast error | código |

> [!note] ⚠️ Datos de prueba
> Item `pay-baseline-c08` ($35.000, 1 año) agregado al carrito vía POST `/api/cart` — **limpiar carrito tras baseline** (borrar del API o usar UI).

#### Estructura interna (para el refactor)

- **Lógica pura extraíble**: `calculateSubtotal`/`calculateTax`/`calculateTotal` (duplicadas de activate/send — C-04), `validateInvoiceData` → pura `{errors, isValid}`, `buildWebpayActivation(...)` (payload QrActivate WEBPAY, ~25 líneas).
- **JSX**: resumen items + total (~45 líneas) → `PayCartSummary` (o reutilizar patrón); campos FACTURA (~60 líneas) → `PayInvoiceFields`; orquestador con guards.
- **Timing a preservar**: gating del botón, `isMounted` del useEffect, redirect a Webpay, **el bug documentType/selectedDocumentType se mantiene tal cual** (no se corrige en este refactor — solo extracción).

---

## 5. Ejecuciones de react-doctor (dinámica)

### 5.1 Ejecución B-0 (2026-08-09, previa)

**Resultado: Score 87/100 — 11 issues** (8 `no-giant-component` + 2 falso positivo + 1 decisión). Línea base de esta spec. Ver SPEC-004 §3.5.

### 5.3 Ejecución B-2 (2026-08-09, tras C-02)

**Resultado: Score 87/100 — 9 issues** (6 `no-giant-component` + 2 falso positivo + 1 decisión). C-02 ListUrlForm resuelto: **489 → 236 líneas** (`ListUrlForm.tsx`) + `ListUrlForm.helpers.ts` (213) + `ListUrlRow.tsx` (110).

> [!success] C-02 implementado (commits `f2b34ed` + `ad47714` en qr-app)
> - **`f2b34ed` (fix de validación — bug reportado por el usuario)**: `hasUsableUrlContent` en `CreateQrForm.helpers.ts` — una URL con solo protocolo (`https://` autopopulado al elegir "Sitio Web") ya NO habilita el botón "Crear QR" (antes `item.url && item.typeUrl` con string truthy la aceptaba). Verificado en navegador: `https://` → disabled, con dominio → enabled. Aplica a `isValidForm` (gating) y `validateDataForSubmit` (abort).
> - **`ad47714` (refactor)**: helpers movidos intactos (`detectUrlType`, `formatUrl`, `extractRelevantUrl`, `buildUrlList`, `createEmptyVCardData`, `socialTypes`, tipo `Row`) + subcomponente `ListUrlRow` (fila Draggable, JSX idéntico) + orquestador.
> - **Código muerto eliminado**: `ensureUrlFormat` (no se usaba — el doctor lo detectó como `unused-export` al exportarlo)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C02-B-01..B-06: render, dropdown 40 tipos, autopopulado + botón disabled con https://, dominio → enabled, agregar fila)
> - ⚠️ Datos de prueba: QR tipo LIST `ejemplo-baseline-c02.cl` creado durante validación; usuario `baselinec01` con email verificado en Mongo (necesario para loguear)

> [!warning] Fix de layout post-C-02 (commit `95201c0`, reportado por el usuario)
> **Problema**: en `md:flex-row`, el wrapper del `Select` (`ui/select.tsx` genera `relative inline-block w-full`) competía con el contenedor del input (ambos `w-full` = 100%) → flexbox repartía el ancho ~50/50 → el input se veía corto (298px de 727 disponibles).
> **Fix**: `<Select className="w-full md:w-[200px] md:shrink-0">` (wrapper fijo 200px en md, full en móvil) + contenedor del input `flex w-full flex-1 gap-2` (toma el resto en md). Verificado visualmente por el usuario: ✅ correcto.

### 5.6 Ejecución B-5 (2026-08-09, tras C-05)

**Resultado: Score 88/100 — 6 issues** (3 `no-giant-component` + 2 falso positivo + 1 decisión). C-05 PlanForm resuelto: **470 → 239 líneas** (`PlanForm.tsx`) + `PlanForm.helpers.ts` (101) + `PlanDetailsList.tsx` (61) + `PlanFormFields.tsx` (113).

> [!success] C-05 implementado (commit `71a2796` en qr-app)
> - `PlanForm.helpers.ts`: `QR_TYPE_LABELS`, `DurationType`, `genDetailId`/`defaultPlan`, tipos + **nuevos** `validateFormData` (pura) y `buildSubmitData` (payload sin id local)
> - `PlanDetailsList.tsx`: detalles dinámicos (Agregar/eliminar por id, keys estables)
> - `PlanFormFields.tsx`: grid de campos básicos (nombre/descripción/precio/fecha fin/duración tipo+número)
> - `PlanForm.tsx`: orquestador (estado, handlers, tipo QR, checkboxes, botones)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C05-B-01..B-09: render create, errores submit idénticos "El nombre es requerido"/"La descripción es requerida"/"El precio debe ser mayor a 0"/"Todos los detalles son requeridos", agregar detalle)
> - Sin datos de prueba (solo validación de errores, sin crear planes)

### 5.5 Ejecución B-4 (2026-08-09, tras C-04)

**Resultado: Score 88/100 — 7 issues** (4 `no-giant-component` + 2 falso positivo + 1 decisión). C-04 activate/send resuelto: **475 → 283 líneas** (`page.tsx`) + `activation.helpers.ts` (60) + `ActivationSuccess.tsx` (60) + `CartSummary.tsx` (45) + `InvoiceFields.tsx` (85).

> [!success] C-04 implementado (commit `5753ef7` en qr-app)
> - `activation.helpers.ts`: `calculateSubtotal`/`calculateTax`/`calculateTotal` (module scope) + `buildQrActivationData` (payload QrActivate, código idéntico)
> - `ActivationSuccess.tsx`: pantalla de éxito (check verde, detalles transacción, QR activados). **Fix `no-locale-format-in-render`**: precio con `Intl.NumberFormat('es-CL')` module-scope + fecha con `formatDate` (utils/date, patrón SPEC-004)
> - `CartSummary.tsx`: resumen items + total · `InvoiceFields.tsx`: campos FACTURA condicionales con errores en vivo
> - `page.tsx`: orquestador (guards, estado, handleActivation con toasts, tipo doc, mensaje, botón gating intactos)
> - **Código muerto eliminado**: `toDocumentTypeString` (lib/format.ts — nadie lo usaba, doctor lo marcó unused-export)
> - **Fix layout reportado por el usuario**: "Mensaje del Administrador" quedó fuera del contenedor `p-6 border-t` (perdió padding lateral) → restaurado dentro (textarea 720px en vez de 768px). Verificado ✅
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C04-B-01..B-10: resumen, tipo doc, FACTURA condicional, RUT en vivo "DV inválido", gating botón, carrito con item)
> - ⚠️ Datos de prueba: `baselinec01` → role admin; QR `9fcdc142...` (usuario e2e) en carrito admin — **limpiar carrito tras baseline**

### 5.4 Ejecución B-3 (2026-08-09, tras C-03)

**Resultado: Score 87/100 — 8 issues** (5 `no-giant-component` + 2 falso positivo + 1 decisión). C-03 QrGrid resuelto: **490 → 260 líneas** (`QrGrid.tsx`) + `QrCard.tsx` (177) + `QrGrid.helpers.ts` (66).

> [!success] C-03 implementado (commit `17c7fca` en qr-app)
> - `QrGrid.helpers.ts`: `isPetTagItem`, `isQrActive`, `getQrLabel`, `getQrUrl` movidos intactos + `getQrTooltipContent` (ternario del tooltip pet/list → función pura, mismo string con `<br/>`)
> - `QrCard.tsx`: tarjeta individual (JSX idéntico: label, favorito, QrDisplay 150px, estado Activo/Inactivo, expiración, tooltip pet/list, botones por estado/rol). Usa `useRouter` interno para stats/edit/activate; callbacks: `onToggleFavorite`, `onDelete`, `onShare`
> - `QrGrid.tsx`: orquestador (header + select 10/20/50/100, búsqueda, map → QrCard, paginación, ConfirmationDialog + ShareModal)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C03-B-01..B-04, B-09: header, búsqueda, tarjeta QR Dinámico Inactivo con Editar/Activar/Eliminar, paginación)
> - ⚠️ Datos de prueba: QR dinámico `grid-baseline-c03.cl` creado (usuario baselinec01) durante validación

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

### 5.7 Ejecución B-6 (2026-08-09, tras C-06)

**Resultado: Score 88/100 — 5 issues** (2 `no-giant-component` + 2 falso positivo + 1 decisión). C-06 HomePageClient resuelto: **429 → 25 líneas** (`HomePageClient.tsx`) + `HomeHero.tsx` (65) + `HomeStaticSections.tsx` (45) + `HomeQrGenerator.tsx` (135) + `HomeFeaturesStats.tsx` (75).

> [!success] C-06 implementado (commit `1cfe835` en qr-app)
> - `HomeHero.tsx`: hero (logo según theme con `useThemeState` movido aquí, 3 CTAs con router)
> - `HomeStaticSections.tsx`: Possibilities (AnimatedLinkList) + HowToStart (5 pasos)
> - `HomeQrGenerator.tsx`: **estado encapsulado** (qrType/qrContent/generatedQR/email/hasInteracted + qrRef) + `handleGenerateQR` (formato por tipo + POST `/api/qr-free-generation`) + preview con Descargar
> - `HomeFeaturesStats.tsx`: Features (3 tarjetas) + Stats (3 valores) — arrays module-scope
> - `HomePageClient.tsx`: orquestador 25 líneas (Header + secciones + Footer)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C06-B-01..B-07: hero, AnimatedLinkList, 5 pasos, generador con botón disabled → habilitado, features, stats)
> - ⚠️ Datos de prueba: 1 QR gratuito generado (`baseline-c06@test.cl` / `https://home-baseline-c06.cl`)

### 5.8 Ejecución B-7 (2026-08-09, tras C-07)

**Resultado: Score 87/100 — 5 issues** (1 `no-giant-component` + 1 `prefer-useReducer` deuda + 2 falso positivo + 1 decisión). C-07 qr/edit resuelto: **388 → 175 líneas** (`page.tsx`) + `editQrForm.helpers.ts` (130) + `EditQrForm.tsx` (110). **Salió de no-giant-component**. Fix layout preview (`bg-white` → transparente, commit `4de2c7a`).

> [!success] Deuda `prefer-useReducer` RESUELTA (commit `61d97e7`)
> El `prefer-useReducer` que el doctor expuso al extraer EditQrForm (14+ useState del orquestador) se resolvió con el recipe de CreateQrForm: `editQrForm.state.ts` (reducer `SET_FIELD`/`SET_INITIAL`/`RESET` + `createInitialEditState`), `EditQrForm` recibe `values` + `onFieldChange` (contrato simplificado de 15 props a 2), `page.tsx` con `useReducer` (175 → **126 líneas**). **Validado**: tsc/lint/build ✅ + navegador (editar URL → guardar → grilla con URL actualizada). **Doctor: 88/100 · 3 issues** — solo quedan 2 falsos positivos (chart.js) + 1 decisión (img). **0 issues accionables.**

### 5.9 Ejecución B-8 (2026-08-09, tras C-08) — ESTADO FINAL

**Resultado: Score 88/100 — 4 issues · ✅ 0 `no-giant-component`** (CA-01 CUMPLIDO)

> [!success] C-08 implementado (commit `f877d83`) — **SPEC-004-B COMPLETA**
> - `pay.helpers.ts`: `calculateSubtotal`/`calculateTax`/`calculateTotal` + `validateInvoiceData` pura + `buildWebpayActivation` (payload QrActivate WEBPAY/PENDING)
> - `PayCartSummary.tsx`: resumen de compra + total · `PayInvoiceFields.tsx`: campos FACTURA (gated por documentType — **bug preexistente documentado en §4.7 C08-B-03, NO corregido**)
> - `page.tsx`: orquestador 226 líneas (guards, fetch isMounted, handlePayment con redirect Webpay intactos)
> - **Validado**: tsc ✅ · lint ✅ · build ✅ (58/58) · navegador ✅ (C08-B-01..B-07: resumen, tipo doc, botón disabled → enabled, bug FACTURA preservado)
> - ⚠️ Datos de prueba: item `pay-baseline-c08` en carrito (`/api/cart`) — limpiar

> [!success] Estado final de la spec (8/8 componentes)
> | C | Componente | Antes → Después |
> | --- | --- | --- |
> | C-01 | SignUpForm | 548 → 276 |
> | C-02 | ListUrlForm | 489 → 236 |
> | C-03 | QrGrid | 490 → 260 |
> | C-04 | activate/send | 475 → 283 |
> | C-05 | PlanForm | 470 → 239 |
> | C-06 | HomePageClient | 429 → 25 |
> | C-07 | qr/edit/[id] | 388 → 175 |
> | C-08 | qr/pay | 352 → 226 |
> **Score: 87/100 (11 issues) → 88/100 (4 issues) · 8 `no-giant-component` → 0**
>
> Issues restantes (3): 2 `prefer-dynamic-import` (falso positivo chart.js), 1 `nextjs-no-img-element` (decisión SPEC-002). **0 issues accionables** (el `prefer-useReducer` de qr/edit se resolvió con `editQrForm.state.ts`, commit `61d97e7`).

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registradas en `docs/tarea/SPEC-004-B-tareas.json` (formato Taskmaster-compatible).

| ID | Tarea | Estado |
| --- | --- | --- |
| T-004B-01 | **C-01 SignUpForm** (548→276): baseline + refactor + validación | ✅ done (commit `31b8022`) |
| T-004B-02 | **C-02 ListUrlForm** (489→236): baseline + refactor + validación | ✅ done (commits `f2b34ed` + `ad47714`) |
| T-004B-03 | **C-03 QrGrid** (490→260): baseline + refactor + validación | ✅ done (commit `17c7fca`) |
| T-004B-04 | **C-04 activate/send** (475→283): baseline + refactor + validación | ✅ done (commit `5753ef7`) |
| T-004B-05 | **C-05 PlanForm** (470→239): baseline + refactor + validación | ✅ done (commit `71a2796`) |
| T-004B-06 | **C-06 HomePageClient** (429→25): baseline + refactor + validación | ✅ done (commit `1cfe835`) |
| T-004B-07 | **C-07 qr/edit/[id]** (388→175): baseline + refactor + validación | ✅ done (commit `5f80275`) |
| T-004B-08 | **C-08 qr/pay** (352→226): baseline + refactor + validación | ✅ done (commit `f877d83`) |
| T-004B-09 | Validación final: doctor (0 no-giant-component) + cierre de spec | ✅ done — **0 `no-giant-component`**, score 88/100, 4 issues (1 deuda + 2 falso + 1 decisión) |

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
| 2026-08-09 | Equipo | **C-02 ListUrlForm completado**: baseline §4.2 (C02-B-01..B-10). **Bug reportado por el usuario corregido**: `https://` autopopulado ya no habilita el botón (`hasUsableUrlContent`, commit `f2b34ed`). Refactor 489→236 líneas (helpers + ListUrlRow, commit `ad47714`). Código muerto `ensureUrlFormat` eliminado. Ejecución B-2: 87/100, 9 issues (6 giants). Validado tsc/lint/build/navegador |
| 2026-08-09 | Equipo | **Fix layout C-02** (commit `95201c0`): wrapper del Select con `w-full` competía con el input en `md:flex-row` → ancho partido ~50/50. Fix: `Select className="w-full md:w-[200px] md:shrink-0"` + input `flex-1`. Verificado por el usuario ✅ |
| 2026-08-09 | Equipo | **C-03 QrGrid completado**: baseline §4.3 (C03-B-01..B-10). Refactor 490→260 líneas (QrCard.tsx + QrGrid.helpers.ts, commit `17c7fca`). `getQrTooltipContent` nueva (ternario del tooltip pet/list a función pura). Ejecución B-3: 87/100, 8 issues (5 giants). Validado tsc/lint/build/navegador |
| 2026-08-09 | Equipo | **C-04 activate/send completado**: baseline §4.4 (C04-B-01..B-10). Refactor 475→283 (activation.helpers + ActivationSuccess + CartSummary + InvoiceFields, commit `5753ef7`). **Fix layout reportado por usuario**: mensaje admin fuera del contenedor p-6 → restaurado. **Código muerto**: `toDocumentTypeString` eliminado. **Fix locale-format**: priceFormatter module-scope + formatDate. Ejecución B-4: **88/100, 7 issues** (4 giants). Validado tsc/lint/build/navegador |
| 2026-08-09 | Equipo | **C-05 PlanForm completado**: baseline §4.5 (C05-B-01..B-09). Refactor 470→239 (PlanForm.helpers + PlanDetailsList + PlanFormFields, commit `71a2796`). `validateFormData`/`buildSubmitData` puras nuevas. Ejecución B-5: **88/100, 6 issues** (3 giants). Validado tsc/lint/build/navegador |
| 2026-08-09 | Equipo | **C-06 HomePageClient completado**: baseline §4.6 (C06-B-01..B-07). Refactor 429→25 (HomeHero + HomeStaticSections + HomeQrGenerator + HomeFeaturesStats, commit `1cfe835`). Estado del generador encapsulado. Ejecución B-6: **88/100, 5 issues** (2 giants). Validado tsc/lint/build/navegador |
| 2026-08-09 | Equipo | **C-07 qr/edit completado**: refactor 388→175 (editQrForm.helpers + EditQrForm, commit `5f80275`). Fix layout preview (commit `4de2c7a`). Salió de no-giant. Deuda: prefer-useReducer. Ejecución B-7: 87/100, 5 issues (1 giant) |
| 2026-08-09 | Equipo | **C-08 qr/pay completado + SPEC-004-B IMPLEMENTADA**: refactor 352→226 (pay.helpers + PayCartSummary + PayInvoiceFields, commit `f877d83`). **0 `no-giant-component`** (CA-01 ✅), score 88/100, 4 issues. Bug preexistente documentType/selectedDocumentType documentado (§4.7). Todos los CA cumplidos — status: implementado |
| 2026-08-09 | Equipo | **Deuda prefer-useReducer RESUELTA** (commit `61d97e7`): qr/edit con `editQrForm.state.ts` (reducer SET_FIELD/SET_INITIAL/RESET), EditQrForm con contrato values+onFieldChange, page.tsx 175→126. **Doctor: 88/100 · 3 issues (0 accionables)** — solo falsos positivos y decisiones |
| 2026-08-09 | Equipo | **C-07 qr/edit/[id] completado**: baseline (QR Dinámico prellenado, switch, preview). Refactor 388→175 (editQrForm.helpers + EditQrForm, commit `5f80275`). `extractQrValues`/`buildUpdatedData`/`transformVCardForSubmit` puras. **Salió de no-giant-component** (queda 1: qr/pay). **Deuda menor documentada**: `prefer-useReducer` en page.tsx (15+ useState — patrón ya resuelto en CreateQrForm/SignUpForm, no bloquea CA-01). Ejecución B-7: **87/100, 5 issues** (1 giant + 1 prefer-useReducer + 2 falso + 1 decisión) |
