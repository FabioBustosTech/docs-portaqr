---
title: "SPEC-031: Aceptación unificada en popup (términos bloqueantes + newsletter opcional)"
date: 2026-09-03
tags:
  - spec
  - signup
  - legal
  - ux
status: borrador
---

# SPEC-031: Aceptación unificada en popup (términos bloqueantes + newsletter opcional)

> [!abstract] Decisión clave
> Un **solo camino**: el formulario `/signup` no lleva ninguna casilla. La sección "Términos y Condiciones" tiene un botón que abre un **popup único** con el resumen de términos + botón **"Aceptar"** (clic implícito = aceptación, bloqueante, sin casilla) + casilla **opcional no-tickeada** de newsletter. Como Google: el popup es solo aceptación; el marketing va separado pero en el mismo paso para no perderlo. Reutiliza `TermsModal` + `terms-content.ts`.

> [!info] Metadatos
> - **Estado:** Borrador (en implementación)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-app/` (SignUpForm, TermsModal) + `e2e-tests-portaqr` (signup-optin)
> - **Origen:** Pedido del usuario (2026-09-03): el popup de Google acepta términos sin newsletter; tener casilla fuera + popup es confuso — "vamos por un solo camino: los dos con popup, con click implícito no tickeado; términos bloqueantes, newsletter opcional".
> - Historial: v1 proponía pantalla completa estilo Google; v2 (esta) mantiene el popup, que es lo que Google realmente levanta.

---

## 1. Objetivo

Eliminar la confusión de la doble aceptación (casilla fuera + popup): un solo gesto de aceptación dentro del popup. Los términos se aceptan con el **clic en "Aceptar"** (sin casilla que tickear — el clic ES la aceptación, bloqueante para crear la cuenta). La newsletter vive en el **mismo popup** como casilla **opcional, no premarcada** (separación legal preservada: aceptar términos no suscribe).

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (sin casillas en el form)**. `SignUpForm` elimina `TermsCheckbox` y la casilla `newsletterOptIn` externa. La sección "Términos y Condiciones" muestra: texto "Para crear tu cuenta debes aceptar los Términos..." + botón **"Leer y aceptar términos"** que abre el popup + estado ("✓ Aceptados el ..." / pendiente).
- **RF-2 (popup unificado)**. `TermsModal` suma bloque opcional newsletter (props `newsletterOptIn`, `onNewsletterChange`): casilla no premarcada "Quiero recibir la newsletter de Porta QR (puedo darme de baja cuando quiera)" + link `/privacidad#newsletter`. Estructura: resumen términos → newsletter opcional → link documento completo → footer [Cerrar] [**Aceptar y continuar**].
- **RF-3 (clic implícito bloqueante)**. `acceptTerms` pasa a estado interno: solo se marca vía `onAccept` del popup. Sin "Aceptar" no hay cuenta (email: botón Crear deshabilitado + nota; Google: el botón abre el popup).
- **RF-4 (flujo Google)**. Igual que hoy: Google sin aceptar → popup (CTA "Aceptar y continuar con Google") → aceptar → redirect OAuth. La casilla newsletter del popup **no sobrevive** al round-trip OAuth: usuarios Google deciden en el **onboarding** (ya existe, SPEC-030).
- **RF-5 (retorno /terminos)**. `?acceptTerms=1` **abre el popup automáticamente** al cargar (sin effect: estado inicial), para que el que viene de leer acepte en un clic.

### 2.2 Reglas de negocio

- **RN-1 (separación legal)**. Aceptar términos jamás suscribe: `newsletterOptIn` default `false`, solo el check explícito lo pone `true` (Ley 19.628).
- **RN-2 (sin aceptación, sin cuenta)**. Ningún camino (email/Google) crea cuenta sin `onAccept` del popup.
- **RN-3 (prueba de consentimiento)**. Se mantiene `consentAt/source` de newsletter; términos = `acceptTerms` interno del submit (extensión a `termsAcceptedAt` en backend queda fuera de esta SPEC).

### 2.3 Criterios de aceptación

- **CA-01**: `/signup` sin casillas; botón abre popup con resumen + newsletter no-tickeada.
- **CA-02**: "Aceptar" con newsletter marcada → cuenta + `subscribed` (source signup); sin marcar → cuenta sin suscripción.
- **CA-03**: sin aceptar, "Crear Cuenta" deshabilitado; Google abre el popup.
- **CA-04**: `?acceptTerms=1` abre el popup al cargar.
- **CA-05**: `tsc`, `lint`, `jest` verdes + RTL + E2E signup-optin actualizado al popup.

## 3. Diseño Técnico

```
SignUpForm (sin TermsCheckbox ni casilla newsletter)
  sección "Términos y Condiciones"
    ├─ texto + estado (pendiente/aceptado)
    └─ botón "Leer y aceptar términos" → setIsTermsModalOpen(true)
  TermsModal open
    ├─ resumen (TERMS_SUMMARY) + link /terminos
    ├─ [NUEVO] checkbox newsletter (props opcionales, default false)
    └─ [Cerrar] [Aceptar y continuar(- con Google)]
         └─ onAccept → acceptTerms=true (+ redirect Google si pendiente)
```

| Archivo | Cambio |
|---|---|
| `TermsModal/index.tsx` | Props `newsletterOptIn?`, `onNewsletterChange?`; bloque casilla + link privacidad |
| `SignUpForm/index.tsx` | Fuera `TermsCheckbox` + casilla newsletter; botón abre-popup + estado; `initialAcceptTerms` → popup abierto inicial |
| `TermsModal.spec.tsx`, `SignUpForm` specs, `helpers.spec.tsx` | RTL popup unificado (CA-01/02/04) |
| `e2e-tests-portaqr` signup-optin | Flujo vía popup (CA-02/03) |

### 3.1 ADRs

> [!info] ADR-031.1 — ¿Pantalla completa o popup?
> **Decisión v2**: **popup** (lo que Google realmente levanta). La pantalla completa (v1) añadía fricción y una ruta nueva sin beneficio legal extra: la aceptación por clic en el popup con resumen + link al documento es el estándar observado.

## 4. Referencias

- Patrón Google: popup de aceptación de términos (sin marketing adentro como aceptación).
- `src/lib/terms-content.ts`, `TermsModal`, `TermsPageClient` (CTA `?acceptTerms=1`).
- [[SPEC-030-newsletter-cms-suscripciones]] (RF-7: checkbox se mueve del form al popup).

## 5. Trade-offs

- **Pro**: un solo camino, cero confusión; separación legal intacta; menos elementos en el form.
- **Contra**: la newsletter queda a un clic más de distancia (dentro del popup) — posible baja en opt-ins, compensada por onboarding + `/newsletter`.

---

| Fecha | Detalle |
|---|---|
| 2026-09-03 | **SPEC creada** (v1 pantalla completa). |
| 2026-09-03 | **Reescrita a v2** (popup unificado): el usuario aclara que Google levanta popup y que la confusión es casilla-fuera + popup — un solo camino. En implementación. |
