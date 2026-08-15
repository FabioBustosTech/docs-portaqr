---
title: "SPEC-017: Auditoría react-doctor ronda 2 y corrección de hallazgos en qr-app"
date: 2026-08-14
tags:
  - spec
  - mantenimiento
  - frontend
  - calidad
  - react-doctor
  - auditoria
status: implementado
aliases:
  - SPEC-017
  - react-doctor ronda 2
---

# SPEC-017: Auditoría react-doctor ronda 2 y corrección de hallazgos en qr-app

> [!abstract] Decisión clave
> Re-ejecutar `npm run doctor` sobre `qr-app/` (2026-08-14): el score bajó de **88/100 (cierre SPEC-004-B) a 69/100 · 24 issues** porque specs posteriores (SPEC-005 PDF, SPEC-013 paginación, SPEC-015 admin/qrs, SPEC-016 pet-tag foto) agregaron código que reintrodujo hallazgos. Esta spec **hereda los hallazgos NO corregibles ya verificados** (falsos positivos y decisiones de SPEC-004/004-B) y corrige el resto. Spec **dinámica**: ejecutar → documentar → corregir → re-ejecutar.

> [!info] Metadatos
> - **Estado:** Borrador (dinámica — se actualiza con cada ejecución)
> - **Fecha:** 2026-08-14
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Alcance:** Solo `qr-app/`. No incluye servicios backend.
> - **Padre metodológico:** [[SPEC-004-react-doctor-qr-app]] (recipe baseline + matriz UI) y [[SPEC-004-B-no-giant-component-qr-app]] (recipe refactor por componente)
> - **Relacionado:** [[SPEC-005-pdf-multilink]], [[SPEC-013-paginacion-users-admin]], [[SPEC-015-vista-admin-qrs-global]], [[SPEC-016-imagen-mascota-pet-tag]]

---

## 1. Objetivo

Recuperar la calidad de código de `qr-app/` degradada por la evolución posterior a SPEC-004/004-B: corregir los 22 hallazgos corregibles de react-doctor y **no tocar los 2+2 conocidos** (falsos positivos verificados y decisiones documentadas), elevando el score de 69/100 a ~85-90/100.

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-017 |
| --- | --- | --- |
| Score react-doctor | 69/100 · 24 issues | ~85-90/100 · ≤5 issues (solo conocidos) |
| Deuda reintroducida | 4 `no-giant-component` (2 regresiones + 2 nuevos) | 0 |
| Código muerto | 3 `unused-export` | 0 |
| Regresiones de render | `no-locale-format-in-render` (QrCard) | 0 |
| Trazabilidad | — | Historial de hallazgos y veredictos en §3 |

### 1.2 Out of scope

- Hallazgos **NO corregibles** ya verificados en SPEC-004/004-B (ver §3.2): `prefer-dynamic-import` (chart.js) y `nextjs-no-img-element` (UrlList).
- Auditoría de servicios backend (`bff-service`, `user-service`, `qr-service`).
- Cambios de arquitectura mayores no derivados directamente de hallazgos de react-doctor.

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1**. Ejecutar `npm run doctor` y capturar el reporte completo (Ejecución 1 → §3.1).
- **RF-2**. Clasificar cada hallazgo: corregible / no-corregible (falso positivo verificado / decisión documentada / aceptado con justificación).
- **RF-3**. Corregir los hallazgos corregibles, validando `tsc --noEmit`, `lint` y `build` después de cada corrección.
- **RF-4**. Verificar manualmente los hallazgos dudosos antes de corregir (patrón SPEC-004 §3.3).
- **RF-5**. Re-ejecutar `npm run doctor` al final y documentar el estado final.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: `npm run doctor` reporta **0 `no-giant-component`** y **0 `unused-export`**.
- **CA-02**: Todos los hallazgos de la Ejecución 1 están clasificados en §3 (corregible / no-corregible con evidencia).
- **CA-03**: Los hallazgos corregibles están corregidos (con evidencia de re-ejecución).
- **CA-04**: `npx tsc --noEmit` pasa sin errores al final.
- **CA-05**: `npm run lint` pasa sin errores al final.
- **CA-06**: `npm run build` genera el build de producción exitosamente al final.
- **CA-07**: Los hallazgos NO corregibles (falsos positivos, decisiones) NO fueron tocados — solo documentados.

