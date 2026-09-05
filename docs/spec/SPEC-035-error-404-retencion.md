---
title: "SPEC-035: Página 404 rediseñada (error + retención) desde propuesta Stitch"
date: 2026-09-04
tags:
  - spec
  - frontend
  - 404
  - retencion
  - ux
  - stitch
status: implementado
---

# SPEC-035: Página 404 rediseñada (error + retención) desde propuesta Stitch

> [!abstract] Decisión clave
> El `not-found.tsx` actual es una página desnuda (solo "404" + botón "Volver al inicio", sin Header ni Footer). La propuesta **"PortaQR - Error 404 (Propuesta Optimizada y Retención)"** (Stitch) convierte el error en una oportunidad de retención: mantiene los marcos reales del sitio (Header/Footer), hero visual de "404 + QR escaneable", badge de estado, mensaje contextual, CTAs de acción, una **grilla bento de destinos recomendados** y un **bloque de soporte orientado al caso real "error de un código QR impreso"**. Esta SPEC traslada esa propuesta al stack real de `qr-app` reutilizando los componentes existentes (`Header`, `Footer`, `Button`, tokens de globals.css) y los enlaces reales (`/registro`, `/precios`, `/servicios`, `/faq`, `/contacto`).

> [!info] Metadatos
> - **Estado:** Implementado en rama (pendiente merge a main).
> - **Fecha:** 2026-09-04
> - **Componente destino:** `desarrollo-qr/qr-app/` (not-found, componentes nuevos) + `e2e-tests-portaqr` (404)
> - **Origen:** Propuesta Stitch "PortaQR - Error 404 (Propuesta Optimizada y Retención)" (proyecto PortaQR Design System) + pedido del usuario (2026-09-04): "mejorar página 404, crear nueva spec, sacar de la propuesta Stitch lo que sirva".

---

## 1. Objetivo

Rediseñar la página 404 de `qr-app` pasando de una pantalla mínima y desmarcada a una experiencia **on-brand, funcional y orientada a retención**, que:
1. Reutilice los marcos reales del sitio (`Header` + `Footer`) para no romper la continuidad visual.
2. Reconozca el caso de negocio específico de PortaQR: muchos códigos QR **impresos** apuntan a URLs que dejan de existir; el 404 es un escenario real del usuario final. Se ofrece salida clara (soporte / contacto).
3. Ofrezca rutas de recuperación (CTAs + destinos recomendados + soporte) para no perder al usuario.

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (marcos reales)**. `not-found.tsx` (server component) renderiza los componentes existentes `<Header />` y `<Footer />` envolviendo el contenido, igual que las demás páginas públicas. Se reutilizan los ya implementados — NO los header/footer del prototipo Stitch (specs SPEC-024).
- **RF-2 (badge de estado)**. Pill superior "Error 404 · Enlace no encontrado" con punto pulsante `animate-pulse` y token `primary-container`, separador visual con el hero.
- **RF-3 (hero visual "404 + QR")**. 
  - "404" tipográfico grande (responsive `text-[96px]`→`text-[140px]`, `font-extrabold`, `tracking-tighter`) con gradiente `from-on-surface to-surface-variant` y capa de glow `primary-container` blur (como la propuesta).
  - Tarjeta **QR real** (SVG 25×25 provisto por el usuario, 176px, fondo blanco, `shape-rendering: crispEdges`) en un contenedor `surface-card` con borde `outline-variant/30`, hover a `primary-container/50`. Se extrae a un componente `QRPlaceholder` reutilizable. Si el QR codifica un destino útil se enlaza; si no, queda `aria-hidden` como decorativo.
- **RF-4 (mensaje contextual)**. Título + subtítulo orientados a recuperación y al público de PortaQR (regalo del QR impreso / registro gratuito), sin inventar promesas que no existan.
- **RF-5 (CTAs primarios)**. Dos acciones:
  - **Primario** → "Crear cuenta gratis" → `/registro` (botón `bg-primary-container text-surface-base`, pill, glow hover, como el diseño system).
  - **Secundario/ghost** → "Ir a la página principal" → `/` (borde `outline-variant/40`, hover `surface-card`).
  - Reutilizar `Button` de `@/components/ui/button` cuando sea viable; si el estilo del diseño system difiere del token actual, usar clases del DS directamente.
