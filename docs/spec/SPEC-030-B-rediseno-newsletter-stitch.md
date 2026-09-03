---
title: "SPEC-030-B: Rediseño sección newsletter con sistema Stitch"
date: 2026-09-03
tags:
  - spec
  - newsletter
  - qr-app
  - ux-ui
  - stitch
status: implementado
aliases:
  - SPEC-030-B
  - newsletter stitch
  - rediseño newsletter
---

# SPEC-030-B: Rediseño sección newsletter con sistema Stitch

> [!abstract] Decisión clave
> Rediseñar `NewsletterSection`/`NewsletterSubscribe` de `qr-app` con el lenguaje del proyecto Stitch **PortaQR Design System** (pantallas "Rediseño Componente Newsletter" y "Newsletter Contenido de Valor"): isla oscura (`#121D2F`, borde mint con glow), badge "NEWSLETTER MENSUAL · 0% SPAM", línea de lead magnet, CTA pill mint full-width, microcopy legal y fila de confianza. **Alcance cerrado**: solo el componente newsletter (decisión usuario 2026-09-03); el resto de `qr-app` no se toca. Cero cambios de comportamiento (doble opt-in, honeypot, consent, throttle) y se suma el eslabón faltante del diseño: **reenvío de confirmación** ("¿No llegó? Reenviar correo" → proxy nuevo a `resend-confirm` del CMS).

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-03)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-app/` (`NewsletterSubscribe`, `NewsletterSection`, proxies, `/newsletter`)
> - **Origen:** Proyecto Stitch `17646060013543541217` ("PortaQR Design System"), pantallas "Rediseño Componente Newsletter" (`c1cb18ea…`), "Newsletter Contenido de Valor (Blog & Estrategia)" (`1b1332ca…`) y "Newsletter con Cumplimiento Legal Chile" (`762716ee…`). Tokens: canvas `#0B111E`, card `#121D2F`, primario mint `#00C49F` + glow `rgba(0,196,159,.28)`, texto `#FFFFFF`, muted `#94A3B8`, Inter, radius 16px card / pill CTA, inputs `#121D2F` borde `rgba(148,163,184,.2)`.
> - **Infraestructura reutilizada:** `NewsletterSubscribe` (hook + estados), proxies `/api/newsletter/*`, endpoint CMS `resend-confirm` (SPEC-030, sin UI hasta hoy).

---

## 1. Objetivo

1. Que la sección newsletter de `qr-app` hable el idioma Stitch (dark + mint) como **isla visual autocontenida**, sin migrar el tema global.
2. Subir conversión con los patrones del diseño: badge anti-spam, lead magnet, CTA único prominente, microcopy legal y prueba social (fila de confianza).
3. Cerrar el loop del doble opt-in en UI: estado de éxito estilo "Variante C" + **reenviar confirmación** (hoy el CMS lo soporta pero no hay UI).
4. Mantener intactos: accesibilidad (labels, roles, foco), anti-spam (honeypot con nombre sin token, consent obligatorio), y fuentes de verdad (CMS).

### 1.1 Out of scope

- **NO** reskin global de `qr-app` (home/blog/precios/dashboard conservan su tema).
- **NO** modal de salida (Variante A del diseño) ni banner horizontal (Variante B): solo la tarjeta/section (se evalúan aparte con métricas).
- **NO** PDF lead magnet real: el texto del incentivo es prop configurable; el asset se resuelve en contenido/otra spec.
- **NO** cambios en CMS/backend (el endpoint `resend-confirm` ya existe).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

