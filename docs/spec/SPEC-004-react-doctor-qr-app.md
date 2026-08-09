---
title: "SPEC-004: Auditoría react-doctor y corrección de hallazgos en qr-app"
date: 2026-08-07
updated: 2026-08-09
tags:
  - spec
  - mantenimiento
  - frontend
  - calidad
  - react-doctor
  - auditoria
status: borrador
aliases:
  - SPEC-004
  - react-doctor qr-app
---

# SPEC-004: Auditoría react-doctor y corrección de hallazgos en qr-app

> [!abstract] Decisión clave
> Integrar `react-doctor` como script de diagnóstico (`npm run doctor`) en `qr-app/`, ejecutarlo sobre el código, **documentar todos los hallazgos en esta spec** y corregir los problemas detectados. Spec **dinámica**: se actualiza en cada iteración del loop (ejecutar → documentar → corregir → re-ejecutar) hasta alcanzar el estado objetivo.

> [!info] Metadatos
> - **Estado:** Borrador (dinámica — se actualiza con cada ejecución)
> - **Fecha:** 2026-08-07
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Alcance:** Solo `qr-app/`. No incluye servicios backend.
> - **Relacionado:** [[SPEC-003-auditoria-dependencias-qr-app]] (predecesora: actualización de dependencias)

---

## 1. Objetivo

Detectar problemas de calidad, rendimiento y buenas prácticas en el código React de `qr-app/` usando `react-doctor`, documentarlos en esta spec y corregirlos de forma iterativa.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-004 |
| --- | --- | --- |
| Calidad de código | Desconocido (sin auditoría) | Hallazgos documentados y corregidos |
| Mantenibilidad | — | Reducción de anti-patterns detectados |
| Repetibilidad | — | `npm run doctor` disponible para futuras auditorías |
| Trazabilidad | — | Historial de hallazgos y correcciones en esta spec |

### 1.2 Out of scope

- Auditoría de servicios backend (`bff-service`, `user-service`, `qr-service`).
- Cambios de arquitectura mayores no derivados directamente de hallazgos de react-doctor.

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1**. Agregar script `"doctor": "npx react-doctor@latest ."` en `package.json` de `qr-app/`.
- **RF-2**. Ejecutar `npm run doctor` y capturar el reporte completo.
- **RF-3**. Documentar cada hallazgo en la §3 de esta spec (severidad, archivo, descripción).
- **RF-4**. Corregir los hallazgos corregibles, validando con `tsc --noEmit`, `lint` y `build` después de cada corrección.
- **RF-5**. Re-ejecutar `npm run doctor` al final y documentar el estado final.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: `npm run doctor` existe y ejecuta sin errores de tooling.
- **CA-02**: Todos los hallazgos de la primera ejecución están documentados en la §3.
- **CA-03**: Los hallazgos corregibles están corregidos (con evidencia de re-ejecución).
- **CA-04**: `npx tsc --noEmit` pasa sin errores al final.
- **CA-05**: `npm run lint` pasa sin errores al final.
- **CA-06**: `npm run build` genera el build de producción exitosamente al final.

---

## 3. Hallazgos de react-doctor (dinámica)

> [!note] Sección dinámica
> Esta sección se actualiza en cada iteración del loop. Formato por hallazgo:
> `[ID] Severidad — Descripción | Archivo(s) | Estado: pendiente/en-proceso/corregido/no-corregible`

### 3.1 Ejecución 1 (2026-08-07)

**Resultado: Score 37/100 — CRITICAL · 347 issues** (304 archivos escaneados, 3.5s)

| Categoría | Errores | Warnings | Total |
| --- | --- | --- | --- |
| Bugs | 11 | 149 | 160 |
| Maintainability | 0 | 102 | 102 |
| Accessibility | 0 | 44 | 44 |
| Performance | 0 | 37 | 37 |
| Security | 0 | 4 | 4 |
| **Total** | **11** | **336** | **347** |

#### 3.1.1 Errores (11) — prioridad crítica

