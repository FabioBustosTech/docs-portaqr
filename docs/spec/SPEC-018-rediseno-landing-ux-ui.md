---
title: "SPEC-018: Rediseño UX/UI de la landing de Porta QR"
date: 2026-08-17
tags:
  - spec
  - frontend
  - ux-ui
  - landing
  - qr-app
  - accesibilidad
  - conversion
status: subsumida
subsumida-por: "[[SPEC-024-look-feel-portaqrtest]]"
aliases:
  - SPEC-018
  - rediseño landing
---

# SPEC-018: Rediseño UX/UI de la landing de Porta QR

> [!abstract] Decisión clave
> Rediseñar la landing de Porta QR (`qr-app`) para eliminar fricción de conversión y problemas de accesibilidad detectados: el generador QR pide email **antes** de generar (se pasa a opcional con *progressive disclosure*), el hero pierde jerarquía con 3 CTAs y logo duplicado, y el marquee de apps duplica el DOM sin `aria-hidden`. Se propone una arquitectura Atomic Design bajo `src/components/home/` + `src/components/ui/`, con Storybook CSF 3, en 4 fases (quick wins → generador → secciones → conversión), manteniendo la identidad visual actual (primary gris + accent teal).

> [!info] Metadatos
> - **Estado:** Subsumida / Cerrada (2026-08-24) — sus objetivos fueron cubiertos por [[SPEC-024-look-feel-portaqrtest]], que adoptó el diseño del prototipo portaqrtest-main: jerarquía del hero, marquee accesible (clon aria-hidden + pausa hover/focus + prefers-reduced-motion), skip-link, focus states y generador con email opcional (progressive disclosure). No se ejecutan sus fases pendientes.
> - **Fecha:** 2026-08-17
> - **Componente destino:** `desarrollo-qr/qr-app/src/components/home/`, `desarrollo-qr/qr-app/src/components/ui/`
> - **Alcance:** Solo frontend `qr-app/` (landing pública). No toca servicios backend ni el contrato de la API.
> - **Padre metodológico:** [[SPEC-004-B-no-giant-component-qr-app]] (recipe de refactor por componente) y [[SPEC-004-react-doctor-qr-app]] (baseline funcional pre/post)
> - **Relacionado:** [[SPEC-017-react-doctor-ronda-2-qr-app]], [[SPEC-002-qr-multilink-imagen]], [[SPEC-005-pdf-multilink]]

---

## 1. Objetivo

Recuperar la capacidad de conversión y la calidad UX/UI de la landing pública de Porta QR. La landing actual (`src/app/page.tsx` → `HomePageClient`) funciona, pero tiene problemas verificados que matan conversión y accesibilidad:

1. **Hero sin jerarquía**: H1 + logo repetido debajo (redundante con el header), 3 CTAs sin jerarquía (Comenzar / Saber más / Preguntas Frecuentes) y sin evidencia visual del producto.
2. **Marquee de apps** (`AnimatedLinkList`): lista de 33 apps duplicada en el DOM (clon del loop) sin `aria-hidden` → duplica la lectura de screen readers y el peso de render; sin contexto de valor.
3. **¿Cómo Empezar?**: solo números grandes, sin tarjetas/iconos ni conexión visual entre pasos.
4. **Generador QR** (`HomeQrGenerator`): pide email ANTES de generar (fricción que mata conversión), sin preview en vivo, sin estados error/éxito, `<select>` nativo inconsistente y botón deshabilitado hasta interacción.
5. **Features/Stats**: tarjetas genéricas, números estáticos sin animación ni contexto.
6. **Transversal**: sin skip-link, sin `aria-current` en nav, hack `@media (color-gamut: p3) { .text-gray-800 { color: #fff } }` en `globals.css` que rompe contraste en pantallas P3, sin animaciones y sin secciones de conversión (testimonios, precios teaser, CTA final).

### 1.1 Beneficios buscados

| Beneficio | Estado actual | Tras SPEC-018 |
| --- | --- | --- |
| Fricción del generador | Email obligatorio antes de generar | Email opcional (*progressive disclosure*) |
| Jerarquía del hero | 3 CTAs + logo duplicado | 1 CTA primario + 1 secundario + mockup del producto |
| Accesibilidad | Sin skip-link, marquee duplicado, hack P3 | Skip-link, `aria-hidden`, contraste correcto en P3 |
| Arquitectura | Secciones inline en `HomePageClient` | Atomic Design + Storybook CSF 3 |
| Conversión | Sin testimonios/precios/CTA final | Secciones de conversión completas |