---

## 3. Hallazgos de react-doctor (dinámica)

> [!note] Sección dinámica
> Se actualiza en cada iteración del loop. Formato por hallazgo:
> `[ID] Severidad — Descripción | Archivo(s) | Estado: pendiente/en-proceso/corregido/no-corregible`

### 3.1 Ejecución 1 (2026-08-14)

**Resultado: Score 69/100 — NEEDS WORK · 24 issues** (332 archivos escaneados, 472ms)

| Categoría | Warnings |
| --- | --- |
| Maintainability | 12 |
| Performance | 8 |
| Security | 1 |
| Bugs | 3 |
| **Total** | **24** |

**Share link:** https://react.doctor/share?p=qr-app&s=69&w=24&f=14

#### 3.1.1 Inventario completo (24 issues, 14 files)

| ID | Regla | Cant | Archivos | Clasificación |
| --- | --- | --- | --- | --- |
| H-01 | `deslop/unused-export` | 3 | `activation.helpers.ts:19,23`, `pay.helpers.ts:20` | 🔧 corregible |
| H-02 | `no-giant-component` | 4 | `admin/qrs/page.tsx:51`, `PetTagActivateForm.tsx:29`, `CreateQrForm.tsx:41`, `ListUrlForm.tsx:42` | 🔧 corregible |
| H-03 | `rerender-lazy-state-init` | 3 | `admin/qrs/page.tsx:59,61`, `users/page.tsx:49` | 🔧 corregible |
| H-04 | `prefer-module-scope-pure-function` | 2 | `admin/qrs/page.tsx:75`, `users/page.tsx:93` | 🔧 corregible |
| H-05 | `prefer-dynamic-import` | 2 | `StatsCharts.tsx:3,15` | ⛔ **no-corregible** (falso positivo verificado, SPEC-004 §3.2/§3.3) |
| H-06 | `url-prefilled-privileged-action` | 1 | `users/page.tsx:55` | ⚖️ verificar manualmente (probable aceptado) |
| H-07 | `only-export-components` | 2 | `QrsAdminTable.tsx:34`, `PaginationControls.tsx:18` | 🔧 corregible |
| H-08 | `rerender-state-only-in-handlers` | 1 | `PetTagActivateForm.tsx:49` | 🔧 corregible |
| H-09 | `no-create-object-url-without-revoke` | 1 | `PetTagActivateForm.tsx:88` | ⚖️ verificar manualmente (probable falso positivo — revoke ya existe) |
| H-10 | `async-await-in-loop` | 1 | `CreateQrForm.tsx:143` | 🔧 corregible |
| H-11 | `nextjs-no-img-element` | 2 | `PetInfo.tsx:17`, `UrlList.tsx:307` | ⛔ UrlList: **no-corregible** (decisión SPEC-002) · ⚖️ PetInfo: evaluar (mismo caso → decisión mantener) |
| H-12 | `no-locale-format-in-render` | 1 | `QrCard.tsx:47` | 🔧 corregible |
| H-13 | `prefer-module-scope-static-value` | 1 | `api/admin/qr/route.ts:42` | 🔧 corregible |

**Resumen: 22 corregibles · 2 no-corregibles conocidos · 3 a verificar manualmente (H-06, H-09, H-11-PetInfo)**

#### 3.1.2 Origen de la degradación (por qué bajó de 88 → 69)

| Spec posterior | Hallazgos que introdujo |
| --- | --- |
| SPEC-005 (PDF multilink) | `async-await-in-loop` (CreateQrForm:143) + regresión `no-giant-component` (CreateQrForm 249 → 373 líneas, ListUrlForm 236 → 353) |
| SPEC-013 (paginación users) | `rerender-lazy-state-init` (users:49), `prefer-module-scope-pure-function` (users:93), `url-prefilled-privileged-action` (users:55), `only-export-components` (PaginationControls:18) |
| SPEC-015 (admin/qrs global) | `no-giant-component` (admin/qrs 410 líneas), `rerender-lazy-state-init` ×2 (:59,61), `prefer-module-scope-pure-function` (:75), `only-export-components` (QrsAdminTable:34) |
| SPEC-016 (foto pet-tag) | `no-giant-component` (PetTagActivateForm 396 líneas), `rerender-state-only-in-handlers` (:49), `no-create-object-url-without-revoke` (:88), `nextjs-no-img-element` (PetInfo:17) |
| SPEC-014 (perfil admin) | `no-locale-format-in-render` (QrCard:47 — fecha desactivación) |

