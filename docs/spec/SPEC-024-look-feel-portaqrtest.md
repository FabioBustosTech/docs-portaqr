---
title: "SPEC-024: Adopción del nuevo look & feel (portaqrtest) en qr-app"
date: 2026-08-23
tags:
  - spec
  - frontend
  - ux-ui
  - landing
  - qr-app
  - design-system
  - shadcn
status: implementado
implementado: 2026-08-24
aliases:
  - SPEC-024
  - nuevo look and feel
  - migración portaqrtest
---

# SPEC-024: Adopción del nuevo look & feel (portaqrtest) en qr-app

> [!abstract] Decisión clave
> Adoptar el sistema de diseño del prototipo `desarrollo-qr/portaqrtest-main` (tokens shadcn/base-nova en OKLCH, header/footer nuevo, secciones de landing, animaciones `reveal`) dentro de `qr-app` **sin perder funcionalidad productiva**, mediante un **plan por sesiones** donde cada sesión es autocontenida, verificable (build + tests + revisión visual) y commiteable por separado. La estrategia es **puente de tokens + reemplazo por capas**: primero se instala la base visual sin cambiar nada visible, luego se reemplaza el *shell* público, la landing, las páginas públicas y finalmente las pantallas de autenticación — conservando siempre la lógica real (AuthContext, `/api/qr-free-generation`, precios con API de planes, blog ISR/Payload, Webpay).

> [!info] Metadatos
> - **Estado:** Implementado (2026-08-24) — Sesiones 1–6 completadas en `feat/spec-024-look-feel-portaqrtest`. QA final: tsc/lint/jest 384/384/build/doctor verdes + revisión visual light/dark. Pendiente solo revisión del usuario para merge a `main`.
> - **Deuda declarada (SPEC-025):** la capa puente legacy de `globals.css` (escalas `primary-NNN`/`accent-NNN`, utilidades `bg-light-*`/`bg-dark-*`/`text-light-*`/`text-dark-*`) se CONSERVA porque `dashboard/*`, `admin` y primitivas compartidas (Button, Input, Toast, dialog, checkbox, PaginationControls, ThemeToggle, QRCode/QrDisplay, formularios qr/pet-tag, cart) siguen referenciándolas. La superficie pública quedó 100% migrada y un test guardián (`src/legacy-tokens.guard.spec.ts`) impide reintroducirlas fuera del allowlist. SPEC-025 debe migrar esos usos a los tokens semánticos/`sidebar-*` y eliminar la capa puente completa.
> - **Fecha:** 2026-08-23
> - **Componente destino:** `desarrollo-qr/qr-app/`
> - **Origen del diseño:** `desarrollo-qr/portaqrtest-main/` (prototipo v0.app — solo referencia visual, NO se ejecuta ni se mergea)
> - **Rama base:** `feat/spec-023-blog-payload-cms-isr` (ajustado 2026-08-23: SPEC-024 se construye **sobre el blog**, no sobre `main`)
> - **Rama de trabajo:** `feat/spec-024-look-feel-portaqrtest` (creada desde `feat/spec-023-blog-payload-cms-isr`)
> - **Tags de seguridad (repo `qr-app`):** `pre-spec-023-blog-cms` → tip de `main` (`65ad8d9`, sin blog) · `pre-spec-024-look-feel` → tip de `feat/spec-023` (`14fbe97`, punto de restauración exacto pre-rediseño)
> - **Relacionado:** [[SPEC-018-rediseno-landing-ux-ui]] (sus objetivos quedan **subsumidos** por esta SPEC: el nuevo diseño ya resuelve jerarquía del hero, marquee accesible, skip-link, focus states y generador sin fricción), [[SPEC-004-B-no-giant-component-qr-app]] (recipe de refactor), [[SPEC-004-react-doctor-qr-app]] (baseline), [[SPEC-020-registro-simplificado-google-oauth]] (flujos auth a preservar), [[SPEC-023-blog-payload-cms-isr]] (blog a preservar)

---

## 1. Objetivo