- **RF-6 (grilla bento de destinos recomendados)**. Sección "Destinos recomendados" con 4 tarjetas (`/registro`, `/precios`, `/servicios`, `/faq`), cada una con icono en caja `surface-container-high`, título, descripción corta y link "Comenzar ahora / Ver tarifas / Explorar catálogo / Centro de ayuda" con `chevron_right` que se desplaza en hover. Grid responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, hover `-translate-y-0.5` + borde `primary-container/40`.
- **RF-7 (bloque de soporte — caso QR impreso)**. Panel inferior "¿Crees que esto es un error de un código QR impreso?" con mailto `contacto@portaqr.cl` + CTA "Hablar con soporte" → `/contacto`. WhatsApp **solo si** existe una constante de WhatsApp comercial; si no, se omite (ver RN-2).
- **RF-8 (estado visual)**. `main` con centrado vertical `flex-1 flex-col items-center justify-center`, glows ambientales decorativos (blobs `primary-container/10` y `secondary-container/20` con `blur-3xl/2xl`, `-z-10`), respetando el fondo `bg-background` y token `dark` permanentes de SPEC-025.

### 2.2 Reglas de negocio

- **RN-1 (continuidad del sitio)**. La 404 es una página pública: NO requiere sesión. Muestra siempre Header + Footer. No se añade a una ruta dinámica ni al dashboard.
- **RN-2 (enlaces verificados)**. Solo se enlazan rutas que existen: `/registro`, `/precios`, `/servicios`, `/faq`, `/contacto`, `/`, `/blog`. WhatsApp comercial es condicional (si hay constante) y se documenta.
- **RN-3 (SEO no indexable)**. La 404 no debe indexarse: se mantiene el comportamiento de `not-found` de Next.js (status 404). No se añade metadata indexable nueva.
- **RN-4 (decorativo vs. funcional)**. El QR mockup y los glows son decorativos → `aria-hidden="true"` / `pointer-events-none`. El contenido semántico (badge, título, descripción, CTAs, enlaces) usa landmark correcto (`<main>` y encabezados `h1`/`h2`).

### 2.3 Criterios de aceptación

- **CA-01**: Navegar a una URL inexistente muestra la nueva 404 con Header + Footer y status 404 real.
- **CA-02**: El hero muestra "404", el QR mockup SVG decorativo y el badge "Error 404 · Enlace no encontrado".
- **CA-03**: CTA primario → `/registro`; CTA secundario → `/`. La grilla bento enlaza `/registro`, `/precios`, `/servicios`, `/faq`.
- **CA-04**: El bloque de soporte muestra mailto `contacto@portaqr.cl` y CTA → `/contacto`.
- **CA-05**: Todos los enlaces del 404 apuntan a rutas existentes (verificación por test de rutas).
- **CA-06**: `tsc --noEmit`, `lint`, `jest` verdes + test unitario/RTL del 404 + E2E (Playwright) que visita una URL 404 y valida contenido + CTA + ruta 200 en destino.

## 3. Diseño Técnico

### 3.1 Estructura

```
not-found.tsx (server)
├─ <Header />                          // RF-1 (reutilizado de SPEC-024)
└─ <main id="contenido" ...>           // RF-8: centrado + glows ambientales
   ├─ Badge estado                     // RF-2
   ├─ Hero: "404" + <QRPlaceholder />  // RF-3
   ├─ h1 título + p subtítulo          // RF-4
   ├─ CTAs primarios                   // RF-5
   ├─ "Destinos recomendados" (bento)  // RF-6
   └─ Bloque soporte (QR impreso)      // RF-7
└─ <Footer />                          // RF-1
```

Nuevos archivos propuestos:
- `src/components/qr/QRPlaceholder.tsx` (o `src/components/NotFound/QRPlaceholder.tsx`): SVG vectorial del QR mockup (RF-3).
- Opcional: `src/components/NotFound/index.tsx` (server) con subcomponentes (`StatusBadge`, `DestinationCard`, `SupportBlock`) si el `not-found.tsx` crece demasiado; en V1 basta un archivo con constantes `DESTINATIONS` / `SUPPORT_EMAIL`.

