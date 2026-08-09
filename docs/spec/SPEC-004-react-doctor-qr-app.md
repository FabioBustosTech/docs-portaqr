---
title: "SPEC-004: Auditoría react-doctor y corrección de hallazgos en qr-app"
date: 2026-08-07
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
| `exhaustive-deps` | ~3 | varios (restantes tras fixes de la iteración) | pendiente |
| `prefer-useReducer` | 1 | **CreateQrForm.tsx:30** | pendiente |
| `rerender-lazy-state-init` | 1 | CreateQrForm.tsx:38 | pendiente |
| `nextjs-no-img-element` | 1 | UrlList.tsx:303 | pendiente |
| `js-set-map-lookups` | 1 | pet-tag.service.ts:74 | pendiente |
| `unused-file` | 1 | QRCode/index.tsx | pendiente |

> [!important] Decisión de arquitectura — `CreateQrForm` (prefer-useReducer + no-giant-component + rerender-lazy-state-init)
> `CreateQrForm` concentra **3 hallazgos** (15+ useState relacionados, componente gigante, state initializer por render). Se decide **refactor conjunto**: migrar el estado del formulario a `useReducer` con `actions` (`SET_FIELD`, `SET_TYPE`, `RESET`) **junto con** el split del componente gigante por tipo de QR (los subformularios `DynamicQrForm`, `WhatsappQrForm`, etc. ya existen) — así cada tipo de QR recibe su propio estado y `CreateQrForm` queda como orquestador. Hacer el useReducer antes del split implicaría tocar todo dos veces. **Referencia**: T-004-07.

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
| T-004-02 | Agregar script `doctor` a `package.json` | pendiente |
| T-004-03 | Ejecutar `npm run doctor` (primera pasada) | pendiente |
| T-004-04 | Documentar hallazgos en §3 | pendiente |
| T-004-05 | Corregir hallazgos (loop) | pendiente |
| T-004-06 | Validación final: tsc, lint, build + re-ejecución doctor | pendiente |
| T-004-07 | **Refactor `CreateQrForm`**: useReducer + split por tipo de QR (resuelve `prefer-useReducer`, `rerender-lazy-state-init` y su parte de `no-giant-component`) — ver decisión en §3.2.1 | pendiente |

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