Que `qr-app` (producción) se vea como el prototipo `portaqrtest-main` (nuevo look & feel) **sin romper ni perder** nada de lo que hoy funciona: autenticación JWT + Google OAuth, dashboard completo, generador QR conectado al backend, precios con planes reales, blog con CMS, Webpay, pet-tag, SEO/PWA y la suite de tests.

El problema central: `portaqrtest-main` es **solo una maqueta** — sus formularios de auth son mocks (`setTimeout`), su generador QR es 100% local (librería `qrcode` en canvas), sus precios y blog son estáticos, y no tiene dashboard, ni API routes, ni contextos. Un *copy-paste* directo destruiría la aplicación. Por eso la migración es **por capas y por sesiones**, copiando *presentación* y re-conectándola a la *lógica real* existente.

## 2. Análisis de compatibilidad

### 2.1 Stack — compatible de base

| Aspecto | qr-app (actual) | portaqrtest-main (nuevo) | Veredicto |
| --- | --- | --- | --- |
| Next.js | ^16.3.0 (App Router, `src/`) | 16.3.0 (App Router, sin `src/`) | ✅ Misma versión |
| React | ^19.2.8 | ^19 | ✅ Compatible |
| Tailwind | v4 (`@tailwindcss/postcss`) | v4 (`@tailwindcss/postcss`) | ✅ Misma generación |
| Tema | `next-themes` + clase `.dark`, default dark | `next-themes` + clase `.dark`, default dark | ✅ Mismo mecanismo |
| Fuente | Inter (`next/font/google`, className) | Inter (`next/font/google`, variable `--font-inter`) | ⚠️ Menor: unificar a variable |
| TypeScript | ^6.0.3 | 5.7.3 | ⚠️ qr-app es más nuevo; código ok |
| Package manager | npm | pnpm | ⚠️ No mezclar: instalar deps nuevas con npm en qr-app |

### 2.2 Dependencias nuevas a incorporar en qr-app

| Paquete | Uso en el nuevo look | ¿Existe en qr-app? |
| --- | --- | --- |
| `tw-animate-css` | Animaciones utilitarias (`animate-fade-up`, etc.) | ❌ Agregar (dev/runtime CSS) |
| `shadcn` (import `shadcn/tailwind.css`) | Base de tokens/componentes CLI | ❌ Evaluar: solo se usa el CSS base; alternativa: copiar el CSS resultante |
| `class-variance-authority` | Variantes del `Button` nuevo | ❌ Agregar pequeño |
| `@base-ui/react` | Primitivas del estilo base-nova | ❌ Solo si se adoptan componentes ui nuevos |
| `qrcode` + `@types/qrcode` | Generador demo local | ❌ **NO instalar**: qr-app usa el backend + `qrcode.react` |
| `@vercel/analytics` | Analytics en layout | ❌ **Opcional**: solo si se despliega en Vercel (Railway no lo aprovecha) |

Compartidas y reutilizables: `clsx`, `tailwind-merge`, `lucide-react`, `next-themes`.

### 2.3 Sistema de tokens — el mayor foco de riesgo

- **qr-app** usa tokens propios hex: escalas `primary-50..950` (gris) y `accent-50..950` (teal), `destructive`, utilidades custom `@utility bg-light-primary|secondary|tertiary`, `bg-dark-*`, `text-light-*`, `text-dark-*`, más hacks (`.alternate-bg`, `@media (color-gamut: p3)`, tooltip responsive).
- **portaqrtest** usa tokens semánticos shadcn en OKLCH: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `brand`, `brand-soft`, `chart-1..5`, `sidebar-*`, radios `--radius` derivados, keyframes `marquee`/`float`/`fade-up` y patrón `.reveal` con `prefers-reduced-motion`.

**Estrategia (RF-01): puente de tokens.** En la Sesión 1 se **agrega** el nuevo `@theme` shadcn sin tocar los tokens existentes, y se crea una capa de mapeo que hace que las utilidades antiguas (`bg-light-primary`, `text-dark-secondary`, etc.) resuelvan a los **mismos colores que hoy**, de modo que el render actual no cambie ni un píxel. Las pantallas migradas (Sesiones 2–5) usan directamente los tokens nuevos (`bg-background`, `bg-card`, `bg-brand`, `text-muted-foreground`…). La eliminación de tokens legacy queda para la Sesión 6, cuando ya nada los referencie (verificar con búsqueda global).

