---
title: "SPEC-021: Fecha de vencimiento en la tabla admin de QRs"
date: 2026-08-17
tags:
  - spec
  - frontend
  - backend
  - admin
  - qr
status: implementado
aliases:
  - SPEC-021
  - fecha vencimiento tabla admin qrs
---

# SPEC-021: Fecha de vencimiento en la tabla admin de QRs

> [!abstract] Decisión clave
> El admin necesita ver la **fecha de vencimiento** de cada QR en la tabla global de `/dashboard/admin/qrs` (SPEC-015). **El backend ya expone `expiration` en cada item** del `GET /qr` admin (schema → mapper → aggregate → API route Next → interfaz `QrResponse`), por lo que **NO requiere cambios de backend**. El trabajo es **solo frontend**: agregar la columna **"Vencimiento"** a `QrsAdminTable.tsx` mostrando `formatDate(qr.expiration)` (formato es-ES dd/mm/aaaa), con **"No expira"** cuando el QR no tiene fecha, y **resaltado visual (rojo)** cuando la fecha ya pasó (QR vencido) para que el admin identifique de un vistazo los QRs vencidos.

> [!info] Metadatos
> - **Estado:** Implementado
> - **Fecha:** 2026-08-17
> - **Componente destino:** `desarrollo-qr/qr-app/` (componente `QrsAdminTable.tsx` + tests de la página). **Sin cambios en `backend-portaqr`** (el campo `expiration` ya viaja en la respuesta).
> - **Rama:** `feat/spec-021-fecha-vencimiento-tabla-admin-qrs`
> - **Origen:** Requerimiento del usuario (2026-08-17): "quiero que en la tabla me aparezca la fecha de vencimiento" en `https://portaqr.cl/dashboard/admin/qrs`. Relacionada con [[SPEC-015]] (vista admin global de QRs), [[SPEC-014]] (desactivación admin), [[SPEC-013]] (paginación users).

---

## 1. Objetivo

1. Que la tabla de la vista admin global de QRs (`/dashboard/admin/qrs`) muestre la **fecha de vencimiento** de cada QR en una columna dedicada.
2. Que los QRs **sin fecha de vencimiento** se muestren con el texto **"No expira"** (consistente con `QrCard.tsx`).
3. Que los QRs **vencidos** (fecha de vencimiento anterior a hoy) se **resalten visualmente** para que el admin los identifique de un vistazo.
4. **Sin cambios de backend**: el campo `expiration` ya está disponible en la respuesta del `GET /qr` admin (verificado en el baseline).

### 1.1 Out of scope

- **NO** se modifica el backend (`backend-portaqr`): schema, mapper, aggregate, DTOs, controller — el campo `expiration` ya se expone tal cual.
- **NO** se modifica la API route Next `/api/admin/qr` ni el servicio `qrService.getAllQrsPaginated` — ya propagan `expiration` sin transformación.
- **NO** se cambia la lógica de estado (activo/inactivo) ni el filtro por estado de SPEC-015.
- **NO** se agrega un filtro por vencimiento (fuera de alcance; se puede evaluar en una SPEC futura).
- **NO** se toca `bff-service` (deprecado, SPEC-001).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Frontend (`qr-app`)**

- **RF-1 (columna Vencimiento)**. En `src/components/admin/QrsAdminTable.tsx` agregar una columna **"Vencimiento"** en el header de la tabla y su celda correspondiente por fila. Posición recomendada: **después de "Estado"** y antes de "Contenido" (agrupa los datos de ciclo de vida del QR: estado + vencimiento).
- **RF-2 (formato de fecha)**. La celda muestra `formatDate(qr.expiration)` (helper existente en `src/lib/format.ts`, formato es-ES `dd/mm/aaaa`). Si `qr.expiration` es `undefined`/`null`/inválido → mostrar **"No expira"** (mismo criterio que `QrCard.tsx` L99).
- **RF-3 (resaltado de vencidos)**. Si `qr.expiration` existe y es **anterior a la fecha actual** (`new Date(qr.expiration) < new Date()`), la fecha se muestra en **rojo** (ej. `text-red-600`) con un tooltip/título "Vencido" para señalarlo visualmente. Los QRs no vencidos se muestran en el color de texto normal.
- **RF-4 (sin cambios de datos)**. No se altera el contrato de datos: `QrResponseAdmin` ya incluye `expiration: Date` (heredado de `QrResponse`, `src/interfaces/qr.ts` L190). No se toca la API route ni el servicio.