### 1.2 Out of scope

- Cambios en servicios backend (`bff-service`, `user-service`, `qr-service`).
- Cambios en el contrato de la API de generación de QR (el email pasa a opcional solo en el frontend).
- Rediseño de páginas autenticadas (dashboard, admin, perfil).
- Migración de la landing a Server Components (se mantiene 'use client' por el generador interactivo).

---

## 2. Especificación

### 2.1 Requisitos funcionales por fase

#### Fase 1 — Quick wins (esfuerzo bajo, riesgo bajo)

- **RF-01**. Hero con jerarquía de CTAs: 1 primario "Crear tu QR gratis" (→ `/signup`) + 1 secundario "Ver precios" (→ `/precios`).
- **RF-02**. Eliminar el logo duplicado debajo del H1 (redundante con el header).
- **RF-03**. Accesibilidad del marquee: clon del loop con `aria-hidden="true"`, pausa en hover/focus y respeto de `prefers-reduced-motion`.
- **RF-04**. Agregar skip-link ("Saltar al contenido") como primer elemento enfocable.
- **RF-05**. Agregar `aria-current="page"` al enlace activo en la navegación.
- **RF-06**. Focus states visibles y consistentes en todos los elementos interactivos de la landing.
- **RF-07**. Eliminar el hack `@media (color-gamut: p3) { .text-gray-800 { color: #fff } }` de `globals.css` y reemplazarlo por tokens correctos (sin romper contraste en pantallas P3 ni dark mode).

#### Fase 2 — Generador QR + hero con mockup (esfuerzo medio)

- **RF-08**. Refactor de `HomeQrGenerator` → `QrGeneratorPanel`: quitar el email obligatorio antes de generar; pedirlo después (opcional, *progressive disclosure*: "¿Quieres recibir tu QR por email?").
- **RF-09**. Preview en vivo del QR con debounce (~300ms) mientras se escribe el contenido.
- **RF-10**. Estados visuales del generador: `empty` / `loading` / `success` / `error`.
- **RF-11**. Reemplazar el `<select>` nativo por `CustomSelect` (consistencia con el resto de la app).
- **RF-12**. Validación inline por tipo de QR (URL / email / teléfono) con mensajes de error accesibles (`aria-describedby`).
- **RF-13**. Acciones post-generación: **Descargar** (PNG/SVG) y **Copiar enlace**.
- **RF-14**. Hero con mockup del producto: layout 2 columnas en desktop (texto + QR real con escaneo animado y mini-chart), badge de novedad ("Nuevo: QR para mascotas") y micro-copy de confianza ("Sin tarjeta · Listo en 2 minutos").

#### Fase 3 — Secciones intermedias (esfuerzo medio)

- **RF-15**. "¿Cómo Empezar?" con tarjetas: icono + número en badge circular accent + línea conectora punteada en desktop; el paso 1 enlaza a registro.
- **RF-16**. Features en bento grid con micro-mockups (en vez de tarjetas genéricas).
- **RF-17**. Stats con count-up animado vía `IntersectionObserver` y contexto temporal ("últimos 12 meses"); respetar `prefers-reduced-motion`.

#### Fase 4 — Conversión y pulido (esfuerzo medio)

- **RF-18**. Sección de Testimonios: 3 tarjetas con avatar, nombre y estrellas (amber-400).
- **RF-19**. Precios teaser: reutilizar `PlanGrid` → 3 cards con CTA a `/precios`.
- **RF-20**. CTA final: banner con gradiente accent, input de email + botón (suscribirse / crear QR).
- **RF-21**. Scroll-reveal sutil en secciones (respetando `prefers-reduced-motion`).
- **RF-22**. Header con `backdrop-blur` + sombra al hacer scroll; menú móvil con focus trap y cierre con `Escape`.

### 2.2 Criterios de aceptación (CA)

