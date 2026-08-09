---
title: "ADR-004-03: Contrato values + onFieldChange y contexto separado para formularios"
date: 2026-08-09
tags:
  - adr
  - arquitectura
  - frontend
  - react
  - context
  - spec-004-b
estado: accepted
---

# ADR-004-03: Contrato `values + onFieldChange` y contexto separado para formularios

**Fecha**: 2026-08-09
**Estado**: accepted

## Contexto

Al extraer subformularios de los componentes gigantes aparecieron dos problemas de react-doctor y de diseño:

1. **`only-export-components`**: un archivo con componente no debe exportar hooks/contextos (`SignUpFormField.tsx` exportaba `FormField` + `useSignUpForm` + `SignUpFormContext` — rompe code-splitting).
2. **Contrato de props inflado**: `EditQrForm` recibía 15 pares de props `value + setter` (url/onUrlChange, phone/onPhoneChange, ...) — verboso y frágil.

## Decisión

1. **Contexto en archivo propio sin componentes**: `SignUpFormContext.ts` contiene `createContext` + `useSignUpForm`; `SignUpFormField.tsx` solo exporta el componente. Regla: un archivo con componentes no exporta nada que no sea componente.

2. **Contrato `values + onFieldChange`**: el subformulario recibe el **estado completo** (`values: EditQrFormState`) + un **setter genérico** (`onFieldChange(field, value)`); los wrappers individuales (`onUrlChange={(v) => onFieldChange('url', v)}`) viven DENTRO del subformulario, no en el padre.

## Alternativas Consideradas

### Alternativa 1: Mantener props individuales (value + setter por campo)
- **Pros**: explícito, sin indirección
- **Contras**: 15-30 props por formulario; el padre repite los wrappers; difícil de mantener
- **Por qué no**: verboso y el origen de la mala señal de mantenibilidad

### Alternativa 2: Pasar `useReducer`/store directamente al hijo
- **Pros**: cero wrappers
- **Contras**: acopla al hijo con el mecanismo de estado; imposible testear el hijo sin reducer
- **Por qué no**: rompe la separación de responsabilidades (el hijo no debe conocer cómo se gestiona el estado)

### Alternativa 3: values + onFieldChange (elegida)
- **Pros**: contrato estable (2 props en vez de 30); el subformulario controla sus wrappers; fácil de testear (pasar objeto + spy)
- **Contras**: `onFieldChange` es menos tipado (field union + `value: unknown`) — mitigado con unions `EditQrFieldName`

## Consecuencias

### Positivas
- `only-export-components` eliminado (contexto en `.ts` sin JSX).
- Contrato de `EditQrForm` pasó de 15 props a 5 (qr, error, active, values, onFieldChange).
- El patrón habilita `useReducer` (ADR-004-01) con un único canal de actualización.

### Negativas
- Un solo canal de cambios (onFieldChange) pierde la autocompletación por setter específico.
- El tipado `value: unknown` exige cast en el reducer.

### Riesgos
- Abusar del campo genérico puede permitir valores inválidos — mitigado con unions de campos por formulario.
- El contexto compartido puede ocultar dependencias — solo usar cuando el subformulario es interno al formulario.

## Referencias

- [[SPEC-004-B-no-giant-component-qr-app]] — C-01 (SignUpForm), C-07 (qr/edit), §5.8
- [[ADR-004-01-usereducer-formularios-complejos]] — complementario (estado con reducer)