| ID | Regla | Descripción | Archivos | Estado |
| --- | --- | --- | --- | --- |
| E-01 | `jsx-key` | Missing key in list | `src/components/qr/UrlList.tsx:331` | pendiente |
| E-02 | `no-unguarded-browser-global-in-render-or-hook-init` | Browser global read during server render (×3) | `src/app/dashboard/admin/qr/activate/page.tsx:43`, `src/app/dashboard/qr/activate/page.tsx:43`, `src/components/qr/UrlList.tsx:319` | pendiente |
| E-03 | `nextjs-no-head-import` | `next/head` en App Router (×2) | `src/app/terminos/page.tsx:7`, `src/app/tipos-qr/page.tsx:5` | pendiente |
| E-04 | `effect-needs-cleanup` | Effect subscription/timer sin cleanup (×2) | `src/contexts/AuthContext.tsx:126`, `src/hooks/useInactivityTimeout.ts:14` | pendiente |
| E-05 | `no-effect-with-fresh-deps` | Effect dependency recreada cada render (×3) | `src/components/qr/forms/ListUrlForm.tsx:308, 331, 331` | pendiente |

#### 3.1.2 Seguridad (4)

| ID | Regla | Archivos | Estado |
| --- | --- | --- | --- |
| S-01 | `dangerous-html-sink` — HTML injection con contenido dinámico (×2) | `src/components/ChatWindow/ChatWindow.tsx:179`, `src/components/Footer/index.tsx:13` | pendiente |
| S-02 | `unsafe-json-in-html` — JSON sin escapar en sink HTML | `src/components/Footer/index.tsx:13` | pendiente |
| S-03 | `window-open-without-noopener` | `src/components/ShareModal.tsx:56` | pendiente |

#### 3.1.3 Bugs — warnings (156)