- **CA-01**: El hero muestra exactamente 2 CTAs (primario → `/signup`, secundario → `/precios`) y NO contiene logo duplicado.
- **CA-02**: El clon del marquee tiene `aria-hidden="true"`; el marquee se pausa en hover/focus y se detiene con `prefers-reduced-motion`.
- **CA-03**: El skip-link es el primer elemento enfocable (Tab) y lleva al `#main-content`.
- **CA-04**: El enlace activo de la navegación tiene `aria-current="page"`.
- **CA-05**: `globals.css` no contiene el hack P3; el contraste de texto en pantallas P3 y dark mode cumple WCAG AA (verificado con axe).
- **CA-06**: El generador permite generar un QR **sin** ingresar email; el email solo se solicita después de generar (opcional).
- **CA-07**: El preview del QR se actualiza con debounce ≤ 300ms sin flicker.
- **CA-08**: El generador muestra los 4 estados (`empty`/`loading`/`success`/`error`) con mensajes accesibles.
- **CA-09**: El generador usa `CustomSelect` (sin `<select>` nativo).
- **CA-10**: La validación inline valida por tipo (URL/email/teléfono) y los errores están asociados al campo (`aria-describedby`).
- **CA-11**: Existen acciones "Descargar" y "Copiar enlace" funcionales tras generar.
- **CA-12**: "¿Cómo Empezar?" muestra tarjetas con icono + badge numérico + línea conectora en desktop; el paso 1 enlaza a `/signup`.
- **CA-13**: Features en bento grid; stats con count-up activado por `IntersectionObserver` y estático con `prefers-reduced-motion`.
- **CA-14**: Existen las secciones Testimonios (3 cards), Precios teaser (reutiliza `PlanGrid`) y CTA final (banner gradiente con email).
- **CA-15**: El header aplica `backdrop-blur` + sombra al scroll; el menú móvil atrapa el foco y cierra con `Escape`.
- **CA-16**: `npx tsc --noEmit`, `npm run lint` y `npm run build` pasan sin errores al final de cada fase.
- **CA-17**: Cada componente nuevo tiene story CSF 3 en Storybook con variantes documentadas y sin violaciones críticas de axe.
- **CA-18**: Dark mode intacto: todas las secciones nuevas se ven correctas con la clase `.dark` (sin regresiones de contraste).

### 2.3 Reglas de negocio (RN)

- **RN-01**: El email en el generador es **opcional** y se solicita después de generar (progressive disclosure). Nunca bloquear la generación por falta de email.
- **RN-02**: No romper dark mode: toda sección nueva debe funcionar con los tokens `bg-light-*` / `bg-dark-*` existentes.
- **RN-03**: Todas las animaciones (marquee, count-up, scroll-reveal, escaneo del mockup) deben respetar `prefers-reduced-motion`.
- **RN-04**: El CTA primario del hero siempre apunta a `/signup`; el teaser de precios siempre a `/precios`.
- **RN-05**: El generador gratuito de la landing no requiere sesión (mantener comportamiento actual).
- **RN-06**: La validación inline depende del tipo de QR seleccionado (URL/email/teléfono); los mensajes de error son en español y accesibles.
- **RN-07**: Mantener la identidad visual: primary (gris neutro) + accent (teal `#14b8a6`); amber-400 solo para estrellas y badges de novedad.

### 2.4 Métricas de éxito

| Métrica | Instrumento | Objetivo |
| --- | --- | --- |
| % visitantes que generan QR sin registrarse | Evento analytics en `QrGeneratorPanel` (generación sin email) | Aumentar vs. baseline actual |
| CTR del CTA primario del hero | Evento de click en "Crear tu QR gratis" | Aumentar vs. baseline |
| Scroll depth | Analytics de scroll (25/50/75/100%) | ≥ 50% de visitas llegan a CTA final |
| Conversión a `/signup` | Funnel landing → signup | Aumentar vs. baseline |
| Puntaje a11y (axe) | Addon a11y de Storybook por story | 0 violaciones críticas/serias |

---

## 3. Diseño Técnico

### 3.1 Arquitectura de componentes (Atomic Design)

