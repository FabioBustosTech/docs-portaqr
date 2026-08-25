---
title: "SPEC-025: Adopción de la paleta nueva en el portal interno (dashboard/admin) — solo colores"
date: 2026-08-25
tags:
  - spec
  - frontend
  - dashboard
  - design-system
  - qr-app
  - colores
status: borrador
aliases:
  - SPEC-025
  - colores internos
  - retokenización dashboard
---

# SPEC-025: Adopción de la paleta nueva en el portal interno (dashboard/admin) — solo colores

> [!abstract] Decisión clave
> Modernizar los colores del portal interno (`dashboard/*`, `admin/*` y los 28 componentes compartidos que aún usan la capa puente) **sin tocar una sola clase ni el DOM**: se **re-tokenizan los VALORES** de los tokens legacy en `globals.css` (escalas `accent-*`/`primary-*` y utilidades `bg-light-*/bg-dark-*/text-light-*/text-dark-*`) apuntándolos a la paleta OKLCH del nuevo look. Con ese único archivo, los ~309 usos legacy re-skinean de una vez, con riesgo mínimo y reversión trivial. La migración de nombres de clase (para eliminar la capa puente) queda como fase opcional posterior, y el rediseño de layout con tokens `sidebar-*` queda fuera de esta spec.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-25
> - **Componente destino:** `desarrollo-qr/qr-app/src/app/globals.css` (Fase 1) + migración gradual opcional (Fase 2)
> - **Origen del estudio:** inventario realizado 2026-08-24/25 tras el cierre de SPEC-024 (ver §2)
> - **Rama base:** `feat/spec-024-look-feel-portaqrtest` (o `main` si ya se mergeó)
> - **Rama de trabajo:** `feat/spec-025-colores-internos`
> - **Relacionado:** [[SPEC-024-look-feel-portaqrtest]] (deja la capa puente documentada como deuda → esta spec la salda), [[SPEC-017-react-doctor-ronda-2-qr-app]] (guardián `legacy-tokens.guard.spec.ts` con allowlist a vaciar), [[SPEC-004-react-doctor-qr-app]]

---

## 1. Objetivo

Que el portal interno se vea con la paleta del nuevo look (portaqrtest) **cambiando solo colores**: mismo layout, mismos componentes, mismo DOM. Sin romper nada: cero cambios de estructura, cero cambios de lógica, tests intactos y reversión en un commit.

## 2. Estudio — inventario real (2026-08-24/25)

### 2.1 Volumen

| Superficie | Archivos | Tokens legacy |
| --- | --- | --- |
| `app/dashboard/**` + `app/admin/**` + `components/dashboard/**` + `components/admin/**` | 21 | **133** |
| Componentes compartidos (allowlist del guardián) | 28 | **176** |
| **Total** | **49** | **~309** |

### 2.2 Frecuencia por clase (dashboard/admin)

| Clase legacy | Usos | Rol actual |
| --- | --- | --- |
| `accent-500` | 48 | CTA, spinners, activo, highlights (teal viejo) |
| `text-light-primary` / `text-dark-primary` | 18 / 16 | Títulos |
| `bg-dark-secondary` | 15 | Cards/superficies (siempre con `dark:`) |
| `text-light-secondary` / `text-dark-secondary` | 11 / 11 | Cuerpo de texto |
| `accent-600` | 8 | Hover de CTAs |
| `bg-dark-tertiary`, `bg-dark-primary`, `accent-700`, `*-tertiary` | ≤2 c/u | Menores |

### 2.3 Hallazgo arquitectónico clave — radio de blast doble

Los 28 componentes compartidos (Button ×14, EditProfileForm ×30, ThemeToggle ×12, PasswordInput ×11, QrCard ×9, VCardNew ×9, Input ×7…) tienen consumidores en **AMBAS superficies**: `Button` (12+ consumidores: auth, contacto, servicios, faq, productos, onboarding + formularios del portal), `Input` (9), `ThemeToggle` (Header público **y** DashboardHeader), `QRCode` (Hero/generador públicos + QrDisplay), `Toast`, `dialog`, `checkbox`, `PasswordStrengthMeter` (auth)…