### 2.4 Superficie funcional de qr-app que NO existe en portaqrtest (no perder)

| Funcionalidad (qr-app) | Equivalente en el nuevo look | Acción |
| --- | --- | --- |
| Login/Signup reales (JWT, Google OAuth SPEC-020, `AuthContext`) | `auth-form.tsx` = **mock** | Re-skin del formulario real con `AuthShell` |
| `HomeQrGenerator` → `POST /api/qr-free-generation` | `qr-generator.tsx` = local/demo | Reskin conservando la llamada real; email vía progressive disclosure (RF-08 de SPEC-018) |
| `/precios` con planes desde API | `pricing.tsx` estático | Reskin con datos reales |
| Blog ISR + Payload CMS (SPEC-023) | blog estático demo | Reskin de `blog/page.tsx` y `blog/[slug]` conservando data fetching |
| Header con `AuthButtons` (menú autenticado), `ThemeToggle`, logo por tema (`useThemeState`), **nav con iconos (`Icon[name=home|settings|chart|blog|mail]`) + `Tooltip`** | `site-header.tsx` con botones estáticos, nav solo texto | Portar `SiteHeader` inyectando `AuthButtons`/`ThemeToggle`/logo actual **y conservando los iconos de la nav** (requisito explícito del usuario 2026-08-23) |
| Dashboard completo (`dashboard/*`, admin, settings, pet-tag) | No existe | **Out of scope** → futura SPEC-025 |
| `onboarding`, `forgot-password`, `verify-email`, `pet-tag/[idQr]`, `qr/[id]`, `qr-error`, `not-found` | No existe | Re-skin auth en Sesión 5; el resto se mantiene |
| Rutas informativas: `nosotros`, `productos`, `tipos-qr`, `tutoriales`, `documentacion`, `ayuda` | Solo `servicios/precios/faq/contacto/blog/legales` | Reskin en Sesión 4 |
| 17 API routes (`app/api/*`: auth, qr, webpay, cart, admin, mail, scan, statistics…) | Ninguna | **Intocables** |
| SEO/PWA: `sitemap.ts`, `manifest.json`, schema.org Organization, og-image, `pageMetadata` | Metadata básica v0.app | Conservar **todo** el metadata actual; solo ajustar fuente/tokens del layout |
| `ThemeInitializer` (fuerza dark inicial, storageKey `theme`) | ThemeProvider default dark | Conservar comportamiento |
| Tests (jest, `*.spec.tsx`) | Sin tests | Mantener y actualizar los afectados por cambio de markup |

## 3. Especificación — plan por sesiones

Cada sesión termina en un estado **build + tests verdes** y commit propio. Si una sesión se abandona a la mitad, `main` no se ve afectado (trabajo en rama feature).

### Sesión 1 — Fundación: tokens y dependencias (sin cambio visual)

- **RF-01.** Instalar deps (`class-variance-authority`, `tw-animate-css`; evaluar `shadcn`/CSS base). Crear/actualizar `components.json` (aliases a `src/`).
- **RF-02.** `globals.css`: incorporar `@theme` OKLCH del prototipo (light + `.dark`), keyframes `marquee/float/fade-up`, clases `.reveal`, `@custom-variant dark`. Mantener TODOS los tokens/utilidades actuales (`primary-*`, `accent-*`, `bg-light-*`, `text-dark-*`, tooltip, `alternate-bg`) como capa puente. Criterio duro: screenshot comparativo sin diferencias visibles.
- **RF-03.** Fuente Inter pasar a `variable: '--font-inter'` en `layout.tsx` conservando metadata completa.
- **Riesgo:** mezcla de tokens → se valida con revisión visual de home, login y dashboard (sin cambios).

### Sesión 2 — Shell público: header + footer