> [!note] Estado actual
> Hoy `HomePageClient.tsx` orquesta las secciones inline y cada sección es un componente 'use client' autocontenido (`HomeHero`, `HomeStaticSections`, `HomeQrGenerator`, `HomeFeaturesStats`). La propuesta extrae átomos/moléculas reutilizables y convierte las secciones en organismos, siguiendo la recipe de [[SPEC-004-B-no-giant-component-qr-app]].

#### Átomos (`src/components/ui/`)

| Componente | Ruta propuesta | Descripción |
| --- | --- | --- |
| `Badge` | `src/components/ui/Badge.tsx` | Etiqueta de novedad (variants: accent, amber) |
| `StatValue` | `src/components/ui/StatValue.tsx` | Número con count-up vía `IntersectionObserver`; estático con `prefers-reduced-motion` |
| `SegmentedControl` | `src/components/ui/SegmentedControl.tsx` | Selector de tipo de QR (URL/email/teléfono) accesible (roles tab) |
| `InputState` | `src/components/ui/InputState.tsx` | Wrapper de input con estados error/success + mensaje `aria-describedby` |
| `Spinner` | `src/components/ui/Spinner.tsx` | Indicador de carga (estado `loading` del generador) |

#### Moléculas (`src/components/home/`)

| Componente | Ruta propuesta | Descripción |
| --- | --- | --- |
| `QrPreviewCard` | `src/components/home/QrPreviewCard.tsx` | Preview en vivo del QR (reutiliza `QRCode` con ref + `downloadQR`) + acciones Descargar/Copiar |
| `StepItem` | `src/components/home/StepItem.tsx` | Paso de "¿Cómo Empezar?": icono + badge circular numérico |
| `FeatureCard` | `src/components/home/FeatureCard.tsx` | Celda del bento grid con micro-mockup |
| `TestimonialCard` | `src/components/home/TestimonialCard.tsx` | Avatar + nombre + estrellas (amber-400) + cita |
| `PricingCard` | `src/components/home/PricingCard.tsx` | Card de precios teaser (envuelve `PlanGrid`) |
| `CTAEmailBanner` | `src/components/home/CTAEmailBanner.tsx` | Banner gradiente accent con input email + botón |

#### Organismos (`src/components/home/`)

| Componente | Ruta propuesta | Reemplaza / Origen |
| --- | --- | --- |
| `HeroSection` | `src/components/home/HeroSection.tsx` | `HomeHero.tsx` (refactor: 2 columnas + mockup) |
| `LogoMarquee` | `src/components/home/LogoMarquee.tsx` | `AnimatedLinkList` (refactor a11y: clon con `aria-hidden`, pausa hover, reduced-motion) |
| `HowItWorks` | `src/components/home/HowItWorks.tsx` | Bloque "¿Cómo Empezar?" de `HomeStaticSections.tsx` |
| `QrGeneratorPanel` | `src/components/home/QrGeneratorPanel.tsx` | `HomeQrGenerator.tsx` (refactor mayor, ver §3.2) |
| `FeaturesGrid` | `src/components/home/FeaturesGrid.tsx` | `HomeFeaturesStats.tsx` (parte features, bento) |
| `StatsBand` | `src/components/home/StatsBand.tsx` | `HomeFeaturesStats.tsx` (parte stats, count-up) |
| `TestimonialsSection` | `src/components/home/TestimonialsSection.tsx` | Nuevo |
| `FinalCTA` | `src/components/home/FinalCTA.tsx` | Nuevo |

#### Template

| Componente | Ruta propuesta | Descripción |
| --- | --- | --- |
| `HomeTemplate` | `src/components/home/HomeTemplate.tsx` | Orquesta las secciones en orden (hoy `HomePageClient` lo hace inline); `HomePageClient` queda como wrapper fino |

#### Storybook

- Story CSF 3 por componente con `args`/`controls`, docs de variantes (light/dark, estados del generador) y addon a11y (axe) activo en cada story.
- Configurar `@storybook/addon-a11y` y `@storybook/addon-docs` (verificar versión compatible con Next.js 14 + React 18 del proyecto).

### 3.2 Flujo de datos del generador (`QrGeneratorPanel`)