→ Migrar clase-por-clase en compartidos = tocar las dos superficies a la vez (alto riesgo de regresión visual doble). **La re-tokenización CSS evita el problema**: el cambio de valor es global y consistente por definición.

### 2.4 Por qué NO es un merge de clases nuevo

SPEC-024 ya resolvió la colisión de nombres: los semánticos nuevos se publican como `brand`, `primary-button`, `accent-new`, `background`, `card`, `muted-foreground`… y los legacy (`accent-500`, `bg-dark-secondary`…) siguen resolviendo desde la capa puente. **Los nombres no colisionan** → redefinir valores legacy no afecta en nada a las páginas ya migradas (que usan los nombres nuevos).

## 3. Especificación

### 3.1 Fase 1 — Re-tokenización CSS (el corazón, 1 archivo)

Redefinir en `globals.css` los **valores** de la capa puente apuntándolos a la paleta nueva. Mapeo aprobado:

| Token legacy | Valor nuevo | Racional |
| --- | --- | --- |
| `--color-accent-500` | `var(--brand)` | El teal viejo y brand comparten familia de hue — CTA unificado |
| `--color-accent-600` | `color-mix(in oklch, var(--brand) 86%, black)` | Hover perceptiblemente más oscuro |
| `--color-accent-700` | `color-mix(in oklch, var(--brand) 74%, black)` | Active/pressed |
| `--color-accent-50` / `100` | `var(--brand-soft)` / `color-mix(in oklch, var(--brand) 12%, white)` | Fondos suaves |
| `--color-accent-200..400` | rampa brand por lightness (0.90/0.82/0.75) | Bordes/íconos suaves |
| `--color-accent-800..950` | rampa brand oscura (0.38/0.30/0.24) | Texto sobre brand-soft |
| `--color-primary-50..950` | rampa neutra **hue 250** conservando la lightness de cada paso de la escala vieja | Los grises del portal adoptan el tono azul del nuevo look sin cambiar contrastes |
| `@utility bg-light-primary` | `var(--background)` | Superficie clara |
| `@utility bg-light-secondary` | `var(--secondary)` | |
| `@utility bg-light-tertiary` | `var(--muted)` | |
| `@utility bg-dark-primary` | `var(--background)` | Fondo oscuro del portal |
| `@utility bg-dark-secondary` | `var(--card)` | Cards |
| `@utility bg-dark-tertiary` | `var(--secondary)` | |
| `@utility text-light-primary` / `text-dark-primary` | `var(--foreground)` | Títulos |
| `@utility text-light-secondary` / `text-dark-secondary` | `var(--foreground)` | Cuerpo (lightness ≈ igual) |
| `@utility text-light-tertiary` / `text-dark-tertiary` | `var(--muted-foreground)` | Texto secundario |
| `--color-destructive` | se mantiene `#ef4444` | Decisión SPEC-024 S1 |

**Reglas de la fase:**
- **Cero cambios fuera de `globals.css`.** Ni una clase, ni un componente, ni un test.
- Calibrar `accent-600` en navegador (hover visible pero no brusco).
- `color-mix(in oklch, …)` es válido como valor de token en Tailwind v4.

### 3.2 Fase 2 — Migración de nombres y eliminación de la puente (opcional, por sesiones)