> [!warning] Lección aprendida
> Los refactors de SPEC-004-B se degradaron en <1 semana por specs que tocaron los mismos componentes. **Mitigación**: esta spec documenta el score como métrica de calidad continua — conviene correr `npm run doctor` en cada cierre de spec (o en CI) para detectar regresiones temprano.

### 3.2 Hallazgos NO corregibles (heredados — NO tocar)

> [!important] Estos hallazgos ya fueron verificados en SPEC-004/004-B y NO se corrigen en esta spec
> | Hallazgo | Veredicto | Evidencia |
> | --- | --- | --- |
> | `prefer-dynamic-import` ×2 (StatsCharts.tsx:3,15) | ❌ **Falso positivo** | chart.js vive DENTRO de `StatsCharts.tsx`, pero el componente se carga lazy vía `next/dynamic` desde `page.tsx`. Verificado con `next build`: chart.js en chunk propio (170KB), no en entryJSFiles ni HTML estáticos (SPEC-004 §3.2/§3.3) |
> | `nextjs-no-img-element` (UrlList.tsx:307) | ✅ Real — **decisión: mantener** | Imagen dinámica del usuario (S3/R2) con URL firmada, `onError` fallback, `loading="lazy"`, `eslint-disable` documentado (SPEC-002). `next/image` no aporta con dominios dinámicos |
> | `no-derived-state` (useListUrlSync.ts:34) | ❌ **Falso positivo** (nuevo, introducido por el refactor T-017-07 — el doctor no lo detectaba dentro del componente gigante) | El effect de sync usa **guard de firma** (`JSON.stringify` en ref) — patrón deliberado del fix SPEC-005 (2026-08-11): `buildUrlList` crea un array NUEVO con el MISMO contenido en cada keystroke/click, así que comparar por referencia (patrón oficial "adjust state during render") re-sincronizaría y pisaría filas locales en progreso. El doctor no entiende el guard condicional. Alternativa oficial no aplica; forzarla rompería el fix SPEC-005 (producto principal) |

### 3.3 Hallazgos a verificar manualmente (antes de decidir)

| ID | Hallazgo | Análisis preliminar (2026-08-14) | Veredicto esperado |
| --- | --- | --- | --- |
| H-06 | `url-prefilled-privileged-action` (users/page.tsx:55) | `roleFilter` viene de la URL (patrón URL-fuente-de-verdad del proyecto). La página es **admin-only**: el API route `/api/users` valida con `adminGuardError` (SPEC-013 Bloque B, 401/403). El filtro solo afecta la vista, no la autorización — el backend nunca confía en la URL | ✅ **Aceptado con justificación** (verificado 2026-08-14: `adminGuardError` en `api/users/route.ts:27` — 401 sin sesión, 403 rol no-admin; `roleFilter` solo filtra la vista). Documentar, no corregir |
| H-09 | `no-create-object-url-without-revoke` (PetTagActivateForm.tsx:88) | El código **YA revoca**: cleanup en useEffect (líneas 54-59), al reemplazar (86) y al remover (92). El doctor no reconoce el patrón porque el cleanup depende de `petImagePreview` (valor capturado) | ✅ **Falso positivo confirmado** (T-017-05: el refactor eliminó el hallazgo sin cambiar el patrón de revoke — el doctor no lo reporta más) |
| H-11 | `nextjs-no-img-element` (PetInfo.tsx:17) | Foto de mascota desde S3/R2 (`petImageUrl` dinámica, URL firmada) — **mismo caso que UrlList** (decisión SPEC-002). Ya tiene `eslint-disable` + `loading="lazy"` | ✅ **Decisión: mantener** (verificado 2026-08-14: `eslint-disable-next-line @next/next/no-img-element` en PetInfo.tsx:16 + `loading="lazy"` — consistente con SPEC-002/004). Documentar, no corregir |