### 2.2 Reglas de negocio

- **RN-1**. La fecha de vencimiento es un dato **admin-only** (la vista completa ya es admin-only por SPEC-015; no se expone en vistas públicas).
- **RN-2**. Un QR **sin `expiration`** se muestra como **"No expira"** — no se asume una fecha por defecto (el schema permite `expiration` opcional, `qr.schema.ts` L92).
- **RN-3**. El resaltado de "vencido" es **puramente visual** (client-side) y no cambia el estado del QR ni su comportamiento. El estado real (activo/inactivo) lo sigue determinando `isQrStatus` (SPEC-015).
- **RN-4**. La comparación de vencimiento se hace contra la fecha actual del navegador (`new Date()`), consistente con el resto del frontend.

### 2.3 Criterios de aceptación (CA)

- **CA-01**: `/dashboard/admin/qrs` muestra la columna **"Vencimiento"** en el header de la tabla.
- **CA-02**: cada fila muestra la fecha de vencimiento formateada `dd/mm/aaaa` (ej. `17/08/2026`) cuando el QR tiene `expiration`.
- **CA-03**: un QR sin `expiration` muestra **"No expira"** en la celda.
- **CA-04**: un QR con `expiration` anterior a hoy muestra la fecha **en rojo** (resaltado de vencido); un QR con fecha futura la muestra en color normal.
- **CA-05**: `tsc --noEmit`, `lint`, `build` y la suite de tests de `qr-app` verdes (incluye los tests de `page.spec.tsx` de la vista admin, que se amplían con los casos de vencimiento). Sin regresión en SPEC-015/013/014.

---

## 3. Baseline del problema (verificado 2026-08-17)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| Campo `expiration` en schema QR | ✅ Existe (`qr.schema.ts` L92, `expiration?: Date`, indexado L334) | Sin cambios |
| `expiration` en el mapper | ✅ `QrMongoMapper.toEntity` lo expone (`qr-mongo.mapper.ts` L21) | Sin cambios |
| `expiration` en el aggregate admin | ✅ `findAllWithSearch` usa `toEntity` → `expiration` viaja en cada item (`mongo-qr.repository.ts` L169) | Sin cambios |
| `expiration` en API route Next | ✅ `GET /api/admin/qr` pasa `items: data.data` tal cual (`route.ts` L65) | Sin cambios |
| `expiration` en la interfaz frontend | ✅ `QrResponse.expiration: Date` (`src/interfaces/qr.ts` L190) | Sin cambios |
| Columna Vencimiento en la tabla | ❌ No existe — columnas actuales: QR \| Usuario dueño \| Estado \| Contenido \| Actualizado \| Acciones | ✅ Nueva columna "Vencimiento" |
| Formato de fecha | ✅ `formatDate` en `src/lib/format.ts` (es-ES dd/mm/aaaa) | Reutilizar |
| Patrón "No expira" | ✅ `QrCard.tsx` L99: `qr.expiration ? formatDate(...) : 'No expira'` | Reutilizar criterio |
| Resaltado de vencidos | ❌ No existe | ✅ Fecha en rojo si `expiration < hoy` |

### 3.1 Hallazgos de la investigación (2026-08-17)

