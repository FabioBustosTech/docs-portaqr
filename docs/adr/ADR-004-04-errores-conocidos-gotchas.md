---
title: "ADR-004-04: Errores conocidos y gotchas descubiertos en SPEC-004/004-B"
date: 2026-08-09
tags:
  - adr
  - errores-conocidos
  - frontend
  - react-doctor
  - gotchas
  - spec-004
estado: accepted
---

# ADR-004-04: Errores conocidos y gotchas descubiertos en SPEC-004/004-B

**Fecha**: 2026-08-09
**Estado**: accepted

## Contexto

Durante la auditoría con react-doctor y los refactors de SPEC-004 + SPEC-004-B se descubrieron **bugs preexistentes** (no regresiones) y **gotchas de herramienta/proceso** que conviene registrar para no repetir diagnósticos. Algunos quedaron corregidos, otros documentados como deuda consciente.

## Errores conocidos (bugs preexistentes)

### Bug 1: `https://` (protocolo solo) habilitaba "Crear QR" en Multi links — CORREGIDO
- **Síntoma**: al seleccionar "Sitio Web" el campo se autopopula con `https://` y eso contaba como URL válida (`item.url && item.typeUrl` con string truthy).
- **Causa**: validación sin verificar contenido real tras el protocolo.
- **Fix**: `hasUsableUrlContent(url)` — `url.replace(/^https?:\/\//, '').trim().length > 0` — en `isValidForm` y `validateDataForSubmit` (CreateQrForm.helpers.ts). Verificado: `https://` → disabled; con dominio → enabled.
- **Referencia**: commit `f2b34ed`, SPEC-004-B §4.2 C02-B-03.

### Bug 2: Wrapper del Select con `w-full` partía el ancho del input en `md:flex-row` — CORREGIDO
- **Síntoma**: el input de URL de la fila multilink se veía corto (298px de 727 disponibles).
- **Causa**: `ui/select.tsx` envuelve en `relative inline-block w-full`; en flex-row competía con el contenedor del input (ambos 100% → ~50/50).
- **Fix**: `<Select className="w-full md:w-[200px] md:shrink-0">` + contenedor input `flex w-full flex-1 gap-2`.
- **Referencia**: commit `95201c0`, SPEC-004-B §5.3 warning.

### Bug 3: `documentType` y `selectedDocumentType` desconectados en qr/pay — NO CORREGIDO (deuda)
- **Síntoma**: al elegir "Factura" en el checkout no aparecen los campos RUT/Razón Social/Dirección/Giro y el botón "Proceder al Pago" se habilita sin validar la factura.
- **Causa**: el render y `validateInvoiceData` usan `documentType` (useState default `BOLETA`, **nunca se actualiza**); el select setea `selectedDocumentType` (estado separado).
- **Impacto**: la facturación por Webpay nunca pide datos de factura; la validación siempre pasa. Riesgo funcional si el backend exige `invoiceData` con FACTURA.
- **Estado**: documentado en SPEC-004-B §4.7 C08-B-03 — **pendiente de corrección** (separar o unificar los dos estados).

### Bug 4: Preview de edición con wrapper `bg-white` fijo — CORREGIDO
- **Síntoma**: en modo oscuro, la preview del QR en `/dashboard/qr/edit/[id]` mostraba un bloque blanco.
- **Causa**: `<div className="... p-4 bg-white rounded-lg">` sin variante dark alrededor del `QrDisplay`.
- **Fix**: quitar `bg-white` del wrapper (el lienzo del QR dentro de QrDisplay se mantiene blanco, es necesario).
- **Referencia**: commit `4de2c7a`.

## Gotchas de herramienta/proceso

### Gotcha 1: react-doctor cambia la regla reportada tras el refactor
Al extraer un componente gigante, el doctor puede dejar de marcar `no-giant-component` y empezar a marcar **`prefer-useReducer`** (los useState del orquestador quedan expuestos). **Revisar el reporte completo tras cada refactor**, no solo la regla objetivo. Ocurrió en qr/edit (C-07 → deuda → resuelta en commit `61d97e7`).

### Gotcha 2: react-doctor detecta código muerto al exportarlo
`ensureUrlFormat` y `toDocumentTypeString` eran código muerto en el componente; al moverlos a helpers exportados, el doctor los marcó `unused-export`. **Limpiar exports sin uso al mover código**.

### Gotcha 3: `ConvertTo-Json | Set-Content -Encoding UTF8` en PowerShell 5.1 corrompe acentos (mojibake)
Usar la herramienta de escritura del agente (UTF-8 correcto) para archivos JSON con tildes. Ocurrió en `SPEC-004-tareas.json` (corregido).

### Gotcha 4: la regla `no-locale-format-in-render` marca CADA `toLocaleString`/`toLocaleDateString` en render
Resolver con formatters deterministas module-scope: `Intl.NumberFormat('es-CL')` para precios y `utils/date.ts formatDate` (locale + timeZone fijos) para fechas.

### Gotcha 5: `no-giant-component` no mide solo líneas del archivo
286 líneas seguían marcando (qr/edit); 175 con `EditQrForm` extraído ya no. El doctor pondera complejidad/hooks, no solo longitud. **No asumir que <300 líneas garantiza pasar la regla**.

## Consecuencias

### Positivas
- 3 de 4 bugs corregidos y verificados; el bug 3 documentado con causa raíz y ruta de corrección.
- Gotchas guardados en memoria persistente (Engram) para futuras sesiones.

### Negativas
- El Bug 3 (facturación Webpay) permanece como deuda funcional — **priorizar su corrección** antes de producción si se usan facturas.

### Riesgos
- Bug 3: si el backend valida `invoiceData` obligatorio con `documentType === FACTURA`, el pago podría fallar en backend o persistir activaciones sin datos de factura. Mitigación: corregir unificando `documentType`/`selectedDocumentType`.

## Referencias

- [[SPEC-004-react-doctor-qr-app]] — auditoría y decisiones
- [[SPEC-004-B-no-giant-component-qr-app]] — §4.2 (C02-B-03), §4.7 (C08-B-03), §5.3, §5.8