Con los valores ya alineados, migrar `accent-500` → `bg-brand`, `bg-dark-secondary` → `bg-card`, etc. archivo por archivo **no cambia ni un píxel** (los valores son idénticos). Objetivo: vaciar la allowlist de `legacy-tokens.guard.spec.ts`, eliminar la capa puente de `globals.css` y borrar el guard o convertirlo en prohibición total. Orden sugerido: (1) `app/dashboard/**` + `app/admin/**` (21 archivos), (2) compartidos puros de portal (EditProfileForm, SettingsAccordion, cart, pet-tag admin, qr forms), (3) compartidos con consumidores públicos (Button, Input, ThemeToggle, QRCode, Toast, dialog, checkbox, PaginationControls, PasswordInput/Strength, ShareModal, ContactForm, ChangePasswordForm, QrCard/QrGrid/QrDisplay, VCardNew) — cada lote con revisión visual de ambas superficies.

### 3.3 Fuera de alcance

- **Layout/estructura del portal** (sidebar con tokens `sidebar-*`, tipografía, espaciados) → futura SPEC-026 si se aprueba.
- **Colores de gráficos chart.js** (están en JS de `StatsCharts`, no son tokens CSS).
- **Colores de marca por tipo de chip** en `UrlList` (whatsapp verde, maps rojo…) — identificación visual, no paleta.
- Lógica, rutas, contratos API: intocables.

## 4. Diseño técnico

```
globals.css (Fase 1 — ÚNICO archivo de la fase)
├── @theme legacy: --color-accent-50..950  → rampa brand (var/color-mix)
├── @theme legacy: --color-primary-50..950 → rampa neutra hue 250
├── @utility bg-light-*/bg-dark-*          → var(--background|--card|--secondary)
├── @utility text-light-*/text-dark-*      → var(--foreground|--muted-foreground)
└── comentario: puente re-tokenizado (SPEC-025 Fase 1) — Fase 2 lo elimina
```

## 5. Trade-offs

| Decisión | Alternativa | Razón |
| --- | --- | --- |
| Re-tokenizar valores (Fase 1) | Migrar 309 clases en 49 archivos | 1 archivo vs 49; cero riesgo DOM; reversible en 1 commit; mismo resultado visual |
| Aceptar shift de tono en compartidos usados en público | Congelar compartidos y duplicar componentes para el portal | Duplicación peor; el shift ES la consistencia buscada; se audita visualmente |
| `color-mix` para hover (600/700) | Fijar hex nuevos | Se mantiene sincronizado si se ajusta `--brand` a futuro |
| Fase 2 opcional y por lotes | Big-bang de nombres | El valor visual ya está logrado en Fase 1; Fase 2 es higiene de código |

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Hover `accent-600` imperceptible o brusco | Bajo | Calibración visual en navegador; ajustar % del color-mix |
| Combos raros heredados (bg-accent-100 + text-accent-900) con contraste nuevo | Medio | Revisión visual light/dark de las 12+ rutas del portal |
| Shift de tono en públicas que usan compartidos (auth, contacto, home) | Medio | Es el objetivo (consistencia); revisión visual incluida en el DoD |
| Regresión lógica | — | Imposible por construcción: no se toca TS/TSX en Fase 1 |
| Rollback | — | `git revert` del commit de globals.css |

## 7. Criterios de aceptación (DoD)

1. `globals.css` es el **único** archivo cambiado en Fase 1.
2. `tsc --noEmit`, `lint`, `jest` (414+), `build` — todos verdes (deben quedar intactos: no se toca código).
3. Guardián `legacy-tokens.guard.spec.ts` verde (no se tocaron clases).
4. Revisión visual light/dark de: dashboard home, qr, qr/stats, qr/pay, qr/pay/webpay, qr/activate, admin/qrs, admin/pet-tag, users, settings, plan/edit, contact **+** login, signup, contacto, onboarding, forgot-password, verify-email, home (generador), pet-tag público.
5. Hover de CTAs del portal calibrado y visible.
6. Commit único de Fase 1 con mensaje descriptivo; tag `pre-spec-025-colores` antes de empezar (punto de restauración).

## 8. Tareas

Registradas en `docs/tareas/SPEC-025-tareas.json` (Fase 1 = 1 tarea; Fase 2 = lotes opcionales).