- **RF-04.** Portar `SiteHeader` (scroll blur, menú móvil con lock de scroll, `aria-current`) conectado a: `AuthButtons` real (estado autenticado), `ThemeToggle` real, logo actual por tema (`useThemeState`), nav con las rutas reales de qr-app (incl. las que no están en el prototipo si aplica).
- **RF-04c. Logo oficial (requisito explícito del usuario).** El logo de qr-app es el OFICIAL y NO se cambia: **NO se usa `porta-qr-logo.tsx` del prototipo** en ninguna pantalla. El header/nav (y cualquier componente migrado que lo referencie) usan siempre los assets actuales (`/PORTA_QR_LOGO_HORIZONTAL.svg` en light, `/Logo_PortaQR_Horizontal_blanco.svg` en dark) vía `useThemeState`, con el mismo tamaño y comportamiento actuales.
- **RF-04b. Iconos de navegación (requisito explícito del usuario).** La nav del header nuevo NO pierde los iconos actuales: cada enlace mantiene su `Icon` (`home`, `settings`, `chart`, `blog`, `mail`) junto al texto en desktop y móvil, y los `Tooltip` existentes. Se evalúa sustituir los SVG del componente `Icon` por `lucide-react` (librería del nuevo diseño) solo si la paridad visual es 1:1; ante la duda, se conserva `Icon` actual. Los `AuthButtons` (heroicons: `UserIcon`, `UserPlusIcon`, `ArrowLeftOnRectangleIcon`) también conservan sus iconos.
- **RF-05.** Portar el visual de `SiteFooter` nuevo **conservando el esquema de enlaces de qr-app** (requisito explícito del usuario 2026-08-23): columnas exactas **Empresa** (Contacto, Blog), **Productos** (Servicios, Precios), **Soporte** (Preguntas frecuentes), **Legal** (Política de privacidad, Términos de servicio, Política de cookies, Eliminación de datos) — solo los enlaces ACTIVOS actuales, sin reactivar los comentados; fila inferior con "© Porta QR" + "Síguenos en:" y los `SocialIcon` reales (facebook/portaqrcl, instagram/portaqrcl, youtube/@portaqrcl). **El footer sigue montando `ChatWindow`** (componente de chat en vivo — NO perderlo al reemplazar el Footer).
- **RF-06.** El header/footer nuevos aplican **solo a páginas públicas**. `dashboard/` mantiene su propio layout (`DashboardLayoutClient`) intacto.
- **RF-07.** Skip-link "Saltar al contenido" (RF-04 de SPEC-018) y focus states visibles.

### Sesión 3 — Landing (`/`)

