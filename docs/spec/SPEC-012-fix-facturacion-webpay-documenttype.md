---
title: "SPEC-012: Fix facturación Webpay — unificar documentType/selectedDocumentType en qr/pay"
date: 2026-08-09
tags:
  - spec
  - bugfix
  - frontend
  - webpay
  - facturacion
status: implementado
aliases:
  - SPEC-012
  - fix documentType webpay
---

# SPEC-012: Fix facturación Webpay — unificar `documentType`/`selectedDocumentType` en qr/pay

> [!abstract] Decisión clave
> Corregir el **bug preexistente documentado en SPEC-004-B §4.7 (C08-B-03) y ADR-004-04 (Bug 3)**: en el checkout Webpay (`/dashboard/qr/pay`), el select de "Tipo de Documento" actualiza `selectedDocumentType`, pero el render de los campos de factura y la validación leen `documentType` (estado separado que **nunca se actualiza** — siempre `BOLETA`). Resultado: al elegir "Factura" **no aparecen los campos** (RUT/Razón Social/Dirección/Giro) y el pago procede **sin datos de factura**.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-09
> - **Componente destino:** `desarrollo-qr/qr-app/src/app/dashboard/qr/pay/`
> - **Rama:** `feat/spec-012-fix-documenttype-webpay`
> - **Origen:** [[SPEC-004-B-no-giant-component-qr-app]] §4.7 (C08-B-03) · [[ADR-004-04-errores-conocidos-gotchas]] (Bug 3)

---

## 1. Objetivo

Unificar los dos estados de tipo de documento en el checkout Webpay para que:
1. Al seleccionar **Factura** aparezcan los campos de facturación (RUT, Razón Social, Dirección, Giro).
2. La validación de campos requeridos se active con Factura (botón bloqueado hasta completar).
3. El payload `QrActivate` incluya `invoiceData` cuando `documentType === FACTURA`.
4. Sin cambios en el flujo Boleta (que no requiere datos de factura).

### 1.1 Out of scope

- Cambios en backend (el payload ya soporta `invoiceData`).
- Cambios en el flujo Webpay (transacción, redirect).
- Otros bugs de qr/pay.

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1**. Eliminar el estado duplicado: un solo `documentType` (inicial `undefined` o `BOLETA` según decisión) que el select actualice directamente.
- **RF-2**. Al seleccionar "Factura": mostrar los campos RUT/Razón Social/Dirección/Giro (gating por `documentType === FACTURA`).
- **RF-3**. Validación: con Factura, `validateInvoiceData` exige los 4 campos (mensajes: "El RUT es requerido", "La dirección es requerida", "El giro es requerido", "La razón social es requerida").
- **RF-4**. Gating del botón "Proceder al Pago": disabled si `loading || !documentType || errors > 0`.
- **RF-5**. Payload: `invoiceData` incluido solo si `documentType === FACTURA`.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: Seleccionar "Factura" muestra los 4 campos de facturación.
- **CA-02**: Con Factura y campos vacíos, el botón "Proceder al Pago" está disabled y el submit muestra toast de error.
- **CA-03**: Con Factura y campos completos, el botón se habilita y el payload incluye `invoiceData`.
- **CA-04**: Boleta no muestra campos y el pago procede sin `invoiceData`.
- **CA-05**: `tsc --noEmit`, `lint`, `build` pasan.
- **CA-06**: E2E `activate-webpay.spec.ts` sigue verde.

---

## 3. Baseline del bug (verificado 2026-08-09)

| Paso | Comportamiento actual (bug) | Comportamiento esperado |
| --- | --- | --- |
| Seleccionar "Factura" | ❌ No aparecen campos de factura | ✅ Aparecen RUT/Razón Social/Dirección/Giro |
| Factura + campos vacíos | ❌ Botón habilitado (validación no corre) | ✅ Botón disabled + toast "Por favor completa todos los campos requeridos para la factura" |
| Factura + campos completos | ❌ Payload sin `invoiceData` | ✅ Payload con `invoiceData` |
| Boleta | ✅ Sin campos, pago procede | ✅ Igual (sin cambios) |

---

## 4. Diseño Técnico

### 4.1 Fix (unificar estados)

En `src/app/dashboard/qr/pay/page.tsx`:

```tsx
// ANTES (bug): dos estados desconectados
const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.BOLETA);
const [selectedDocumentType, setSelectedDocumentType] = useState<DocumentType | undefined>(undefined);

// DESPUÉS (fix): un solo estado, el select lo actualiza
const [documentType, setDocumentType] = useState<DocumentType | undefined>(undefined);
```

Y en el `CustomSelect`:
```tsx
onValueChange={(value) => {
  setDocumentType(toDocumentType(value));   // ← ya no setea selectedDocumentType
  setTouched(prev => ({ ...prev, documentType: true }));
}}
```

El render de `PayInvoiceFields` y la validación **ya leen `documentType`** → funcionan sin más cambios. El gating del botón pasa de `!selectedDocumentType` a `!documentType`.

> [!note] Decisión de estado inicial
> `documentType` inicia en `undefined` (no pre-seleccionado) para mantener el comportamiento actual del botón (disabled hasta elegir tipo) y el borde rojo de "Este campo es requerido" al tocar sin seleccionar. La UI del select no cambia (placeholder "Seleccione un tipo de documento").

### 4.2 Archivos tocados

| Archivo | Cambio |
| --- | --- |
| `src/app/dashboard/qr/pay/page.tsx` | Eliminar `selectedDocumentType`; usar `documentType` en select + gating |
| `src/app/dashboard/qr/pay/PayInvoiceFields.tsx` | Sin cambios (ya gated por `documentType`) |
| `src/app/dashboard/qr/pay/pay.helpers.ts` | Sin cambios (ya recibe `documentType`) |

---

## 5. Testing

- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores.
- `npm run build` — build exitoso.
- Navegador: verificar CA-01 a CA-04 en `/dashboard/qr/pay` (con item en carrito).
- E2E: `npx playwright test tests/qr/activate-webpay.spec.ts` — verde (y suite completa si el tiempo lo permite).
- `npm run doctor` — sin regresiones (88/100 · 3 issues).

---

## 6. Plan de implementación (tareas)

> [!todo] Taskmaster
> Registradas en `docs/tarea/SPEC-012-tareas.json`.

| ID | Tarea | Estado |
| --- | --- | --- |
| T-012-01 | Rama `feat/spec-012-fix-documenttype-webpay` en qr-app | ✅ done |
| T-012-02 | Fix: unificar documentType en page.tsx (eliminar selectedDocumentType) | ✅ done (commit `97212f2`) |
| T-012-03 | Validación: tsc, lint, build + navegador (CA-01..04) | ✅ done (tsc/lint/build ✅ + E2E) |
| T-012-04 | E2E activate-webpay + doctor sin regresiones | ✅ done (4/4 nuevos + suite 41 passed, 1 flaky preexistente; doctor 88/100) |
| T-012-05 | Spec a implementado + changelog + Taskmaster done + merge a main | ✅ done |

---

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Cambiar el flujo de pago rompe algo | Baja | Alto | E2E activate-webpay + verificación manual CA-01..04 |
| El select pierde el valor preseleccionado | Baja | Bajo | El estado inicial `undefined` preserva el comportamiento actual (botón disabled hasta elegir) |
| Payload cambia para Boleta | Baja | Medio | Boleta sigue sin `invoiceData` (RF-5); verificar en E2E |

---

## 8. Observabilidad

- Fix documentado en changelog §10 y en [[ADR-004-04-errores-conocidos-gotchas]] (Bug 3 → corregido).
- Estado de la spec a `implementado` al cumplir todos los CA.

---

## 9. Referencias

- [[SPEC-004-B-no-giant-component-qr-app]] — §4.7 C08-B-03 (origen del bug)
- [[ADR-004-04-errores-conocidos-gotchas]] — Bug 3 documentado
- [[SPEC-005-pdf-multilink]] — relacionada (QR multilink)

---

## 10. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-09 | Equipo | Borrador inicial: bug documentType/selectedDocumentType (facturación Webpay nunca pide datos), RF/CA, diseño de fix (unificar estados), tareas T-012-01..05 |
| 2026-08-09 | Equipo | **IMPLEMENTADA**: fix unifica estados (commit `97212f2`), guard de tipo documento en handlePayment, PayInvoiceFields acepta undefined. **E2E 4/4 verde** (CA-01..04, `facturacion-webpay.spec.ts`) + suite 41 passed (1 flaky preexistente scan-stats). Doctor 88/100 sin regresiones. Tests e2e commit `782c765` |