- **RF-1 (isla dark/mint)**. `NewsletterSection` + `NewsletterSubscribe` con tokens Stitch hardcodeados en clases scoped (no tocan el tema global): card `bg-[#121D2F]` borde `border-[rgba(0,196,159,0.25)]` + glow `shadow-[0_0_24px_-4px_rgba(0,196,159,0.28)]` radius 16px; título `#FFFFFF`; descripción `#94A3B8`; inputs `bg-[#121D2F]` (o `#0B111E` en card) borde `rgba(148,163,184,.2)`, texto `#FFFFFF`, placeholder `#94A3B8`, foco borde `#00C49F` + ring `rgba(0,196,159,.18)`; CTA pill `bg-[#00C49F]` texto `#0B111E` bold; checkbox selected `#00C49F`. Inter ya es la fuente del proyecto.
- **RF-2 (badge + lead magnet + confianza)**. Nuevas props: `badge?: string` (default `"NEWSLETTER MENSUAL · 0% SPAM"`, pill `rgba(0,196,159,.12)` texto `#00C49F` borde `rgba(0,196,159,.25)`), `leadMagnet?: string` (línea con icono 🎁, default texto guía del diseño), `trustItems?: string[]` (default `["1 correo al mes", "Sin compromisos", "Contenido 100% accionable"]`, checks mint). Todo opcional y testeado.
- **RF-3 (microcopy legal)**. Bajo el CTA: "Sin spam. Protegemos tus datos conforme a [Política de Privacidad](/privacidad#newsletter). Baja en 1 clic." (conserva el link existente).
- **RF-4 (éxito estilo Variante C + reenvío)**. Estado `pending-confirmation`: icono check en círculo mint + título "¡Ya estás casi listo!" + texto "Revisa tu correo para confirmar…" + link-button "¿No llegó? Reenviar correo" → `POST /api/newsletter/resend-confirm { email }` (proxy **nuevo**, forward al CMS; throttle del CMS 5/hora + mensajes genéricos). Guarda el email en estado para el reenvío (el form se limpia igual que hoy).
- **RF-5 (proxy resend-confirm)**. `qr-app/src/app/api/newsletter/resend-confirm/route.ts`: forward a `{CMS_URL}/api/newsletter/resend-confirm`, propaga status/body, 502 genérico si el CMS cae. Con `route.spec.ts`.
- **RF-6 (sin regresión visual fuera del componente)**. Home/blog/`/newsletter`/footer: mismo layout, solo cambia el interior de la sección. Los `source`/`variant`/contratos de props existentes se mantienen (aditivos).

### 2.2 Reglas de negocio

- **RN-1**. Cero cambios de comportamiento: doble opt-in, consent obligatorio no premarcado, honeypot `contact_notes_extra`, mensajes genéricos, throttle.
- **RN-2**. El estilo dark vive **solo** dentro de la sección (clases scoped con valores literales, sin variables globales ni `dark:` overrides).
- **RN-3**. El reenvío nunca revela existencia (mensaje genérico siempre, como el CMS).
- **RN-4**. Contraste WCAG AA en la isla (blanco sobre `#121D2F`, mint solo en acentos grandes/bold ≥14px o UI no-textual).

### 2.3 Criterios de aceptación (CA)

- **CA-01**: `/newsletter` muestra badge, título, lead magnet, email+nombre, checkbox, CTA mint pill y fila de confianza con los tokens exactos (verificado por spec RTL: clases/roles).
- **CA-02**: suscripción exitosa → estado "¡Ya estás casi listo!" + link reenviar; clic en reenviar → `POST` al proxy con `{ email }` y mensaje genérico (mock).
- **CA-03**: proxy `resend-confirm` reenvía body/status y responde 502 genérico con CMS caído (spec).
- **CA-04**: `tsc` + `lint` + suite `qr-app` verdes (76+ suites sin regresión); E2E newsletter existentes pasan (selectores por rol/label intactos).
- **CA-05** (manual/visual): captura en home, blog y `/newsletter` vs pantallas Stitch (badge, CTA, microcopy, footer de página intacto).

---

## 3. Diseño Técnico

### 3.1 Cambios por archivo (`qr-app`, rama `feat/spec-030-newsletter` — misma rama, decisión usuario)