| Archivo | Cambio |
|---|---|
| `src/app/not-found.tsx` | Reescribir: Header + contenido completo + Footer (RF-1..8). |
| `src/components/NotFound/QRPlaceholder.tsx` (nuevo) | SVG QR decorativo extraído de la propuesta (RF-3). |
| `not-found.spec.tsx` (nuevo) | RTL: renderiza Header/Footer, texto clave, enlaces correctos (CA-02..05). |
| `src/lib/routes.const.ts` (nuevo/opcional) | Constante `EXISTING_ROUTES` para validar que los links del 404 existen (CA-05). |
| `e2e-tests-portaqr` (ramas) | Spec 404: visitar URL inexistente → ver contenido + clic CTA → ruta destino 200 (CA-01/03). |

### 3.2 ADRs

> [!info] ADR-035.1 — ¿Componentes propios de la propuesta o reutilizar Header/Footer?
> **Decisión**: reutilizar los `Header`/`Footer` reales de `qr-app` (SPEC-024). La propuesta trae header/footer de prototipo con links distintos; duplicarlos crearía inconsistencia y dos fuentes de verdad de navegación. El valor de la propuesta está en el **hero y las secciones de retención**, no en sus marcos.

> [!info] ADR-035.2 — ¿Incluir barra de búsqueda?
> La propuesta incluye una barra de búsqueda ("¿Qué estabas buscando?"). **Fuera de alcance en V1**: `qr-app` no tiene backend de búsqueda de sitio. Se documenta como mejora futura (enlazar a `/faq` o `/ayuda` con query) para no entregar un input muerto.

> [!info] ADR-035.3 — ¿Modal de soporte o panel?
> **Decisión**: panel informativo con `mailto` + CTA `/contacto` (RFC-7). Un modal duplicaría el flujo de contacto existente y añade estado. El caso "QR impreso roto" queda bien servido con el correo y la página de contacto.

## 4. Referencias

- Propuesta Stitch: **"PortaQR - Error 404 (Propuesta Optimizada y Retención)"** — proyecto PortaQR Design System, pantalla `0b25301979e1444e82e9e71bfdca5f6d`.
- Design System Stitch PortaQR (tokens `#00C49F` primary-container, `surface-card`, glows) → alineado con `globals.css` / theme actual.
- Código actual: `desarrollo-qr/qr-app/src/app/not-found.tsx` (página mínima).
- Mockup visual (sin buscador, header/footer reales de qr-app): `docs/mockups/404-mockup.html` (+ `Logo_PortaQR_Horizontal_blanco.svg`).
- Componentes reutilizados: `src/components/Header`, `src/components/Footer`, `src/components/ui/button`.
- Rutas existentes verificadas: `/registro`, `/precios`, `/servicios`, `/faq`, `/contacto`, `/blog`.

## 5. Trade-offs

- **Pro**: 404 on-brand y consistente; retención vía destinos recomendados; resuelve el caso real del QR impreso roto; cero dependencias nuevas.
- **Contra**: sin barra de búsqueda (diferida por falta de backend); el hero QR es decorativo (no escaneable a un destino útil, evita falsas promesas).
- **Riesgo**: duplicar estilos del DS si `Button` no matchea el look pill/glow — se resuelve con clases del DS en el 404, no modificando `Button` globalmente.

---

| Fecha | Detalle |
|---|---|
| 2026-09-04 | **SPEC creada** (borrador) a partir de la propuesta Stitch de 404. Pendiente de implementación. |
| 2026-09-05 | **Fix altura**: el `overflow-hidden` directo en el `main` (flex-1) anulaba su min-height auto, recortaba ~219px y el footer se superponía al contenido. Glows movidos a wrapper absoluto con overflow-hidden (fuera de flujo). Verificado: recorte 0, footer al final del main, scroll normal. Commit fix + mockup espejado. |
| 2026-09-05 | **Implementada y verificada**: `qr-app@4b22ba8` (QRPlaceholder + not-found con Header/Footer reales, jest 632/632, tsc/lint limpios, build OK, verificado en vivo en dev), `e2e@4ad0e87` (3/3 chromium en vivo contra rama feat). Mockup en `docs/mockups/404-mockup.html` con paleta exacta del sitio (#061521/#00cab5) y QR real del usuario. Pendiente merge a main. |