### 3.4 Plan de corrección por hallazgo (22 corregibles)

| ID | Regla | Fix propuesto | Esfuerzo |
| --- | --- | --- | --- |
| H-01 | `unused-export` ×3 | Eliminar `calculateTax` y `calculateTotal` de `activation.helpers.ts` (verificado: nadie los importa — CartSummary usa `calculateSubtotal`) y `calculateTax` de `pay.helpers.ts` (`calculateTotal` SÍ se usa en page.tsx:119,226 y PayCartSummary:46) | 🟢 trivial |
| H-13 | `prefer-module-scope-static-value` | Mover `allowed` (array de params) de `api/admin/qr/route.ts:42` a module scope | 🟢 trivial |
| H-03 | `rerender-lazy-state-init` ×3 | `useState(searchParams?.get('x') || '')` → `useState(() => searchParams?.get('x') || '')` en admin/qrs:59,61 y users:49 | 🟢 trivial |
| H-04 | `prefer-module-scope-pure-function` ×2 | Mover `cleanParams` a module scope en admin/qrs/page.tsx y users/page.tsx (función pura, sin deps) | 🟢 trivial |
| H-07 | `only-export-components` ×2 | Mover `isQrStatus` (QrsAdminTable.tsx:34) y `DEFAULT_ITEMS_PER_PAGE_OPTIONS` (PaginationControls.tsx:18) a archivo helpers (`.helpers.ts` o `lib/`) | 🟢 trivial |
| H-12 | `no-locale-format-in-render` | `toLocaleDateString('es-ES', ...)` en QrCard.tsx:47 → formatter module-scope (patrón ya usado en ActivationSuccess con `Intl.NumberFormat` module-scope, SPEC-004-B C-04) | 🟢 trivial |
| H-10 | `async-await-in-loop` | `for...of` con `await uploadListPdf` (CreateQrForm:143) → `Promise.allSettled` + toasts por fallo (comportamiento idéntico: cada fallo → toast warning, el QR queda creado sin ese PDF) | 🟡 medio |
| H-08 | `rerender-state-only-in-handlers` | `petImageFile` (PetTagActivateForm:49) solo se usa en handlers → mover a `useRef` | 🟢 trivial |
| H-09 | `no-create-object-url-without-revoke` | Verificar manualmente (§3.3). Si el doctor insiste: reestructurar con ref + revoke en cleanup | 🟢 trivial |
| H-02 | `no-giant-component` ×4 | Ver plan por componente en §3.5 | 🟠 refactor |

### 3.5 Plan de refactor por componente gigante (H-02)

> [!note] Recipe heredado
> Misma metodología que SPEC-004-B §4: baseline funcional → extraer lógica pura a module scope / helpers → estado a reducer/hooks → JSX a subcomponentes → validar (tsc/lint/build + navegador) → doctor. Reglas de oro: no cambiar timing de validación, strings de error idénticos, hijos no se tocan.

| ID | Componente | Líneas actuales | Origen | Plan de split | Objetivo |
| --- | --- | --- | --- | --- | --- |
| G-01 | `admin/qrs/page.tsx` | 410 | SPEC-015 | Tabla ya está en `QrsAdminTable` (externo). Extraer: header+filtros a `QrsAdminFilters`, diálogos (desactivar/eliminar) a `QrsAdminDialogs`, fetch a hook `useQrsAdmin` (URL fuente de verdad) | <300 |
| G-02 | `PetTagActivateForm.tsx` | 396 | SPEC-016 | Extraer validación a `PetTagActivateForm.helpers.ts` (validateField, isFormValid — timing onBlur/onChange como SignUpForm C-01) + campos a subcomponentes (Datos Dueño / Datos Mascota / Foto) | <300 |
| G-03 | `CreateQrForm.tsx` | 373 | regresión SPEC-005 | Extraer bloque de subida de PDFs (líneas ~140-153) a helper `uploadPendingPdfs` (o hook) + mover `pendingPdfFilesRef` | <300 |
| G-04 | `ListUrlForm.tsx` | 353 | regresión SPEC-005 | Ya tiene `ListUrlForm.helpers.ts` + `ListUrlRow`. Extraer: lógica de filas PDF (SPEC-005) a helpers + modal vCard ya externo | <300 |