1. **El backend ya entrega `expiration` sin cambios**: el campo existe en el schema (`qr.schema.ts` L92), el mapper lo expone (`qr-mongo.mapper.ts` L21), el aggregate `findAllWithSearch` mapea cada doc con `QrMongoMapper.toEntity` (`mongo-qr.repository.ts` L169), la API route Next `/api/admin/qr` propaga `items: data.data` sin transformación (`route.ts` L65) y la interfaz `QrResponse` ya lo tipa (`src/interfaces/qr.ts` L190). **No hay trabajo de backend.**
2. **La tabla actual no muestra la fecha**: `QrsAdminTable.tsx` tiene 6 columnas (QR, Usuario dueño, Estado, Contenido, Actualizado, Acciones) y ninguna usa `qr.expiration`.
3. **Existe un patrón de referencia**: `QrCard.tsx` L99 muestra `Expira: {formatDate(qr.expiration)}` o `'No expira'` — se reutiliza el mismo criterio de texto y el mismo helper `formatDate`.
4. **Los tests de la vista viven en `page.spec.tsx`** (`src/app/dashboard/admin/qrs/page.spec.tsx`): 11 tests de la página (montaje, URL como fuente de verdad, filtro userId, tabla, usuario eliminado, desactivación, eliminación). Se amplían con casos de la columna Vencimiento.
5. **No hay helper de "vencido"** en el frontend: `isQrActive` (`QrGrid.helpers.ts` L21) solo mira `active`/`status`, no `expiration`. La lógica de vencido es nueva y se implementa inline en la celda (o como helper puro si se prefiere testearlo aislado).

---

## 4. Diseño Técnico

### 4.1 Flujo de datos

```
GET /api/admin/qr (Next, admin-only)          [SIN CAMBIOS]
  └─ GET /qr (monolito, @Roles('admin'))      [SIN CAMBIOS — ya incluye expiration]
       └─ aggregate $lookup users + $facet → toEntity → { ..., expiration }
            └─ items: [{ ..., expiration: "2026-08-17T00:00:00.000Z" }]

QrsAdminTable.tsx                              [CAMBIO]
  └─ Nueva columna "Vencimiento"
       └─ qr.expiration ? formatDate(qr.expiration) : 'No expira'
            └─ si new Date(qr.expiration) < new Date() → texto rojo + title "Vencido"
```

### 4.2 Archivos por capa

**Frontend (`qr-app`):**

| Archivo | Cambio |
| --- | --- |
| `src/components/admin/QrsAdminTable.tsx` | Agregar `<TableHead>Vencimiento</TableHead>` (después de Estado) + `<TableCell>` con la fecha formateada, "No expira" o resaltado rojo de vencido (RF-1..3) |
| `src/app/dashboard/admin/qrs/page.spec.tsx` | Ampliar tests: columna Vencimiento visible, fecha formateada, "No expira", resaltado de vencido (CA-02..04) |
| (opcional) `src/components/admin/QrsAdminTable.helpers.ts` | Si se prefiere lógica pura testeable: helper `getExpirationDisplay(qr)` / `isQrExpired(qr)` (patrón T-017-03, only-export-components) |

**Backend (`backend-portaqr`):** sin cambios.

### 4.3 Seguridad

| Aspecto | Mitigación |
| --- | --- |
| Sin fuga de datos | La fecha de vencimiento ya se expone solo en la vista admin (SPEC-015, doble capa `@Roles('admin')` + `adminGuardError`) |
| Sin cambios de contrato | No se toca el backend ni la API route — solo renderizado client-side |
| Fecha inválida | `formatDate` ya devuelve "Fecha inválida" para fechas no parseables (`src/lib/format.ts` L19) |

---

## 5. Trade-offs