- **RF-09a. Sección "Un Mundo de Posibilidades en un Solo QR" — logos (requisito explícito del usuario 2026-08-23).** La sección migra al patrón `Integrations` del prototipo (marquee con máscara de bordes, clon `aria-hidden`, pausa en hover/focus, `prefers-reduced-motion` — resuelve RF-03 de SPEC-018), **manteniendo la lista COMPLETA actual de 37 items** de `AnimatedLinkList` (Apple Music, Discord, Dropbox, Facebook, Facebook Messenger, GitHub, GitLab, Instagram, Line, LinkedIn, Google Maps, Meta, PedidosYa, Llamadas, Pinterest, PlayStation, Reddit, Skype, Slack, Snapchat, SoundCloud, Spotify, Steam, Telegram, TikTok, Tumblr, Twitch, Uber Eats, Vimeo, Web, WhatsApp, X, Xbox, YouTube, Google Drive, Miro, Notion) y el copy actual en español. **Regla de logos (doble):** (1) los componentes existentes en `src/components/icon/*.tsx` **NO se tocan** — quedan intactos; (2) se crean **versiones nuevas** de cada logo en la línea gráfica del prototipo (SVG a color de marca, estilo `public/brands/*.svg`), en `qr-app/public/brands/`. Cobertura: 9 ya existen en el prototipo (instagram, facebook, whatsapp, youtube, tiktok, linkedin, spotify, telegram, github — se copian); **25 deben generarse/conseguirse en la misma línea gráfica** (fuente canónica: [Simple Icons](https://simpleicons.org), licencia CC0 — misma línea que los del prototipo; se descargan como SVG y se revisan a ojo en light/dark); 3 items genéricos (Google Maps, Llamadas, Web) usan iconos `lucide-react` (`MapPin`, `Phone`, `Globe`) como hace el prototipo. Criterio de aceptación: las 37 etiquetas aparecen en el marquee con logo nuevo (o icono genérico), y un diff visual confirma que ningún icono viejo fue modificado.
- **RF-08.** Reemplazar secciones de `HomePageClient` por: `Hero`, `Integrations` (marquee accesible: clon `aria-hidden`, pausa hover/focus, `prefers-reduced-motion`), `HowItWorks`, `HomeVisualShowcase`, `Features`, `CtaSection`.
- **RF-09.** Generador QR: nuevo diseño de panel pelado sobre el flujo REAL (`/api/qr-free-generation`), con preview live y email opcional (progressive disclosure). NO usar el generador local del prototipo.
- **RF-10.** Home con metadata actual intacta (`pageMetadata`).
- **Verificación:** flujo de generación QR gratis end-to-end en local contra backend.

### Sesión 4 — Páginas públicas secundarias

- **RF-11.** Reskin de: `servicios`, `precios` (datos reales de API de planes), `faq`, `contacto` (`ContactForm` real → `/api/mail`), `blog` + `blog/[slug]` (ISR/Payload intacto), legales (`privacidad`, `terminos`, `cookies`, `eliminacion-de-datos`) con `LegalPage`, y extendidas (`nosotros`, `productos`, `tipos-qr`, `tutoriales`, `documentacion`, `ayuda`).
- **RF-11a. Tooltip informativo "Página de aterrizaje" (requisito explícito del usuario).** En `/precios`, el plan **QR Multi Link** tiene en su feature "Página de aterrizaje" un icono informativo (`Tooltip` con texto: *"Una página de aterrizaje es un sitio web personalizado que se muestra cuando se escanea el QR. Permite agregar más información y funcionalidades al código QR."* — `src/app/precios/page.tsx` líneas 133-139). Este elemento **NO debe perderse** en el rediseño del pricing: se conserva el texto, el comportamiento (tooltip accesible, responsive — ver CSS `tooltip-content` móvil) y su asociación exclusiva al plan QR Multi Link.
- **RF-12.** Patrón `PageHero` común para títulos de sección.
- **RF-12b. Blog (validado contra prototipo el 2026-08-23, screenshots en ambos entornos).** qr-app es **funcionalmente superior** (filtrado server-side por `?q/tag/category/page` en MongoDB/Payload, ISR 60s, redirect 301 `?category=` → `/blog/categoria/<slug>`, contadores reales, "Limpiar filtros", destacado global/por categoría, fallback de imagen SPEC-023-E) — toda esa lógica se conserva intacta. Del prototipo se adopta **solo lo visual**: (a) hero con kicker uppercase + título grande + tarjeta visual a la derecha (con contadores reales `total`/`allTags.length`); (b) destacado con tarjeta meta flotante (categoría + "min de lectura · fecha") sobre la imagen; (c) tarjetas 2 cols (línea de chips activa `bg-brand`, kicker categoría + tiempo de lectura en la fila superior, hover lift, fila final "fecha · autor" + "Leer artículo"); (d) estilo de paginación y estado vacío. **No se adopta** el filtrado client-side del prototipo (`BlogControls` filtra en memoria con PAGE_SIZE=4) ni sus datos estáticos. **Bugs visuales detectados en qr-app actual a corregir en esta migración:** tarjetas sin cover muestran un "Porta QR" flotante que parece roto (BlogPostCard.tsx líneas 58-62), el destacado muestra un placeholder "Imagen no disponible" feo cuando falta imagen, y las tarjetas tienen alturas desiguales (grid sin `h-full`).
- **RF-12a. Páginas legales (requisito explícito del usuario 2026-08-23).** Los **textos legales de qr-app se mantienen íntegros** (los arrays `sections` de `privacidad/page.tsx`, `terminos/page.tsx`, `cookies`, `eliminacion-de-datos` no se reescriben ni se reemplazan por el `legal-page.tsx` del prototipo). Se mantiene la **estructura con sidebar de contenido** del `TermsPageClient` actual: `aside` sticky (`top-24`, `w-64`, `hidden lg:block`) con navegación de secciones y **scroll-spy** (listener con offset 128px que marca la sección activa: `text-accent-500 bg-accent-500/10 border-l-2`), tarjeta de contenido con secciones por `id` + `scroll-mt-24`, y bloque final de Contacto (mailto contacto@portaqr.cl + link a /contacto). Lo que migra es **solo lo visual** (paleta, fondos, radios, tipografía según tokens nuevos: `bg-card`, `text-muted-foreground`, activo → `text-primary`/`bg-primary/10` o `brand`), conservando ids, anchors, aria-labels y comportamiento. Requisito de aceptación: el sidebar resalta la sección correcta al hacer scroll, igual que hoy.

### Sesión 5 — Pantallas de autenticación

- **RF-13.** Reskin con `AuthShell`/estilos de `auth-form` para: `login`, `signup` (incl. Google OAuth SPEC-020), `forgot-password`, `verify-email`, `onboarding`. La lógica (contexto, servicios, validaciones, `PasswordStrengthMeter`, `TermsModal`) se conserva; solo cambia la presentación.
- **RF-14.** Estados de error/loading/éxito visibles con tokens nuevos.

### Sesión 6 — Limpieza, iconos y cierre

- **RF-15.** Eliminar tokens legacy sin referencias (búsqueda global `bg-light-|bg-dark-|text-light-|text-dark-|primary-\d|accent-\d` en `src/`), quitar hacks reemplazados, consolidar iconos/favicons del nuevo diseño si el usuario los aprueba (mantener los actuales de producción por defecto).
- **RF-16.** QA final: `npm run tsxValidate`, `npm run lint`, `npm test`, `npm run build`, `npm run doctor`, revisión visual light/dark de TODAS las rutas, Suite Postman/Newman de contrato intacta (no se toca la API). Actualizar SPEC-018 como subsumida.

### Definición de listo por sesión (DoD)

1. `npm run tsxValidate` y `npm run lint` sin errores; `npm test` verde (tests tocados actualizados).
2. `npm run build` exitoso.
3. Revisión visual manual (light + dark, desktop + móvil) de las rutas de la sesión.
4. Commit en `feat/spec-024-look-feel-portaqrtest` con mensaje descriptivo.
5. Nada de lógica de negocio modificada (diff debe ser presentacional salvo los puntos RF-09/RF-13 donde la conexión es explícita).

## 4. Diseño técnico

```
qr-app/src/
├── app/
│   ├── globals.css          # Sesión 1: @theme OKLCH nuevo + capa puente legacy
│   ├── layout.tsx           # Sesión 1: Inter variable; metadata actual conservada
│   ├── page.tsx             # Sesión 3: nueva composición landing
│   ├── (públicas)/*         # Sesión 4: reskin
│   ├── login|signup|…       # Sesión 5: reskin auth
│   ├── dashboard/           # NO SE TOCA (out of scope)
│   └── api/                 # NO SE TOCA
├── components/
│   ├── ui/                  # Sesión 1: + button.tsx (cva) si se adopta
│   ├── layout/ (o site/)    # Sesión 2: SiteHeader, SiteFooter (nuevos, conectan con
│   │                        #   AuthButtons/ThemeToggle/useThemeState existentes)
│   ├── home/                # Sesión 3: hero, integrations, how-it-works,
│   │                        #   showcase, features, cta, QrGeneratorPanel (flujo real)
│   ├── reveal.tsx           # Sesión 1/3: patrón de animación al hacer scroll
│   └── auth/                # Sesión 5: AuthShell + reskins
├── contexts/  hooks/  services/  lib/   # INTACTOS (lógica real)
└── components/Header|Footer (legacy)    # Se eliminan al cierre de Sesión 4/5
```

**Mapeo conceptual de tokens (ejemplos):**

| Legacy qr-app | Nuevo (uso en pantallas migradas) |
| --- | --- |
| `bg-light-primary` / `dark:bg-dark-primary` | `bg-background` |
| `bg-light-secondary` / `bg-dark-secondary` | `bg-card` / `bg-secondary` |
| `text-primary-*` | `text-foreground` / `text-muted-foreground` |
| `bg-accent-500` (teal) | `bg-brand` / `bg-primary-button` |
| `border-slate-200/700` | `border-border` |

> [!warning] Renombres deliberados (descubrimiento en Sesión 1)
> El prototipo usa `bg-primary` y `bg-accent` a secas, pero en qr-app **ya existen clases dormidas** con esos nombres (`components/ui/button.tsx`, `switch.tsx`, `dialog.tsx`, `select.tsx`, y páginas `dashboard/qr/pay`, `forgot-password`, `qr/[id]/error`, etc.) que hoy NO compilan a nada (no hay tokens `--color-primary`/`--color-accent` definidos). Si los definiéramos, esas clases "despertarían" y cambiarían el visual del dashboard (out of scope). Por eso los semánticos nuevos se publican como `--color-primary-button` y `--color-accent-new` (utilities `bg-primary-button`, `bg-accent-new`). **Al portar código del prototipo: `bg-primary`→`bg-primary-button`, `bg-accent`→`bg-accent-new`** (lo mismo para `-foreground`). Registrado para la futura SPEC-025 (dashboard): esas clases dormidas deben revisarse/activarse a propósito.

**Consultas del prototipo (origen visual):** `portaqrtest-main/app/globals.css`, `components/site-header.tsx`, `components/site-footer.tsx`, `components/hero.tsx`, `components/qr-generator.tsx` (solo clases), `components/auth-shell.tsx`.

## 5. Mockups / Referencias

- Prototipo ejecutable: `desarrollo-qr/portaqrtest-main` (`pnpm dev`, ver puerto en `scripts/next-with-port.mjs`).
- Referencia de diseño previa: [[SPEC-018-rediseno-landing-ux-ui]] §2 (RF-01..RF-07 ya cubiertos por el prototipo).

## 6. Trade-offs

| Decisión | Alternativa | Razón |
| --- | --- | --- |
| Puente de tokens + migración por capas | Reescritura/merge directo del prototipo | El prototipo carece de toda la lógica real; copiarlo rompería auth, Webpay, dashboard y SEO |
| Sesiones cerradas con DoD | Big-bang en una sola entrega | Riesgo de regresión visual/funcional imposible de aislar; plan acordado con el usuario ("plan por sesión para no perder nada") |
| Conservar npm en qr-app | Migrar a pnpm | Cambio ortogonal y riesgoso en medio del rediseño |
| No adoptar `qrcode` (generador local) | Usar el generador demo del prototipo | El flujo real registra el QR en backend/analítica; el demo solo pinta un canvas |
| Dashboard out of scope | Rediseñar todo el producto | El prototipo no incluye dashboard; merece su propia SPEC (SPEC-025) con sus tokens `sidebar-*` |
| SPEC-018 subsumida | Ejecutar SPEC-018 y luego esta | Doble trabajo sobre la misma landing; los RF de SPEC-018 se marcan como cubiertos por el nuevo diseño |
| `@vercel/analytics` opcional | Instalarlo | Plataforma destino es Railway, no Vercel |

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Cambio visual accidental en páginas no migradas | Medio | Capa puente con valores idénticos + screenshots comparativos en Sesión 1 |
| Perder estado autenticado en header nuevo | Alto | RF-04 exige `AuthButtons` real; probar login/logout manualmente |
| Romper generador QR gratis | Alto | Sesión 3 conserva la llamada real; verificación end-to-end |
| Tests con queries por clase/markup fallan | Medio | Actualizar specs afectados en la propia sesión (DoD) |
| Tokens legacy olvidados | Bajo | Búsqueda global en Sesión 6 antes de borrar |
| `shadcn/tailwind.css` del CLI no resoluble en npm/next build | Bajo | Alternativa documentada: copiar el CSS base resultante |

## 8. Tareas

Registradas en `docs/tareas/SPEC-024-tareas.json` (una tarea por sesión, con subtareas verificables).
