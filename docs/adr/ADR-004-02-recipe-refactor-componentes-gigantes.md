---
title: "ADR-004-02: Recipe de refactor de componentes gigantes (helpers puros + subcomponentes)"
date: 2026-08-09
tags:
  - adr
  - arquitectura
  - frontend
  - refactor
  - no-giant-component
  - spec-004-b
estado: accepted
---

# ADR-004-02: Recipe de refactor de componentes gigantes (helpers puros + subcomponentes)

**Fecha**: 2026-08-09
**Estado**: accepted

## Contexto

`react-doctor` marcaba 8 componentes de `qr-app/` como `no-giant-component` (324-548 líneas). Se necesitaba un método repetible para reducirlos a <300 líneas **sin cambiar comportamiento observable** (JSX, timing de validación, payloads, props públicas), validado contra un baseline funcional previo.

## Decisión

Aplicar el **recipe de refactor** en 3 pasos por componente (documentado en SPEC-004-B §4):

1. **Baseline funcional previo**: capturar B-XX (flujos, UI de inputs, payload, consumidores) en navegador ANTES de tocar código.
2. **Extraer lógica pura a `<Componente>.helpers.ts`** (module scope): validaciones, builders de payload, constantes, formatters — código movido **intacto** (incluidos `console.log` de debug si existen).
3. **Extraer JSX a subcomponentes** (`QrCard`, `ListUrlRow`, `FormField`, `HomeHero`, `EditQrForm`, etc.): bloques cohesivos que reciben props/callbacks; el orquestador queda delgado (<300 líneas).
4. **Validación post-refactor**: tsc + lint + build + re-verificación del baseline en navegador + `npm run doctor` + suite E2E.

Aplicado en: C-01 SignUpForm, C-02 ListUrlForm, C-03 QrGrid, C-04 activate/send, C-05 PlanForm, C-06 HomePageClient, C-07 qr/edit, C-08 qr/pay (SPEC-004-B) y T-004-07 CreateQrForm (SPEC-004).

## Alternativas Consideradas

### Alternativa 1: Dejar los componentes gigantes como deuda técnica
- **Pros**: cero riesgo
- **Contras**: mantiene 8 warnings de react-doctor y el código difícil de mantener; la spec B existía justo para eliminarlos
- **Por qué no**: el objetivo era eliminar la deuda (CA-01: 0 `no-giant-component`)

### Alternativa 2: Split por tipo de QR / secciones (sin helpers)
- **Pros**: menos archivos
- **Contras**: la lógica de validación/payload sigue en el componente; no resuelve la complejidad cognitiva
- **Por qué no**: mover solo JSX deja el orquestador con la lógica densa; los helpers puros son lo que más reduce líneas y habilita tests

### Alternativa 3: Recipe helpers + subcomponentes (elegida)
- **Pros**: 8/8 componentes <300 líneas; `0 no-giant-component`; comportamiento idéntico (validado con baseline + E2E 38/38); código puro testeable
- **Contras**: multiplica archivos (~28 nuevos); exige disciplina para no cambiar lógica al mover

## Consecuencias

### Positivas
- Score react-doctor: 87/100 (11 issues) → 88/100 (3 issues, 0 accionables).
- Cada componente quedó con helpers puros (validación/payload testables sin DOM).
- Patrón repetible documentado para futuros refactors.

### Negativas
- Más archivos por feature (helpers + subcomponentes + orquestador).
- `no-giant-component` mide por archivo: un subcomponente puede volver a crecer si no se mantiene la disciplina.

### Riesgos
- Mover código "intacto" puede ocultar código muerto (ej: `ensureUrlFormat` sin uso, `toDocumentTypeString`) — react-doctor lo detectó como `unused-export` al exportarlo; **limpiar exports muertos al mover**.
- Los `console.log` de debug se mueven con el código (comportamiento observado) — limpiarlos es un cambio de comportamiento no solicitado.

## Referencias

- [[SPEC-004-B-no-giant-component-qr-app]] — §4 recipe + §5.9 estado final
- [[SPEC-004-react-doctor-qr-app]] — T-004-07 (primer uso del recipe)