```
┌──────────────┐   tipo + contenido   ┌──────────────────┐
│ Segmented    │ ───────────────────▶ │ Estado local     │
│ Control      │                      │ (useReducer)     │
└──────────────┘                      │ empty/loading/   │
                                      │ success/error    │
┌──────────────┐   debounce ~300ms    │                  │
│ InputState   │ ───────────────────▶ │                  │
│ (contenido)  │                      └────────┬─────────┘
└──────────────┘                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ QrPreviewCard    │
                                    │ (QRCode en vivo) │
                                    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
            ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
            │ Descargar    │        │ Copiar       │        │ Email        │
            │ (PNG/SVG)    │        │ enlace       │        │ (opcional,   │
            │              │        │              │        │ progressive  │
            └──────────────┘        └──────────────┘        │ disclosure)  │
                                                            └──────┬───────┘
                                                                   ▼
                                                        ┌──────────────────┐
                                                        │ POST /api/qr-    │
                                                        │ free-generation  │
                                                        │ (solo si email)  │
                                                        └──────────────────┘
```

- **Estado local**: `useReducer` en `QrGeneratorPanel` (patrón `CreateQrForm.state.ts` de [[SPEC-005-pdf-multilink]]): `{ tipo, contenido, estado, qrDataUrl, error }`.
- **Preview en vivo**: el QR se renderiza en cliente con el componente `QRCode` existente (sin latencia de red); el debounce (~300ms) evita re-renders por keystroke.
- **Validación**: helpers puros por tipo (URL/email/teléfono) en `QrGeneratorPanel.helpers.ts` (patrón `ListUrlForm.helpers.ts`), con timing onBlur/onChange como `SignUpForm` (SPEC-004-B C-01).
- **Fetch**: `POST /api/qr-free-generation` (ruta propuesta, nueva) se invoca **solo** cuando el usuario opta por "enviar por email" o guardar; el preview nunca depende de la red.

> [!warning] Contrato de API sin cambios
> El email pasa a ser **opcional en el frontend** (progressive disclosure), pero **no se cambia el contrato** de `/api/qr-free-generation`: el endpoint sigue aceptando el mismo payload; simplemente el frontend deja de enviar el email por defecto y solo lo incluye cuando el usuario lo solicita. Verificar en implementación que el endpoint tolera email ausente (si no, ajustar backend en una spec aparte — no en esta).

### 3.3 Tokens y diseño visual

- **Identidad**: mantener escala `primary` (gris neutro `#18191b → #f8fafc`) y `accent` (teal `#14b8a6`) definidas con `@theme` en `src/app/globals.css`; dark mode por clase `.dark` con `@custom-variant` y utilidades `bg-light-primary` / `bg-dark-primary`.
- **Tipografía**: Inter (`next/font/google`), escala display: H1 `text-5xl md:text-6xl font-bold tracking-tight`.
- **Tarjetas**: `rounded-2xl`, sombra con tinte teal `shadow-[0_8px_30px_rgb(20,184,166,0.08)]`.
- **Ritmo**: secciones `py-16 md:py-24`, contenedor `max-w-7xl mx-auto px-4`.
- **Amber-400**: solo estrellas de testimonios y badges de novedad (RN-07).

---

## 4. Mockups / Referencias

> [!note] Sin imágenes por ahora
> No hay mockups gráficos adjuntos; se describen en texto para guiar la implementación. Si se generan diseños (Figma/Stitch), enlazarlos aquí.

### 4.1 Hero (2 columnas, desktop)

- **Columna izquierda**: badge de novedad ("Nuevo: QR para mascotas", amber) → H1 display → subcopy → 2 CTAs (primario accent "Crear tu QR gratis" → `/signup`; secundario outline "Ver precios") → micro-copy de confianza ("Sin tarjeta · Listo en 2 minutos").
- **Columna derecha**: mockup del producto — QR real generado en vivo + overlay de escaneo animado (línea que recorre el QR, respeta reduced-motion) + mini-chart de escaneos (barras) + tarjeta flotante de "último escaneo".
- **Fondo**: gradiente radial sutil accent (`bg-[radial-gradient(...)]` con opacidad baja) sobre `bg-light-primary` / `bg-dark-primary`.
- **Mobile**: columna única, mockup debajo del texto, CTAs apilados (primario full-width).

### 4.2 Bento grid (Features)