| Decisión | Alternativa | Motivo |
| --- | --- | --- |
| **Solo frontend** (columna en `QrsAdminTable.tsx`) | Cambiar backend para "enriquecer" la respuesta | El backend ya entrega `expiration`; cualquier cambio sería redundante y añadiría riesgo sin beneficio. |
| **Columna dedicada "Vencimiento"** | Incrustar la fecha en la columna "Estado" o "Contenido" | Una columna dedicada es más escaneable y consistente con el resto de la tabla; incrustarla en Estado mezclaría conceptos. |
| **Posición tras "Estado"** | Tras "Contenido" o al final | Agrupa ciclo de vida (estado + vencimiento); el admin lee estado y vencimiento juntos. |
| **Resaltado rojo de vencidos** | Mostrar solo la fecha sin color | El valor agregado es identificar vencidos de un vistazo; el color es el mecanismo más barato y no cambia el estado real. |
| **Lógica inline en la celda** | Helper puro `isQrExpired` en `.helpers.ts` | Para un solo uso, inline es suficiente; si se reutiliza (ej. filtro futuro), se extrae a helper. |

---

## 6. Plan de implementación

1. **Tarea 1** — Rama `feat/spec-021-fecha-vencimiento-tabla-admin-qrs` en `qr-app`.
2. **Tarea 2 (frontend UI)** — Agregar columna "Vencimiento" a `QrsAdminTable.tsx`: header + celda con `formatDate(qr.expiration)`, "No expira" si no hay fecha, y resaltado rojo + tooltip "Vencido" si `expiration < hoy`. (RF-1..3).
3. **Tarea 3 (tests)** — Ampliar `page.spec.tsx` con: columna visible, fecha formateada, "No expira", resaltado de vencido. (CA-02..04).
4. **Tarea 4 (validación)** — `tsc --noEmit`, `lint`, `build` y suite de tests de `qr-app` verdes. Sin regresión en SPEC-015/013/014. Verificación en navegador: tabla con fechas, "No expira" y vencidos en rojo.
5. **Tarea 5 (cierre)** — SPEC a `implementado`, tareas done, commits y merge.

---

## 7. Riesgos y notas

- **Riesgo bajo**: el cambio es aditivo (una columna nueva) sobre un componente ya testeado. La suite de `page.spec.tsx` protege contra regresión.
- **Datos sin `expiration`**: muchos QRs pueden no tener fecha (campo opcional) — el caso "No expira" debe cubrirse bien para no mostrar fechas vacías o "Fecha inválida".
- **Zona horaria**: la comparación `new Date(qr.expiration) < new Date()` usa la hora local del navegador; para fechas a medianoche UTC puede haber desfase de ±1 día. Aceptable para una señal visual; si se requiere precisión, comparar contra el inicio del día local.
- **Reinicio de contenedores**: al modificar archivos existentes no aplica, pero si se crean archivos nuevos (helper), recordar que el watcher Docker+OneDrive no detecta carpetas nuevas (lección SPEC-015) — reiniciar `qr-app` si hace falta.
- **E2E**: opcional — el cambio es visual; los tests unitarios de la página cubren el comportamiento. Si se agrega E2E, extender `tests/admin/qrs-admin-vista.spec.ts` (repo `e2e-tests-portaqr`).

---

## 8. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-08-17 | **SPEC creada v1 (borrador)**: fecha de vencimiento en la tabla admin de QRs. Investigación del baseline: el backend ya expone `expiration` completo (schema → mapper → aggregate → API route → interfaz), por lo que el cambio es **solo frontend** — agregar la columna "Vencimiento" a `QrsAdminTable.tsx` con formato es-ES, "No expira" cuando no hay fecha y resaltado rojo de vencidos. |
| 2026-08-17 | **Implementada**: rama `feat/spec-021-fecha-vencimiento-tabla-admin-qrs` en qr-app. Columna "Vencimiento" en `QrsAdminTable.tsx` (header tras Estado + celda con `formatDate(qr.expiration)`, "No expira" si no hay fecha, rojo + tooltip "Vencido" si `expiration < hoy`). 4 tests nuevos en `page.spec.tsx` (columna visible, fecha formateada, No expira, vencido en rojo). Suite completa 144/144 verdes, `tsc --noEmit` y eslint OK. Commit `ee2c96a`. Sin cambios de backend. |
