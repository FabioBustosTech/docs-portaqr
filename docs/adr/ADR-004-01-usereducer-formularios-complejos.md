---
title: "ADR-004-01: useReducer para formularios complejos en qr-app"
date: 2026-08-09
tags:
  - adr
  - arquitectura
  - frontend
  - react
  - usereducer
  - spec-004
estado: accepted
---

# ADR-004-01: useReducer para formularios complejos en qr-app

**Fecha**: 2026-08-09
**Estado**: accepted

## Contexto

`react-doctor` marcaba `prefer-useReducer` y `rerender-lazy-state-init` en formularios con muchos campos relacionados (`CreateQrForm` con 19+ `useState`, `SignUpForm` con 9, `qr/edit` con 14). Además, `useState(uuidv4())` regeneraba el ID de preview en cada render. Los formularios comparten un patrón: N campos + validación + submit → conviene un estado único con transiciones explícitas.

## Decisión

Migrar el estado de los formularios complejos a **`useReducer`** con un archivo dedicado `<Form>.state.ts` que expone:
- `createInitialState()` — inicializador usado como lazy init de `useReducer(reducer, undefined, createInitialState)` (genera IDs UNA vez por montaje).
- Actions explícitas: `SET_FIELD` (campos simples), `SET_QR_TYPE`/`SET_VCARD` (objetos complejos), `SET_ERROR`, `SET_INITIAL` (carga desde API), `RESET` (vuelve a `createInitialState()`).
- Valores vacíos de objetos complejos (`EMPTY_VCARD_DATA`, `EMPTY_PET_DATA`) en **module scope** (no se recrean por render).

Aplicado en: `CreateQrForm.state.ts`, `SignUpForm/state.ts`, `editQrForm.state.ts`.

## Alternativas Consideradas

### Alternativa 1: Mantener múltiples useState
- **Pros**: sin cambios, familiar
- **Contras**: `prefer-useReducer` persiste; IDs regenerados por render; difícil reset atómico
- **Por qué no**: react-doctor lo marca y el reset parcial es propenso a olvidar campos

### Alternativa 2: Formik / React Hook Form
- **Pros**: validación y estado "resueltos" por librería
- **Contras**: dependencia nueva; refactor mayor del contrato de props; los subformularios ya reciben setters individuales
- **Por qué no**: el equipo ya tiene el patrón reducer en el proyecto; librería no aporta para estos formularios

### Alternativa 3: useReducer con actions por campo (elegida)
- **Pros**: resuelve `prefer-useReducer` y `rerender-lazy-state-init` a la vez; `RESET` atómico vía `createInitialState()`; tests fáciles del reducer
- **Contras**: requiere tocar todos los setters del componente (dispatch wrappers)

## Consecuencias

### Positivas
- `prefer-useReducer` y `rerender-lazy-state-init` eliminados del reporte de react-doctor.
- Reset del formulario post-submit en una sola acción (sin olvidar campos).
- UUID/IDs generados solo al montar (lazy init), no en cada render.

### Negativas
- Los componentes consumidores deben adaptar sus setters a `dispatch` (patrón `onUrlChange={(v) => dispatch({type:'SET_FIELD', field:'url', value:v})}` o `onFieldChange` genérico).

### Riesgos
- Reducer demasiado genérico con `SET_FIELD` tipado como `value: unknown` — mitigado con `as CreateQrFormState` en el spread y unions de campos `SetFieldName`.
- Objetos complejos (vcard, pet) no deben pasar por `SET_FIELD` genérico — usar actions dedicadas (`SET_VCARD` con `data + isValid`).

## Referencias

- [[SPEC-004-react-doctor-qr-app]] — T-004-07, §3.2.1 decisión de arquitectura
- [[SPEC-004-B-no-giant-component-qr-app]] — C-01 (SignUpForm), C-07 (qr/edit)