- Grid 6 columnas en desktop con celdas de distinto tamaño (2x2, 2x1, 1x1...): cada celda = `FeatureCard` con micro-mockup (mini QR, mini tabla de escaneos, mini lista de links) + título + descripción corta.
- Mobile: 1 columna apilada.

### 4.3 Timeline "¿Cómo Empezar?" (3 pasos)

- Desktop: 3 `StepItem` en fila, cada uno con icono + badge circular accent con el número; línea conectora punteada (`border-dashed`) entre pasos.
- Paso 1 ("Crea tu QR") enlaza a `/signup`; paso 2 ("Personaliza"); paso 3 ("Compártelo y mide").
- Mobile: vertical, línea conectora a la izquierda.

### 4.4 Referencias del proyecto

- [[SPEC-004-B-no-giant-component-qr-app]] — recipe de refactor por componente (baseline funcional, extracción de lógica, validación tsc/lint/build).
- [[SPEC-004-react-doctor-qr-app]] — baseline funcional pre/post y matriz UI.
- [[SPEC-017-react-doctor-ronda-2-qr-app]] — estado de calidad actual de `qr-app` (score 74/100; no introducir regresiones).
- [[SPEC-002-qr-multilink-imagen]] — decisiones de imágenes dinámicas (aplica a micro-mockups si usan imágenes).
- [[SPEC-005-pdf-multilink]] — patrón de estado `CreateQrForm.state.ts` reutilizable en `QrGeneratorPanel`.

---

## 5. Trade-offs

| Decisión | Alternativa | Por qué |
| --- | --- | --- |
| **Email opcional después de generar** (progressive disclosure) | Mantener email obligatorio antes de generar (captura de leads) | El email previo es la mayor fricción de conversión detectada. Pedirlo después de generar (con valor ya creado) mantiene captura de leads con menor abandono. El contrato de la API no cambia (RN-01) |
| **Marquee con clon + `aria-hidden`** | Marquee con CSS puro (`translateX` infinito, sin duplicar DOM) | El clon es el cambio mínimo sobre `AnimatedLinkList` existente y ya funciona; CSS puro evita duplicar DOM pero requiere reescribir la animación y el timing. El clon con `aria-hidden` + pausa en hover resuelve el problema de a11y sin reescribir el componente |
| **Count-up con `IntersectionObserver`** | Números estáticos | Los estáticos no generan atención ni contexto; el count-up con `prefers-reduced-motion` (estático si se prefiere) da impacto sin romper accesibilidad. Costo: hook pequeño + test |
| **Bento grid para features** | Grid uniforme de tarjetas | El bento da jerarquía visual y espacio para micro-mockups (evidencia del producto); el grid uniforme es más simple pero genérico (problema actual). Se implementa con CSS Grid puro, sin librerías |
| **Mantener identidad teal + amber puntual** | Rediseño visual completo | La identidad actual (primary gris + accent teal) ya está tokenizada y es consistente con el resto de la app; un rediseño completo duplicaría esfuerzo y rompería consistencia. Amber-400 solo en estrellas/badges para no contaminar la paleta |
| **Secciones 'use client' (mantener)** | Migrar a Server Components | El generador y las animaciones requieren interactividad; migrar la landing completa a RSC sería un refactor mayor fuera de alcance (§1.2) |

---

## 6. Plan de implementación (roadmap por fases)

> [!todo] Taskmaster
> Registrar como tareas en `docs/tareas/SPEC-018-tareas.json` (formato Taskmaster-compatible) — **se creará después de aprobar esta spec**.

| Fase | Alcance | Esfuerzo | Riesgo |
| --- | --- | --- | --- |
| **Fase 1 — Quick wins** | RF-01..07: hero CTA + quitar logo duplicado, a11y marquee, skip-link, `aria-current`, focus states, fix hack P3 | 🟢 bajo | Bajo |
| **Fase 2 — Generador + hero** | RF-08..14: refactor `HomeQrGenerator` → `QrGeneratorPanel` (sin email previo, preview en vivo, estados, `CustomSelect`, validación inline, Descargar/Copiar) + hero con mockup | 🟡 medio | Medio (producto principal de conversión) |
| **Fase 3 — Secciones** | RF-15..17: "¿Cómo Empezar?" con tarjetas, features bento, stats count-up | 🟡 medio | Medio |
| **Fase 4 — Conversión** | RF-18..22: testimonios, precios teaser (`PlanGrid`), CTA final, scroll-reveal, reduced-motion, perf, header con blur | 🟡 medio | Bajo |

