---
title: "SPEC-031: Aceptación de términos estilo Google (pantalla Acepto explícito)"
date: 2026-09-03
tags:
  - spec
  - signup
  - legal
  - ux
status: borrador
---

# SPEC-031: Aceptación de términos estilo Google (pantalla Acepto explícito)

> [!abstract] Decisión clave
> El registro (`/signup`) pasa a **2 pasos**: 1) datos de cuenta, 2) **pantalla "Privacidad y Condiciones"** como la de crear una cuenta Google — resumen en lenguaje claro + texto completo con scroll + botón **"Acepto"** explícito (habilitado solo tras leer) y **"Atrás"**. La casilla obligatoria del paso 1 desaparece (la aceptación vive en la pantalla); la newsletter queda como casilla **opcional y separada** en esa misma pantalla. Reutiliza `terms-content.ts` (fuente única).

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-app/` (signup, pantalla aceptación, onboarding/Google)
> - **Origen:** Pedido del usuario (2026-09-03): seguir "la forma de Google para la aceptación" — pantalla con Acepto explícito, no solo casilla.

---

## 1. Objetivo

Subir el estándar legal y de UX del registro al patrón que usa Google al crear una cuenta: aceptación **informada y explícita** (el usuario ve el resumen, puede leer el texto completo y pulsa "Acepto"), en vez de una casilla premarcable junto al formulario. Beneficios: prueba de consentimiento más sólida (Ley 19.628), menos fricción visual en el paso 1, y la newsletter queda claramente separada como marketing opcional (como hace Google con sus opt-ins).

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (wizard 2 pasos)**. `/signup` se divide en:
  - **Paso 1 — Tu cuenta**: email + contraseña + botón Google (sin casillas; solo una línea "Al continuar verás los Términos y la Privacidad").
  - **Paso 2 — Privacidad y Condiciones** (pantalla completa): hero con título + fecha de actualización, tarjeta "En resumen" (bullets `TERMS_SUMMARY`), texto completo con scroll (`TERMS_SECTIONS`), casilla opcional newsletter, botones **"Atrás"** (secundario) y **"Acepto y crear cuenta"** (primario).
- **RF-2 (lectura para aceptar)**. El botón "Acepto" se habilita solo cuando el usuario llega al final del texto (scroll-spy, mismo patrón de `/terminos`). Nota honesta "Debes leer hasta el final para aceptar".
- **RF-3 (newsletter separada)**. En la pantalla, casilla opcional **no premarcada**: "Quiero recibir la newsletter de Porta QR (puedo darme de baja cuando quiera)" + link a `/privacidad#newsletter`. Su valor viaja en el `signup` (email) igual que hoy (`newsletterOptIn`).
- **RF-4 (flujo Google)**. "Continuar con Google" (paso 1) lleva primero a la pantalla de aceptación; al pulsar "Acepto" redirige a `/api/auth/google?mode=signup`. La newsletter de usuarios Google se decide en el **onboarding** (ya existe) — el round-trip OAuth no preserva estado del form.
- **RF-5 (retorno de /terminos)**. El CTA de `/terminos` ("Aceptar términos y crear cuenta") aterriza en el **paso 2** ya leído (scroll al final + botón habilitado), no en el paso 1.
- **RF-6 (retrocompatibilidad)**. `?acceptTerms=1` antiguo: aterriza en paso 2 con lectura pendiente (la aceptación vieja por casilla no se hereda como "leído").

### 2.2 Reglas de negocio

- **RN-1 (prueba de consentimiento)**. Al crear la cuenta se registra `termsAcceptedAt + termsVersion` (= `TERMS_LAST_UPDATED`) junto a los datos (el backend ya guarda prueba de newsletter; esto la extiende a términos — coordinar campo con backend si aplica).
- **RN-2 (sin lectura, sin cuenta)**. No existe camino (email ni Google) que cree cuenta sin pasar por la pantalla y pulsar "Acepto".
- **RN-3 (accesibilidad)**. La pantalla usa `main`, headings jerárquicos, foco gestionado al avanzar/retroceder (el lector anuncia el paso), botón deshabilitado con `aria-disabled` + explicación visible.

### 2.3 Criterios de aceptación

- **CA-01**: completar paso 1 → pantalla de aceptación con resumen + texto completo; "Acepto" deshabilitado hasta scroll final.
- **CA-02**: "Acepto" crea la cuenta (email) con `newsletterOptIn` según la casilla; redirige a `/verify-email` como hoy.
- **CA-03**: flujo Google: paso 1 → pantalla → "Acepto" → Google → cuenta creada; newsletter se ofrece en onboarding.
- **CA-04**: `/terminos` CTA → paso 2 directo; `?acceptTerms=1` → paso 2 (no auto-aceptado).
- **CA-05**: `tsc`, `lint`, `jest` verdes + RTL del wizard (pasos, gating por scroll, newsletter opcional) + E2E signup actualizado.

## 3. Diseño Técnico

```
app/signup/
  page.tsx                 → monta <SignUpWizard/>
  SignUpWizard.tsx (nuevo) → paso: 'cuenta' | 'condiciones'; guarda formData + newsletterOptIn
  steps/
    AccountStep.tsx (nuevo)→ form actual SIN casillas (extraído de SignUpForm)
    TermsStep.tsx (nuevo)  → pantalla estilo Google:
                              PageHero "Privacidad y Condiciones" + fecha
                              tarjeta "En resumen" (TERMS_SUMMARY)
                              <div scroll> texto completo (TERMS_SECTIONS) + scroll-spy bottom
                              checkbox newsletter (opcional, default false)
                              [Atrás] [Acepto y crear cuenta / Aceptar y continuar con Google]
```

- Estado entre pasos: memoria del wizard (sin query params con PII; solo `?paso=condiciones` opcional para deep-link, sin datos).
- Scroll-gating: `onScroll` del contenedor → `scrollTop + clientHeight >= scrollHeight - 8` → `hasRead=true`.
- `TermsCheckbox`/`TermsModal` actuales: el modal se retira del signup (queda `/terminos` como lectura); evaluar reutilizar piezas visuales.
- Backend (si RN-1 requiere persistencia): nuevo campo `termsAcceptedAt/termsVersion` en `CreateUserDto` — SPEC hija o alcance de esta (decidir al implementar).

### 3.1 ADRs

> [!info] ADR-031.1 — ¿Paso dentro de /signup o ruta nueva (/signup/condiciones)?
> **Decisión**: **paso dentro de `/signup`** (estado en memoria, sin PII en URL).
> - Ruta nueva obligaría a persistir email/contraseña entre rutas (query = PII en historial; sessionStorage = más piezas). El wizard de 1 ruta es el mismo UX "pantalla" con menos riesgo.

## 4. Referencias

- Patrón Google: creación de cuenta → pantalla "Privacidad y Condiciones" (resumen + texto + "Acepto").
- `src/lib/terms-content.ts` (fuente única), `app/terminos/TermsPageClient.tsx` (scroll-spy a reutilizar).
- [[SPEC-030-newsletter-cms-suscripciones]] (RF-7 newsletter en signup — se mueve al paso 2).

## 5. Trade-offs

- **Pro**: consentimiento más sólido y auditable; UX por pasos reduce carga cognitiva; newsletter separada = marketing claramente opcional (mejor entregabilidad/reputación).
- **Contra**: +1 clic en el registro (fricción medible — vigilar conversión); más código que mantener en el wizard; flujo Google con parada intermedia (aceptable: Google hace lo mismo).

---

| Fecha | Detalle |
|---|---|
| 2026-09-03 | **SPEC creada** (borrador). Pendiente de implementación. |