| Archivo | Cambio |
| --- | --- |
| `src/components/NewsletterSubscribe/useNewsletterSubscribe.ts` | Guarda `lastEmail` para reenvío; `resend()` → proxy nuevo (estados `resending/resent`) |
| `src/components/NewsletterSubscribe/index.tsx` | Estilos isla dark/mint + badge/leadMagnet/trustItems + éxito Variante C con reenviar |
| `src/components/NewsletterSubscribe/NewsletterSubscribe.spec.tsx` | Tests RF-1..RF-4 (clases, props, reenvío, sin regresión de validaciones) |
| `src/components/NewsletterSection/index.tsx` | Pasa nuevas props (defaults del diseño); spec actualizada |
| `src/app/api/newsletter/resend-confirm/route.ts` + spec | RF-5 (forward + 502 genérico) |
| `e2e-tests-portaqr/tests/newsletter/*` | Sin cambios salvo que un selector rompa (verificar) |

### 3.2 Contratos (sin cambios salvo adición)

```
POST /api/newsletter/resend-confirm   NUEVO (proxy): { email } → { ok: true, message } | 502
```

Props nuevas (todas opcionales, con defaults del diseño Stitch):
```ts
badge?: string        // default 'NEWSLETTER MENSUAL · 0% SPAM'
leadMagnet?: string   // default 'Incluye gratis: Guía de 15 ideas de QR para aumentar ventas'
trustItems?: string[] // default ['1 correo al mes','Sin compromisos','Contenido 100% accionable']
```

---

## 4. Mockups / Referencias

- Stitch `17646060013543541217`: pantallas `c1cb18ea…` (componente + variantes A/B/C), `1b1332ca…` (blog & estrategia), `762716ee…` (opt-in legal Chile).
- Tokens en metadatos (primario `#00C49F`, card `#121D2F`, glow, Inter, pill CTA, inputs).
- Código base: `NewsletterSubscribe/` + `NewsletterSection/` (SPEC-030 T6), proxy pattern (`subscribe`), endpoint CMS `resend-confirm` (SPEC-030 T2).

---

## 5. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| Isla dark scoped vs tema global | Cero riesgo al resto; reversible | Dos idiomas visuales conviviendo | ✅ Isla (alcance usuario) |
| Reenvío en UI vs solo email | Cierra el loop (Variante C pide "Reenviar correo") | 1 proxy + estados nuevos | ✅ Con reenvío (RF-4/5) |
| Modal salida (A) / banner (B) ahora vs después | Más conversión potencial | Más superficie + métricas pendientes | ❌ Después, con datos |
| Lead magnet con PDF real vs texto | Incentivo completo | Asset no existe | ❌ Texto configurable (contenido lo resuelve) |

---

## 6. Producción y calidad

- Sin vars nuevas (reutiliza `CMS_URL`). Sin cambios CMS/backend.
- `tsc --noEmit` + `lint` + `jest` verdes; E2E newsletter sin cambios de selectores.
- Revisión visual en navegador (home/blog/`/newsletter`) vs Stitch.

## 7. Tareas

- [ ] `docs/tareas/SPEC-030-B-tareas.json` (formato Taskmaster).
- [ ] Rama `feat/spec-030-newsletter` (misma rama SPEC-030, decisión usuario; e2e si aplica).

## 8. Referencias

- [[SPEC-030-newsletter-cms-suscripciones]] — componente actual, proxies, doble opt-in, resend-confirm en CMS.
- Stitch `17646060013543541217` — pantallas newsletter citadas en metadatos.

---

## 9. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-09-03 | **Implementada** en rama `feat/spec-030-newsletter` (qr-app, misma rama): `54dba70` isla dark/mint, `a8e57db` badge/lead/confianza, `489eb94` éxito Variante C + proxy resend-confirm, `e2aa670` defaults + full 564/564. Visual verificado en navegador vs Stitch. |
| 2026-09-03 | **Ajuste v2 usuario**: pantalla correcta es "Contenido de Valor" (artículos destacados, NO regalo). Props editoriales (`consentText`, `ctaLabel`, `microcopy`, `featuredArticle`, `successTitle/Subtitle/Article` con `{privacidad}` inline); Section con defaults edición mensual; leadMagnet oculto sin prop. Commit `f8e82af`, suite 566/566, visual verificado. |
| 2026-09-03 | **SPEC creada** (borrador). Base 100% Stitch (pantallas + tokens volcados en metadatos). Alcance cerrado por usuario: solo componente + solo newsletter. |