| Regla | Cantidad | Archivos principales | Estado |
| --- | --- | --- | --- |
| `no-array-index-as-key` | 42 | ayuda, cookies, precios, terminos, productos, UrlList, PetForm, vCard* | pendiente |
| `no-fetch-response-used-without-status-check` | 11 | api/plan, api/qr-activate, api/qr/list-image, chat.service, qr.service | pendiente |
| `nextjs-no-use-search-params-without-suspense` | 8 | dashboard/qr, activate, pet-tag, webpay, users/[userIdClient]/qr | pendiente |
| `nextjs-no-client-side-redirect` | 9 | dashboard/* (router.push en client) | pendiente |
| `no-set-state-after-await-in-effect` | 7 | dashboard/*, webpay, stats | pendiente |
| `exhaustive-deps` | 8 | dashboard, pet-tag, stats, forgot-password, ListUrlForm | pendiente |
| `no-direct-state-mutation` | 5 | `src/app/dashboard/qr/edit/[id]/page.tsx` | pendiente |
| `no-loading-flag-reset-outside-finally` | 3 | qr/pay, forgot-password, LoginForm | pendiente |
| `no-effect-chain` | 4 | pet-tag, qr/page, users/[userIdClient]/qr, ListUrlForm | pendiente |
| `rerender-state-only-in-handlers` | 9 | activate/send, pet-tag, edit, ChatWindow, CreateQrForm, QrGrid, ListUrlForm, PhoneInput | pendiente |
| `rerender-defer-reads-hook` | 1 | `src/app/dashboard/admin/pet-tag/page.tsx:15` | pendiente |
| `no-pass-live-state-to-parent` | 12 | vCardNew/*, EmailInputVcard | pendiente |
| `no-prop-callback-in-effect` | 4 | EmailInputVcard, StringArrayInput, VCardNew | pendiente |
| `no-pass-data-to-parent` | 10 | vCardNew/* | pendiente |
| `no-adjust-state-on-prop-change` | 9 | vCardNew/* | pendiente |
| `no-initialize-state` | 5 | SignUpForm, ThemeToggle, useAuth, useThemeState | pendiente |
| `rerender-lazy-state-init` | 5 | CreateQrForm, vCardNew/* | pendiente |
| `prefer-useReducer` | 1 | `src/components/qr/CreateQrForm.tsx:31` | pendiente |
| `jsx-no-constructed-context-values` | 2 | AuthContext, FacebookSDKProvider | pendiente |
| `no-giant-component` | 10 | activate/send, qr/edit, qr/pay, PlanForm, SignUpForm, HomePageClient, CreateQrForm, QrGrid, UrlList, ListUrlForm | pendiente |

#### 3.1.4 Performance (37)

| Regla | Cantidad | Archivos principales | Estado |
| --- | --- | --- | --- |
| `prefer-module-scope-pure-function` | 24 | contacto, activate/send, users, PlanGrid, QrGrid, UrlList, ListUrlForm, vCard | pendiente |
| `prefer-module-scope-static-value` | 15 | Button, CustomTooltip, Header, PlanForm, Tooltip, navigation, QrCustomizer, Toast | pendiente |
| `no-transition-all` | 9 | activate/send, dashboard/layout, qr/pay, documentacion, FAQ, LoginForm, ThemeToggle | pendiente |
| `nextjs-image-missing-sizes` | 4 | blog, nosotros, tutoriales | pendiente |
| `prefer-dynamic-import` | 2 | `src/app/dashboard/qr/stats/[id]/page.tsx:7,19` | pendiente |
| `no-locale-format-in-render` | 3 | PetInfo, QrGrid | pendiente |
| `rendering-hoist-jsx` | 1 | PasswordTooltip | pendiente |
| `rendering-hydration-no-flicker` | 3 | SignUpForm, ThemeToggle | pendiente |
| `rendering-svg-precision` | 3 | ChatWindow, icon/steam, icon/ubereats | pendiente |
| `no-spread-accumulator-in-reduce` | 1 | PetTagActivateForm | pendiente |
| `js-set-map-lookups` | 1 | pet-tag.service | pendiente |

#### 3.1.5 Accessibility (44)

| Regla | Cantidad | Archivos | Estado |
| --- | --- | --- | --- |
| `no-placeholder-only-field` | 4 | ayuda, blog, documentacion, tutoriales | pendiente |
| `click-events-have-key-events` | 6 | users, Input, Sidebar, CartAdminSidebar, CartSidebar, vcard-select | pendiente |
| `no-static-element-interactions` | 7 | users, Input, Sidebar, Cart*, vcard-select, ui/select | pendiente |
| `dialog-has-accessible-name` | 2 | GeolocationPrompt ×2 | pendiente |
| `prefer-html-dialog` | 2 | GeolocationPrompt ×2 | pendiente |
| `prefer-tag-over-role` | 5 | AnimatedLinkList, HomePageClient | pendiente |
| `no-redundant-roles` | 4 | Header, LoginForm, SignUpForm, DashboardHeader | pendiente |
| `control-has-associated-label` | 6 | Cart*, QrGrid, VCardNew, Toast, ToggleSwitch | pendiente |
| `label-has-associated-control` | 8 | ListImageUploader, vCardNew/*, ToggleSwitch | pendiente |

#### 3.1.6 Maintainability (102)

| Regla | Cantidad | Archivos | Estado |
| --- | --- | --- | --- |
| `deslop/unused-file` | 48 | backup/copias_antiguas (1), src/app (5), src/components (17), src/hooks (2), src/interfaces (3), src/lib (2), src/services (3), src/styles (1), src/types (3), src/utils (2), src/components/qr (9) | pendiente |
| `deslop/unused-dependency` | 1 | package.json | pendiente |
| `deslop/unused-export` | 4 | qrTypes.ts, qr.interface.ts, lib/auth.ts, qr.service.ts | pendiente |

> [!warning] Nota sobre `unused-file`
> 1 archivo está en `backup/copias_antiguas/` (no tocar — es backup). Los 47 restantes están en `src/` y son candidatos a eliminación **solo tras verificar manualmente que no se importan** (react-doctor ya lo verificó, pero se hará doble check con grep antes de borrar).

### 3.2 Ejecución 2 (2026-08-09)

**Resultado: Score 84/100 — 16 issues** (progreso acumulado: 37 → 84, 11 reglas eliminadas)

> [!success] Reglas eliminadas en esta iteración
> `no-effect-chain` (×4) · `no-client-side-redirect` (×3) · `no-loading-flag-reset-outside-finally` (×3) · `no-initialize-state` (×3) · `rendering-hydration-no-flicker` (×2) · `no-locale-format-in-render` (×3) · `rendering-svg-precision` (×3) · `unused-export` (×2) · `jsx-no-constructed-context-values` (×2) · `no-unguarded-throwing-parse-call` (×1) · `no-spread-accumulator-in-reduce` (×1) · `exhaustive-deps` regresiones (×2) · `rerender-defer-reads-hook` (×1)

> [!info] Falso positivo documentado
> `prefer-dynamic-import` (chart.js en `StatsCharts.tsx`) — verificado con `next build`: chart.js vive en chunk propio (`3wpei1gz69_ab.js`, 170KB con tree-shaking), no está en `entryJSFiles` de ninguna ruta ni en HTML estáticos. El dynamic import con `ssr: false` es el patrón canónico. **No corregible** (el código ya es óptimo).

#### 3.2.1 Pendientes (16 issues)

| Regla | Cant | Archivos | Estado |
| --- | --- | --- | --- |
| `no-giant-component` | 9 | admin/qr/activate/send, qr/edit/[id], qr/pay, PlanForm, SignUpForm, HomePageClient, **CreateQrForm**, QrGrid, ListUrlForm | pendiente |
| `exhaustive-deps` | ~3 | varios (restantes tras fixes de la iteración) | ✅ corregido (verificado en Ejecución 3) |
| `prefer-useReducer` | 1 | **CreateQrForm.tsx:30** | pendiente (→ T-004-07) |
| `rerender-lazy-state-init` | 1 | CreateQrForm.tsx:38 | pendiente (→ T-004-07) |
| `nextjs-no-img-element` | 1 | UrlList.tsx:303 | decisión documentada: mantener (eslint-disable, SPEC-002) |
| `js-set-map-lookups` | 1 | pet-tag.service.ts:74 | ✅ corregido (commit `1a20f83`) |
| `unused-file` | 1 | QRCode/index.tsx | ✅ corregido (commit `1a20f83`) |

> [!important] Decisión de arquitectura — `CreateQrForm` (prefer-useReducer + no-giant-component + rerender-lazy-state-init)
> `CreateQrForm` concentra **3 hallazgos** (15+ useState relacionados, componente gigante, state initializer por render). Se decide **refactor conjunto**: migrar el estado del formulario a `useReducer` con `actions` (`SET_FIELD`, `SET_TYPE`, `RESET`) **junto con** el split del componente gigante por tipo de QR (los subformularios `DynamicQrForm`, `WhatsappQrForm`, etc. ya existen) — así cada tipo de QR recibe su propio estado y `CreateQrForm` queda como orquestador. Hacer el useReducer antes del split implicaría tocar todo dos veces. **Referencia**: T-004-07.

### 3.3 Ejecución 3 (2026-08-09) — verificación manual de hallazgos

**Resultado: Score 86/100 — GREAT · 14 issues** (266 archivos escaneados, 4.5s). **Cambios respecto a Ejecución 2**: 84 → 86, 16 → 14 issues (se eliminaron `exhaustive-deps` ×3, `js-set-map-lookups` ×1 y `unused-file` ×1).

> [!success] Resueltos desde la Ejecución 2
> `exhaustive-deps` (×3, regresiones ya corregidas) · `js-set-map-lookups` (×1, commit `1a20f83`) · `unused-file` QRCode (×1, commit `1a20f83` — verificación triple: doctor + grep + resolución TS)

> [!important] Verificación manual de TODOS los 14 hallazgos (por petición del usuario — sospecha de falsos positivos)
> | Hallazgo | Veredicto | Evidencia |
> | --- | --- | --- |
> | `prefer-dynamic-import` ×2 (`StatsCharts.tsx:3,15`) | ❌ **Falso positivo** | El import estático de chart.js vive DENTRO de `StatsCharts.tsx`, pero este componente se carga lazy vía `next/dynamic` desde `page.tsx` (comentario en línea 39). Verificado en iteración anterior con `next build`: chart.js en chunk propio (170KB), no en entryJSFiles ni HTML estáticos. Apareció aquí por el refactor que movió el código de `page.tsx` → `StatsCharts.tsx`. **No corregible** (código ya óptimo) |
| `nextjs-no-img-element` ×1 (`UrlList.tsx:303`) | ✅ Real — **decisión: mantener** | Imagen dinámica del usuario (S3/R2) con `onError` fallback, `loading="lazy"`, `decoding="async"`, `eslint-disable` documentado (SPEC-002). `next/image` no aporta con dominios dinámicos/URL firmada |
| `prefer-useReducer` ×1 (`CreateQrForm.tsx:30`) | ✅ Real | 19+ useState fragmentados (líneas 35–80): estado de formulario que requiere `useReducer` → T-004-07 |
| `rerender-lazy-state-init` ×1 (`CreateQrForm.tsx:38`) | ✅ Real | `useState<string>(uuidv4())` — UUID regenerada en cada render aunque solo se usa como initializer. Fix trivial junto con T-004-07 |
| `no-giant-component` ×9 | ✅ Reales | Verificados por tamaño: CreateQrForm 609, SignUpForm 548, ListUrlForm 489, QrGrid 461, activate/send 441, PlanForm 429, HomePageClient 413, qr/edit 362, qr/pay 324 líneas. Todos >300 |

#### 3.3.1 Pendientes reales tras verificación (11)

| Regla | Cant | Archivos | Estado |
| --- | --- | --- | --- |
| `no-giant-component` | 9 | admin/qr/activate/send, qr/edit/[id], qr/pay, PlanForm, SignUpForm, HomePageClient, **CreateQrForm**, QrGrid, ListUrlForm | pendiente |
| `prefer-useReducer` | 1 | **CreateQrForm.tsx:30** | pendiente (→ T-004-07) |
| `rerender-lazy-state-init` | 1 | CreateQrForm.tsx:38 | pendiente (→ T-004-07) |
| `nextjs-no-img-element` | 1 | UrlList.tsx:303 | decisión: mantener |
| `prefer-dynamic-import` | 2 | StatsCharts.tsx:3,15 | falso positivo verificado |

> [!note] Score objetivo
> Sin T-004-07, el score real alcanzable es ~90/100 (14 → 11 issues con la decisión y el falso positivo documentados). Con el refactor de `CreateQrForm` (resuelve 3 de los 11 reales) → ~92/100. `no-giant-component` restante (8 componentes) es refactor mayor deuda técnica progresiva.

### 3.4 Baseline funcional `CreateQrForm` (2026-08-09, PRE-refactor T-004-07)

> [!important] Propósito del baseline
> Captura el **comportamiento observable actual** de `CreateQrForm` (verificado en navegador con sesión admin en `localhost:3000/dashboard/qr`) **antes** del refactor. Servirá para validar post-refactor que la funcionalidad no cambió. Screenshots: `C:\Users\Admin\AppData\Local\Temp\opencode\baseline-*.png`.

| ID | Comportamiento verificado (PRE-refactor) | Evidencia |
| --- | --- | --- |
| B-01 | Selector "Tipo de QR" muestra **8 opciones**: QR Multi links (default), QR Dinámico, QR Mascota, QR WhatsApp, QR Correo electrónico, QR WiFi, QR Texto, QR Tarjeta de contacto | dropdown abierto (snapshot) |
| B-02 | Cambio de tipo re-renderiza el subformulario correcto: Dinámico → campo URL; WhatsApp → teléfono + mensaje; Multi links → nombre/descripción/imagen/enlaces | snapshots tipo por tipo |
| B-03 | Botón "Crear QR" **deshabilitado** hasta que el formulario sea válido (estado `isFormValid()`) | disabled en snapshots |
| B-04 | URL válida (`https://...`) → botón habilitado + **vista previa en vivo** con `previewId` (`http://localhost:3000/qr/<uuid>?origen=qr`) + botón Descargar | snapshot Dynamic + console `[DEBUG]` |
| B-05 | **Creación completa**: submit → `qrService.createQr` con `idQr=previewId` → toast "QR creado" → `onQrCreated()` → **formulario se resetea** (vuelve a Multi links vacío, nuevo previewId) → QR aparece en la grilla | snapshot post-creación + console |
| B-06 | Vista previa WhatsApp con teléfono vacío muestra `wa.me/` (preview truthy aunque no válido) | snapshot WhatsApp |
| B-07 | Consumidores: `src/app/dashboard/qr/page.tsx` (`<CreateQrForm onQrCreated={...} />`) y `src/app/dashboard/users/[userIdClient]/qr/page.tsx` (con `userId`) — **props públicas: `onQrCreated`, `userId`** | grep imports |
| B-08 | Datos del QR creado viajan como `{ idQr, userId, data, typeQr }`; LIST añade `name`, `description` y `listImageUrl: null` en payload (SPEC-002: imagen se sube después con `uploadListImage`) | código `handleSubmit` |

> [!note] Checklist post-refactor
> Tras T-004-07, repetir B-01 a B-08: mismas 8 opciones, mismos subformularios, mismo gating del botón, misma preview en vivo, misma creación+reset, mismo payload a la API, mismas props públicas, y ambos consumidores intactos. + `rerender-lazy-state-init` resuelto (UUID ya no se regenera por render) y `prefer-useReducer` resuelto (sin 19 useState).

#### 3.4.1 UI de inputs — estados visuales (validado en navegador, QR Dinámico)

> [!important] Patrón actual (a preservar EXACTO tras el refactor)
> La UI de validación **no** usa validación onBlur ni estado "touched". El borde rojo (`border-red-500`) y el mensaje rojo (`text-red-500`) solo se activan cuando `state.error` está set, y **`error` solo se setea en `validateData()` (submit)**. No se limpia al escribir — persiste hasta el próximo submit o RESET. Los subformularios reciben `error` como prop y aplican `className={error ? 'border-red-500' : ''}`.

| ID | Estado | Comportamiento visual (PRE-refactor) | Evidencia |
| --- | --- | --- | --- |
| B-09 | **No mutado / vacío** | Campo vacío: sin borde rojo, helper gris visible ("La URL debe comenzar con http:// o https://"), botón "Crear QR" disabled, preview muestra placeholder "Completa el formulario para ver la vista previa del QR" | snapshot 11 |
| B-10 | **Mutado inválido (typing)** | Campo con `notaurl`: **sin borde rojo** (error aún vacío), botón disabled, pero la preview SÍ se renderiza con `previewId` (`http://localhost:3000/qr/<uuid>?origen=qr`) porque `getPreviewUrl()` devuelve el string crudo (truthy) y `error` está vacío | snapshot 12 |
| B-11 | **Inválido tras submit fallido** | Campo con borde rojo + mensaje rojo "URL inválida" bajo el input, botón disabled, preview muestra placeholder con "URL inválida" (error set → `showPreview = previewUrl && !error` = false) | snapshot 13 |
| B-12 | **Mutado válido** | Campo con `https://...`: sin borde rojo, botón habilitado, preview muestra QrDisplay en vivo con `previewId` + botón "Descargar QR" | snapshot 4 |

> [!note] Checklist post-refactor (UI)
> Repetir B-09 a B-12 con el mismo orden: vacío → escribir inválido → submit fallido (Enter/form dispatch) → escribir válido. Verificar: (1) sin borde rojo mientras se escribe, (2) error rojo SOLO tras submit fallido, (3) error persiste al escribir tras fallo, (4) preview con string crudo inválido, (5) botón habilitado solo con valor válido. Los mensajes de error (strings) deben ser idénticos: "URL inválida", "El número debe tener 11 dígitos...", etc. — los helpers los copian tal cual.

#### 3.4.2 Matriz de validación UI por tipo de QR (verificado en código de los 8 subformularios)

> [!important] Confirmación: el patrón de UI se aplica a TODOS los tipos (error → border-red-500 en el campo + mensaje text-red-500), con **2 excepciones** que el refactor debe respetar: LIST y VCARD **no usan `error` del padre** — validan internamente.

| Tipo | Subformulario | Campo con border-red-500 | Mensaje rojo | Mensajes de error exactos (de `validateData`) |
| --- | --- | --- | --- | --- |
| DYNAMIC / STATIC | DynamicQrForm | URL (`error ? 'border-red-500'`) | Bajo el input + helper gris siempre visible | `'La URL debe comenzar con http:// o https://'` · `'URL inválida'` |
| WHATSAPP | WhatsappQrForm | Teléfono | Bajo el input + helper gris | `'El número debe tener 11 dígitos incluyendo el código de país'` |
| EMAIL | EmailQrForm | Email | Bajo el input | `'Email inválido'` |
| WIFI | WifiQrForm | **Solo SSID** (password sin error) | Bajo SSID | `'El nombre de la red es requerido'` · `'La contraseña es requerida'` |
| TEXTO | TextQrForm | Textarea | Bajo el textarea + helper gris ("Máximo 10000 caracteres") | `'El texto es requerido'` · `'El texto no puede exceder los 10000 caracteres'` |
| PET | PetForm | **Los 4 obligatorios** (`error && !campo`): ownerName, phone, address, petName | **Al final del form** (no bajo campo) | `'Los campos marcados con * son obligatorios'` |
| LIST ⚠️ | ListUrlForm | Filas de enlace (`localError && !row.url`) | `{(localError \|\| error) && <p>}` — usa **localError interno** | `validateData` LIST **NO setea error** (solo return bool + console.log); validación de filas es interna |
| VCARD ⚠️ | VCardNew | Validación interna propia (touched + isValid por campo) | Interna (no recibe `error` prop del padre) | `validateData` VCARD **NO setea error** (usa `isVCardFormValid` de `onSubmit`) |

> [!warning] Implicaciones para T-004-07 (helpers)
> 1. `getValidationError(state)` debe replicar los strings EXACTOS de la tabla y el timing (solo se llama en submit). Para LIST y VCARD devuelve `null` (como hoy: no se setea error, submit se aborta silenciosamente — el botón ya está gated por `isFormValid`).
> 2. `isFormValid(state)` replica el gating del botón (LIST: `urlList.length > 0 && every(...)`; VCARD: `isVCardFormValid`).
> 3. Los subformularios **no se modifican** — solo `CreateQrForm` (orquestador) y sus helpers. El `error` sigue fluyendo como prop.

---

## 4. Diseño Técnico

### 4.1 Herramienta

- **react-doctor**: CLI de análisis de proyectos React (https://github.com/alan2207/react-doctor). Detecta problemas de rendimiento, patrones incorrectos, versiones de dependencias, etc.
- Se ejecuta con `npx react-doctor@latest .` desde la raíz de `qr-app/`.

### 4.2 Flujo de trabajo (loop)

```
1. npm run doctor          → reporte
2. Documentar hallazgos    → §3 de esta spec
3. Corregir hallazgos      → código + validación (tsc, lint, build)
4. ¿Quedan hallazgos?      → sí: volver a 1 | no: estado final
```

---

## 5. Trade-offs

_Pendiente — se documentarán decisiones tomadas durante las correcciones._

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registrar como tareas en `docs/tarea/SPEC-004-tareas.json` (formato Taskmaster-compatible).

| ID | Tarea | Estado |
| --- | --- | --- |
| T-004-01 | Crear rama `feat/spec-004-react-doctor-qr-app` | ✅ done |
| T-004-02 | Agregar script `doctor` a `package.json` | ✅ done (verificado: `npm run doctor` → 86/100) |
| T-004-03 | Ejecutar `npm run doctor` (primera pasada) | ✅ done (3 ejecuciones documentadas) |
| T-004-04 | Documentar hallazgos en §3 | ✅ done (§3.1, §3.2, §3.3) |
| T-004-05 | Corregir hallazgos (loop) | ✅ done (37 → 86/100, 11 reglas eliminadas; restantes: 11 reales, 2 falso positivo, 1 decisión) |
| T-004-06 | Validación final: tsc, lint, build + re-ejecución doctor | ✅ done (2026-08-09: tsc ✅, lint ✅, build ✅ 58/58, doctor ✅ 86/100) |
| T-004-07 | **Refactor `CreateQrForm`**: useReducer + split por tipo de QR (resuelve `prefer-useReducer`, `rerender-lazy-state-init` y su parte de `no-giant-component`) — ver decisión en §3.2.1 | pendiente (deuda técnica — no bloquea CA-01/02/04/05/06) |

---

## 7. Testing

- `npx tsc --noEmit` — sin errores de tipos.
- `npm run lint` — sin errores de lint.
- `npm run build` — build de producción exitoso.
- `npm run doctor` — reporte final documentado.

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Correcciones rompen funcionalidad existente | Media | Alto | Validar tsc/lint/build tras cada corrección; cambios pequeños e incrementales |
| Hallazgos no corregibles (requieren refactor mayor) | Media | Medio | Documentar como deuda técnica con justificación |
| react-doctor reporta falsos positivos | Media | Bajo | Validar cada hallazgo manualmente antes de corregir |

---

## 9. Observabilidad

- Cada ejecución de `npm run doctor` se registra en §3 con fecha.
- Estado de la spec se actualiza a `implementado` al cumplir todos los CA.

---

## 10. Referencias

- [[SPEC-003-auditoria-dependencias-qr-app]] — predecesora (dependencias).
- react-doctor: https://github.com/alan2207/react-doctor

---

## 11. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-07 | Equipo | Borrador inicial. Ejecución 1 de react-doctor documentada (§3.1): score 37/100, 347 issues (11 errores, 4 seguridad, 336 warnings) |
| 2026-08-09 | Equipo | Ejecución 2 documentada (§3.2): score 84/100, 16 issues. 11 reglas eliminadas (no-effect-chain, no-client-side-redirect, no-loading-flag, no-initialize-state, no-flicker, no-locale-format, svg-precision, unused-export, constructed-context-values, parse-call, spread-accumulator, set-map-lookups, unused-file). Falso positivo `prefer-dynamic-import` verificado con `next build`. Decisión de arquitectura `CreateQrForm` (useReducer + split por tipo QR) y tarea T-004-07 añadidas |
| 2026-08-09 | Equipo | Ejecución 3 documentada (§3.3): score 86/100, 14 issues. Verificación manual de TODOS los hallazgos (2 falsos positivos `prefer-dynamic-import` confirmados, 1 decisión `nextjs-no-img-element`, 11 reales). Script `doctor` agregado a `package.json` (T-004-02 done) y verificado. Taskmaster actualizado (tareas 1-3) |
| 2026-08-09 | Equipo | §11 Historial de cambios creado (formato SPEC-001). Taskmaster: tareas 3-4 done, T-004-07 documentada como deuda |
| 2026-08-09 | Equipo | T-004-07 iniciada: rama `feat/spec-004-ca03-refactor-createqrform` creada en qr-app. Baseline funcional `CreateQrForm` documentado (§3.4): B-01 a B-08 (flujos, tipos QR, estados, payload API) + B-09 a B-12 (UI de inputs: no mutado/válido/inválido tras submit, verificado en navegador con submit dispatch) + §3.4.2 matriz de validación UI por tipo (8 subformularios verificados en código; 2 excepciones: LIST y VCARD validan internamente, no usan `error` del padre) |