> [!warning] ⚠️ G-03 y G-04 son los de mayor riesgo
> Son el **producto principal** (creación de QR multilink). Aplicar baseline funcional pre/post (patrón SPEC-004 §3.4) y validar en navegador. G-04 ya pasó por esto en SPEC-004-B C-02 — el refactor es incremental (solo lo que SPEC-005 agregó).

---

## 4. Diseño Técnico

### 4.1 Herramienta

- **react-doctor**: CLI de análisis de proyectos React (https://github.com/millionco/react-doctor). Se ejecuta con `npm run doctor` desde la raíz de `qr-app/` (script agregado en SPEC-004 T-004-02).

### 4.2 Flujo de trabajo (loop)

```
1. npm run doctor          → reporte
2. Clasificar hallazgos    → §3 (corregible / no-corregible con evidencia)
3. Corregir corregibles    → código + validación (tsc, lint, build)
4. ¿Quedan corregibles?    → sí: volver a 1 | no: estado final + cierre
```

### 4.3 Métrica de calidad continua (lección SPEC-004)

- Correr `npm run doctor` al cierre de cada spec que toque `qr-app/` y registrar el score en el changelog de la spec.
- Opcional futuro: agregar `doctor` a CI (workflow con `react-doctor` y umbral de score).

---

## 5. Trade-offs

| Decisión | Alternativa | Por qué |
| --- | --- | --- |
| NO corregir falsos positivos/decisiones heredados | Corregirlos "por si acaso" | Ya verificados con evidencia (next build, SPEC-002). Corregirlos sería trabajo inútil o regresión (ej. next/image con dominios dinámicos) |
| `Promise.allSettled` para subida de PDFs | Mantener `for...of` secuencial | Comportamiento idéntico (toasts por fallo), elimina el warning. El orden de subida no importa (PDFs independientes por itemId) |
| `url-prefilled-privileged-action` aceptado | Agregar confirmación/CSRF | El backend ya valida admin-only (adminGuardError). El patrón URL-fuente-de-verdad es intencional en el proyecto. Agregar confirmación degradaría UX sin ganancia de seguridad |
| PetInfo img mantenida (decisión) | Migrar a next/image | Mismo razonamiento que UrlList (SPEC-002): URL firmada dinámica, dominios no configurables estáticamente |

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registrar como tareas en `docs/tareas/SPEC-017-tareas.json` (formato Taskmaster-compatible).

| ID | Tarea | Estado |
| --- | --- | --- |
| T-017-01 | Crear rama `feat/spec-017-react-doctor-ronda-2` + baseline (Ejecución 1 documentada en §3.1) | ✅ done |
| T-017-02 | **Quick wins A**: `unused-export` ×3 (H-01) + `prefer-module-scope-static-value` (H-13) | ✅ done |
| T-017-03 | **Quick wins B**: `rerender-lazy-state-init` ×3 (H-03) + `prefer-module-scope-pure-function` ×2 (H-04) + `only-export-components` ×2 (H-07) | ✅ done |
| T-017-04 | **Fixes render**: `no-locale-format-in-render` QrCard (H-12) + verificación `no-create-object-url-without-revoke` (H-09) | ✅ done |
| T-017-05 | **PetTagActivateForm** (G-02): `rerender-state-only-in-handlers` (H-08) + `no-giant-component` 396 → <300 | ✅ done |
| T-017-06 | **CreateQrForm** (G-03): `async-await-in-loop` (H-10) + `no-giant-component` 373 → <300 | ✅ done |
| T-017-07 | **ListUrlForm** (G-04): `no-giant-component` 353 → <300 | ✅ done |
| T-017-08 | **admin/qrs/page.tsx** (G-01): `no-giant-component` 410 → <300 | ✅ done |
| T-017-09 | **Verificaciones manuales**: `url-prefilled-privileged-action` (H-06) + PetInfo img (H-11) → documentar veredictos en §3.3 | ✅ done |
| T-017-10 | Validación final: tsc, lint, build + re-ejecución doctor + cierre de spec | ✅ done |

> [!note] Orden sugerido
> Quick wins primero (T-017-02/03/04 — suben score rápido y bajo riesgo), luego refactors por riesgo creciente: G-02 → G-03 → G-04 → G-01. G-03/G-04 (producto principal) con baseline funcional pre/post.

---

## 7. Testing

- `npx tsc --noEmit` — sin errores de tipos (tras cada corrección).
- `npm run lint` — sin errores.
- `npm run build` — build de producción exitoso.
- `npm run doctor` — reporte final documentado (CA-01: 0 `no-giant-component` + 0 `unused-export`).
- Baseline funcional en navegador para G-03/G-04 (creación de QR multilink con PDFs) y G-02 (activación pet-tag con foto).

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Refactor G-03/G-04 rompe creación de QR (producto principal) | Media | Alto | Baseline funcional pre/post (patrón SPEC-004 §3.4); validación navegador; cambios incrementales |
| Correcciones rompen funcionalidad existente | Media | Alto | Validar tsc/lint/build tras cada corrección; cambios pequeños |
| react-doctor reporta falsos positivos | Media | Bajo | Verificar cada hallazgo manualmente antes de corregir (patrón SPEC-004 §3.3) |
| Nuevos hallazgos al refactorizar (reglas nuevas) | Media | Bajo | Resolver en el mismo commit (lección C-01 SPEC-004-B: `only-export-components`, `context-provider-value`) |
| Score no alcanza objetivo proyectado | Baja | Bajo | Documentar estado real; el objetivo es 0 corregibles, no un número exacto |

---

## 9. Observabilidad

- Cada ejecución de `npm run doctor` se registra en §3 con fecha.
- Cada componente completado se registra en §3.5 y §11 (changelog).
- Estado de la spec se actualiza a `implementado` al cumplir todos los CA (§2.2).

---

## 10. Referencias

- [[SPEC-004-react-doctor-qr-app]] — padre metodológico (baseline §3.4, matriz UI §3.4.2, falsos positivos §3.2/§3.3).
- [[SPEC-004-B-no-giant-component-qr-app]] — recipe de refactor por componente (§4).
- [[SPEC-002-qr-multilink-imagen]] — decisión `nextjs-no-img-element` (UrlList).
- [[SPEC-005-pdf-multilink]], [[SPEC-013-paginacion-users-admin]], [[SPEC-015-vista-admin-qrs-global]], [[SPEC-016-imagen-mascota-pet-tag]] — specs que introdujeron la degradación.
- react-doctor: https://github.com/millionco/react-doctor

---

## 11. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-14 | Equipo | Borrador inicial. Ejecución 1 de react-doctor documentada (§3.1): score 69/100, 24 issues (12 maintainability, 8 performance, 1 security, 3 bugs). Clasificación: 22 corregibles, 2 no-corregibles heredados (falso positivo chart.js + decisión UrlList), 3 a verificar (url-prefilled, createObjectURL, PetInfo img). Origen de degradación mapeado a SPEC-005/013/015/016 (§3.1.2). Plan de corrección por hallazgo (§3.4) + plan de refactor por componente gigante (§3.5). Tareas T-017-01..10 en `docs/tareas/SPEC-017-tareas.json` |
| 2026-08-14 | Equipo | Implementación completa (T-017-01..10 done). Ejecución final de react-doctor: **score 74/100, 7 issues** — **0 `no-giant-component`** y **0 `unused-export`** (CA-01 ✅). Todos los 22 corregibles resueltos. Quedan 7 no-corregibles con evidencia: `prefer-dynamic-import` ×2 (falso positivo chart.js, §3.2), `nextjs-no-img-element` ×3 (decisión SPEC-002/016: PetTagPhotoField:39, PetInfo:17, UrlList:307), `url-prefilled-privileged-action` ×1 (aceptado con justificación, §3.3 H-06), `no-derived-state` ×1 (falso positivo nuevo del refactor T-017-07 — guard de firma SPEC-005, §3.2). Veredictos manuales confirmados en §3.3 (H-06 aceptado, H-09 falso positivo, H-11 mantener). Commits: 4960fcf, 1b9c6d4, 00d7218, 74194e9, 9bbdac8, 4aeb65b, c4fab9a |