> [!note] Orden sugerido
> Fase 1 primero (quick wins, sube a11y y conversión con riesgo mínimo), luego Fase 2 (mayor impacto en conversión — aplicar baseline funcional pre/post según [[SPEC-004-react-doctor-qr-app]] §3.4), después Fases 3 y 4. Cada fase cierra con tsc/lint/build + verificación en navegador (light/dark).

---

## 7. Testing

- `npx tsc --noEmit` — sin errores de tipos (tras cada fase).
- `npm run lint` — sin errores.
- `npm run build` — build de producción exitoso.
- **Unit tests** (Jest + Testing Library): `QrGeneratorPanel` (estados, debounce, validación por tipo), `StatValue` (count-up + reduced-motion), `LogoMarquee` (aria-hidden en clon), `CTAEmailBanner` (validación email).
- **Storybook**: story CSF 3 por componente con addon a11y (axe) — 0 violaciones críticas/serias (CA-17).
- **Verificación manual en navegador**: light + dark mode, mobile (menú con focus trap), teclado (skip-link, focus visible), `prefers-reduced-motion` activado.

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| Refactor del generador rompe la conversión actual | Media | Alto | Baseline funcional pre/post (patrón SPEC-004 §3.4); validación en navegador; cambios incrementales por fase |
| El endpoint `/api/qr-free-generation` no tolera email ausente | Media | Medio | Verificar contrato en Fase 2; si requiere ajuste, hacerlo en spec aparte (no cambiar contrato en esta) |
| Regresiones de calidad (react-doctor) al refactorizar | Media | Medio | Correr `npm run doctor` al cierre de cada fase y registrar score (lección [[SPEC-017-react-doctor-ronda-2-qr-app]]) |
| Hack P3 eliminado rompe contraste en algún navegador | Baja | Medio | Verificar con axe en pantalla P3 + dark mode (CA-05) |
| Storybook incompatible con la versión de Next/React del proyecto | Baja | Medio | Verificar versiones compatibles antes de instalar; si no, documentar stories como archivos CSF sin runner |

---

## 9. Observabilidad

- Cada fase cerrada se registra en §11 (historial) con fecha y resultado de validaciones.
- Score de `npm run doctor` registrado al cierre de cada fase (métrica de calidad continua).
- Métricas de éxito (§2.4) se miden tras Fase 4 con analytics de eventos.
- Estado de la spec se actualiza a `implementado` al cumplir todos los CA (§2.2).

---

## 10. Referencias

- [[SPEC-004-B-no-giant-component-qr-app]] — recipe de refactor por componente.
- [[SPEC-004-react-doctor-qr-app]] — baseline funcional pre/post y matriz UI.
- [[SPEC-017-react-doctor-ronda-2-qr-app]] — estado de calidad actual de `qr-app` y métrica continua.
- [[SPEC-002-qr-multilink-imagen]] — decisiones de imágenes dinámicas.
- [[SPEC-005-pdf-multilink]] — patrón de estado `CreateQrForm.state.ts` y helpers.
- Código verificado: `desarrollo-qr/qr-app/src/components/home/` (HomePageClient, HomeHero, HomeStaticSections, HomeQrGenerator, HomeFeaturesStats), `Header/index.tsx`, `Footer/index.tsx`, `AnimatedLinkList/`, `QRCode.tsx`, `PlanGrid.tsx`, `ui/CustomSelect.tsx`, `globals.css`.

---

## 11. Historial de cambios

| Fecha | Autor | Cambio |
| :---------- | :----- | :---------- |
| 2026-08-17 | Equipo | Borrador inicial. Diagnóstico de la landing verificado en código (hero, marquee, generador, features/stats, transversal). Propuesta por sección (A-G), arquitectura Atomic Design con rutas propuestas, flujo de datos del generador con email opcional (progressive disclosure, sin cambio de contrato API), roadmap en 4 fases, métricas de éxito y trade-offs documentados. Tareas JSON pendientes (`docs/tareas/SPEC-018-tareas.json` se creará tras aprobación) |
