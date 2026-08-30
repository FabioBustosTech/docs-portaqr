---
title: "SPEC-026: Rediseño del checkout de pago QR (dashboard/qr/pay) — UI + UX"
date: 2026-08-29
tags:
  - spec
  - frontend
  - dashboard
  - checkout
  - webpay
  - qr-app
  - ux
status: borrador
aliases:
  - SPEC-026
  - rediseño checkout pago
  - dashboard qr pay
---

# SPEC-026: Rediseño del checkout de pago QR (`dashboard/qr/pay`) — UI + UX

> [!abstract] Decisión clave
> Rediseñar la pantalla de pago `/dashboard/qr/pay` con alcance **UI + UX**: eliminar el Total duplicado, agregar indicador de pasos (Plan → Pago → Confirmación), separar visualmente resumen de compra / facturación / método de pago, mostrar el método de pago WebPay con señales de confianza, botones consistentes y validación inline mejorada. Se presentan **dos alternativas de layout** (A: 2 columnas con resumen sticky; B: 1 columna centrada mejorada) y se deja la elección al usuario. **Sin cambios de contrato API ni de lógica de pago**: la orquestación WebPay (`pay.helpers.ts`, `handlePayment`) queda intacta.

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-29
> - **Componente destino:** `desarrollo-qr/qr-app/src/app/dashboard/qr/pay/` (`page.tsx`, `PayCartSummary.tsx`, `PayInvoiceFields.tsx`, `pay.helpers.ts`)
> - **Origen del estudio:** revisión en navegador 2026-08-29 (usuario `fernando`, QR `8c248f5f-f8dc-4a94-b377-d8d4a11e4b8c`, plan 1 año $35.000)
> - **Rama base:** `main` (o la rama activa de SPEC-025 si está en curso)
> - **Rama de trabajo:** `feat/spec-026-checkout-pago`
> - **Relacionado:** [[SPEC-025-colores-internos-dashboard]] (paleta re-tokenizada — usar tokens semánticos nuevos), [[SPEC-012-fix-facturacion-webpay-documenttype]] (bug documentType corregido — no re-introducir), [[SPEC-004-B-no-giant-component-qr-app]] (orquestador delgado — mantener), [[SPEC-009-hardening-autorizacion-autenticacion-backend-portaqr]] (contrato WebPay — no tocar)

---

## 1. Objetivo

Que el flujo de activación de QR (selección de plan → pago → confirmación) comunique claramente **qué se está comprando, cuánto cuesta, cómo se paga y en qué paso del flujo está el usuario**, con un diseño consistente con la paleta nueva (SPEC-024/025) y sin tocar la lógica de pago existente. La spec cubre **tres pantallas**: la Etapa 1 (`/dashboard/qr/activate` — selección de plan), la Etapa 2 (`/dashboard/qr/pay` — checkout) y la Etapa 3 (`/dashboard/qr/pay/webpay` — confirmación con estados éxito/error).

## 2. Estado actual — inventario real (2026-08-29)

### 2.1 Flujo de llegada

```
CAMINO 1 — "Proceder al Pago" (1 item, reemplaza el carrito):
/dashboard/qr  →  seleccionar QR no inactivo  →  botón "activar"
  →  /dashboard/qr/activate?id=<uuid>&typeQr=<tipo>   (elegir plan)
  →  "Proceder al Pago"  →  clearCart() + addToCart(item)  →  /dashboard/qr/pay

CAMINO 2 — "Agregar al Carrito" (ACUMULA varios QRs):
/dashboard/qr  →  activar QR A  →  "Agregar al Carrito"  →  /dashboard/qr
  →  activar QR B  →  "Agregar al Carrito"  →  /dashboard/qr  (repetible)
  →  abrir carrito (icono header)  →  CartSidebar con TODOS los items  →  "Pagar"
  →  /dashboard/qr/pay   ← la Etapa 2 debe considerar TODOS los QRs del carrito

Ambos caminos terminan en:
  →  "Pagar con WebPay"  →  WebPay  →  /dashboard/qr/pay/webpay?token_ws=...
```

> [!important] Caso multi-item (decisión del usuario 2026-08-29)
> El carrito puede contener **varios QRs** (el flujo "Agregar al Carrito" acumula; `CartSidebar` tiene botón "Pagar" que navega a `/dashboard/qr/pay` con todos los items). La Etapa 2 debe mostrar **todos** los QRs: resumen de compra (lista completa), resumen del pedido (items compactos + subtotal + total = suma), y la Etapa 3 debe listar **todos** los "QR Codes Activados". El código actual ya itera `cartItems.map` y `calculateTotal` suma — el rediseño debe preservarlo y el mockup lo refleja (3 QRs: Multi links $35.000 + Dinámico $20.000 + VCard $30.000 = $85.000).

> [!success] Backend multi-QR VERIFICADO (2026-08-29)
> El backend **soporta múltiples QRs por compra** en todo el pipeline:
> - **DTO** `CreateQrActivateDto.qrList: QRElementDto[]` — array de QRs (cada uno con `qrCode` + `planId` + `expirationDate` + `duration`, SIN `price`).
> - **Schema** `qractivates.qrList: Array<{qrCode, price, expirationDate, duration, plan}>` + índice `{ 'qrList.qrCode': 1 }`.
> - **Create** (`create-qr-activate.usecase.ts`): itera `dto.qrList` — valida plan (404 si no existe) y QR (404 inexistente / 403 ajeno) por item, suma precios → snapshot `price.TotalPrice` + IVA 19%.
> - **Commit WebPay** (`update-webpay-qr-activate.usecase.ts`): `activation.qrList.map(qr => qr.qrCode)` → `activateMany` (batch atómico) + **verifica que el monto cobrado por Transbank coincida con el snapshot** (`price.TotalPrice !== commitResult.amount` → FAILED, no activa).
> - **Admin** (`executeAdmin`): `activateMany(codes, ...)` — batch.
> - **Correo de activación** (SPEC-019): lista todos los QRs de `qrList`.

### 2.2 Estructura actual de la pantalla

| Sección | Componente | Contenido |
| --- | --- | --- |
| Resumen de compra | `PayCartSummary.tsx` | Título "Resumen de Compra" + por item: `QR Code: {uuid}` (crudo), `Duración: {duration}`, precio es-CL + **Total** |
| Datos de facturación | `page.tsx` + `PayInvoiceFields.tsx` | Select "Tipo de Documento *" (Boleta/Factura) + si Factura: RUT, Razón Social, Dirección, Giro |
| Footer | `page.tsx` | **Total (repetido)** + "Serás redirigido a WebPay..." + botones `volver` (minúscula) y `Proceder al Pago` (deshabilitado sin tipo doc) |

### 2.3 Datos disponibles (sin cambios de contrato)

```ts
// CartItem (src/interfaces/cart.ts)
{ qrCode: string; price: number; planId: string; duration: string; typeQr?: string }
// Ejemplo real: { qrCode: "8c248f5f-f8dc-4a94-b377-d8d4a11e4b8c", price: 35000,
//                planId: "...", duration: "1 año", typeQr: "list" }
```

- `typeQr` **sí viaja** en el payload (lo envía `activate/page.tsx` al agregar al carrito) → se puede mostrar un badge de tipo sin fetch adicional.
- El nombre legible del QR **no está** en el carrito (habría que hacer `QrService.getQrById`). **Decisión del usuario: mantener los datos tal como están hoy** → se muestra el UUID (con truncado visual opcional) y el badge `typeQr`.

## 3. Problemas identificados

| # | Problema | Evidencia | Impacto |
| --- | --- | --- | --- |
| P1 | **Total duplicado** | Aparece en `PayCartSummary` y otra vez en el footer | Confusión sobre cuál es el total real |
| P2 | **QR como UUID crudo** | `QR Code: 8c248f5f-f8dc-4a94-b377-d8d4a11e4b8c` | El usuario no reconoce qué está comprando |
| P3 | **Sin contexto de navegación** | No hay breadcrumb ni indicador de pasos | El usuario no sabe en qué etapa del flujo está |
| P4 | **Método de pago invisible** | Solo un texto "Serás redirigido a WebPay..." | No se comunica cómo se pagará ni genera confianza |
| P5 | **Botón "volver" inconsistente** | `variant="outline"` + `text-white` + `hover:bg-accent-600` + minúscula | Rompe la consistencia visual del portal |
| P6 | **Botón de pago deshabilitado sin explicación** | `disabled` hasta elegir tipo de documento | El usuario no sabe qué falta completar |
| P7 | **Estilos legacy** | `bg-gray-50`, `dark:bg-gray-800`, `text-accent-500` | No usa los tokens semánticos de SPEC-024/025 |
| P8 | **Sin estado de carga visible en el botón** | Solo cambia el texto a "Procesando..." | No hay feedback visual de progreso |
| P9 | **Sin señales de seguridad** | No hay candado ni micro-copy de confianza | Baja confianza al momento de pagar |
| P10 | **Responsive básico** | `max-w-3xl` centrado, 1 columna siempre | No aprovecha el espacio en desktop |

## 3.1 Invariantes de seguridad del backend (YA implementados — el rediseño NO debe romperlos)

> [!important] Requisitos de seguridad del flujo de activación
> Verificados en `backend-portaqr` (2026-08-29). El backend **ya valida** los 4 invariantes; el rediseño del frontend debe **preservarlos** y la QA debe **verificarlos** (no re-introducir regresiones).

| # | Invariante | Dónde se valida (backend) | Comportamiento |
| --- | --- | --- | --- |
| S1 | **Un usuario solo activa QRs suyos** | `create-qr-activate.usecase.ts` L46-51 + L87-93 | Usuario `user`: si `dto.userId !== actor.id` → `403 Forbidden`. Por QR: si `qr.userId !== targetUserId` → `403 Forbidden` |
| S2 | **No se puede activar un QR inexistente** | `create-qr-activate.usecase.ts` L88 (`getQrUseCase.execute`) | QR inexistente → `404 Not Found` |
| S3 | **El precio lo asigna el backend desde el plan (snapshot)** | `create-qr-activate.usecase.ts` L70-102 + DTO `QRElementDto` (SIN campo `price`) | El cliente envía SOLO `planId`; el backend obtiene `plan.price` y congela el snapshot + IVA 19% (`TAX_RATE`). Un `price` enviado por el cliente es **ignorado** (no existe en el DTO) |
| S4 | **Flujo admin vs usuario** | Controller L68-71 + `execute()`/`executeAdmin()` | `methodActivation === 'ADMIN'` → `executeAdmin` (admin activa POR un cliente: `targetUserId = dto.userId \|\| actor.id`, state `ADMIN`, activa QRs en batch + correo al cliente). Usuario → `execute` (solo para sí mismo, state `PENDING`) |

**Reglas para el frontend (qr-app):**
- `buildWebpayActivation` (pay.helpers.ts) **NO envía `price`** — solo `planId`, `qrCode`, `expirationDate`, `duration` (verificado: ya es así, SPEC-009 B12). **No volver a añadir `price` al payload.**
- El `price` que muestra el checkout es **solo visual** (viene del carrito, que lo copió del plan al agregar). El backend recalcula el real.
- El `userId` del payload de activación: el usuario `user` NO debe poder enviar un `userId` distinto al suyo (el backend lo rechaza con 403). El frontend envía `user.id` del token.
- El flujo admin (`/dashboard/admin/qr/activate/send`) es **otra pantalla** — el rediseño de esta spec NO la toca (pero comparte `CheckoutSteps` y `humanizeTypeQr` si se desea).

## 3.2 Visibilidad de URLs del flujo (verificado 2026-08-29)

> [!info] Modelo de seguridad
> Backend: `JwtAuthGuard` **global** (APP_GUARD) — todo requiere JWT salvo `@Public()`. Frontend: los route handlers (proxies) llaman `getAuthUser()` → 401 sin sesión; las páginas viven bajo el layout `/dashboard` (protegido por `AuthContext`).

### Páginas del frontend (qr-app)

| Ruta | Visibilidad | Protección |
| --- | --- | --- |
| `/dashboard/qr/activate` (Etapa 1) | 🔒 **Privada** | Layout `/dashboard` (AuthContext) |
| `/dashboard/qr/pay` (Etapa 2) | 🔒 **Privada** | Layout `/dashboard` (AuthContext) |
| `/dashboard/qr/pay/webpay` (Etapa 3) | 🔒 **Privada** | Layout `/dashboard` + el PATCH proxy exige sesión |

### Endpoints del backend (backend-portaqr) y sus proxies (qr-app)

| Endpoint backend | Método | Backend | Proxy frontend | Visibilidad efectiva |
| --- | --- | --- | --- | --- |
| `/qr-activate` | POST | `@Roles('admin','user')` | `/api/qr-activate` (auth) | 🔒 **Privado** |
| `/qr-activate` | GET | `@Roles('admin','user')` + filtro por userId si no es admin | `/api/qr-activate` (auth) | 🔒 **Privado** |
| `/qr-activate/:id` | GET | `@Roles('admin','user')` + `assertOwnerOrAdmin` | `/api/qr-activate/[id]` (auth) | 🔒 **Privado** |
| `/qr-activate/:id` | PATCH | `@Roles('admin','user')` + `assertOwnerOrAdmin` | `/api/qr-activate/[id]` (auth) | 🔒 **Privado** |
| `/qr-activate/:id` | DELETE | `@Roles('admin')` | `/api/qr-activate/[id]` (auth) | 🔒 **Privado (solo admin)** |
| `/qr-activate/webpay/:token_ws` | PATCH | **`@Public()`** | `/api/qr-activate/webpay/[token_ws]` (**auth → 401 sin sesión**) | ⚠️ **Backend público / Frontend privado** |
| `/webpay/create` | POST | `@RolesGuard` (JWT global) + sessionId del token | `/api/webpay/create` (auth) | 🔒 **Privado** |
| `/webpay/return` | GET | **`@Public()`** (redirige a success/fail/error) | `/api/webpay/return` (**auth → 401 sin sesión**) | ⚠️ **Backend público / Frontend privado** |
| `/webpay/status` | GET | `@RolesGuard` + `assertOwnerOrAdmin(tx.sessionId)` | `/api/webpay/status` (auth) | 🔒 **Privado** |
| `/webpay/transaction/:token` | GET | `@RolesGuard` + `assertOwnerOrAdmin(tx.sessionId)` | `/api/webpay/transaction/[token]` (auth) | 🔒 **Privado** |
| `/webpay/refund` | POST | `@Roles('admin')` | `/api/webpay/refund` (auth) | 🔒 **Privado (solo admin)** |

### Hallazgos / riesgos

| # | Hallazgo | Impacto | Recomendación |
| --- | --- | --- | --- |
| U1 | `PATCH /qr-activate/webpay/:token_ws` y `GET /webpay/return` son `@Public()` en el backend (WebPay redirige sin JWT), **pero** los proxies del frontend exigen sesión (`getAuthUser()` → 401) | Si la sesión expira durante el pago, el retorno de WebPay falla en el frontend (la página webpay no podría commitear el token) | Documentar como riesgo conocido; mitigación: sesión larga/refresh (ya existe `useInactivityTimeout` + refresh), o en el estado de error de la Etapa 3 ofrecer "Intentar Nuevamente" (que re-loguea si hace falta). **No cambiar la seguridad sin spec aparte** |
| U2 | El `token_ws` actúa como bearer implícito en el PATCH público del backend | Si alguien obtiene el token_ws puede commitear la transacción | Es el diseño actual de WebPay (token de un solo uso); el frontend lo protege con sesión. Sin cambios en esta spec |
| U3 | `GET /webpay/return` del backend redirige a `WEBPAY_SUCCESS_URL/FAIL_URL/ERROR_URL` (`/dashboard/qr/pay/webpay?status=...`), pero el proxy `create` setea `returnUrl` directo a la página — dos caminos de retorno coexisten | Confusión menor; ambos terminan en la misma página | No tocar en esta spec; documentar para futuro |

## 4. Propuesta de diseño (UI + UX)

### 4.1 Principios

1. **Una sola fuente de verdad para el total**: el Total se muestra UNA vez (en el resumen del pedido), nunca duplicado.
2. **Jerarquía clara**: 3 bloques visualmente separados — (1) qué compro, (2) datos de facturación, (3) cómo pago.
3. **Contexto de flujo**: indicador de pasos `Plan → Pago → Confirmación` con el paso actual resaltado.
4. **Confianza**: método de pago WebPay visible con icono + candado + micro-copy de seguridad.
5. **Consistencia**: tokens semánticos nuevos (`bg-card`, `text-foreground`, `bg-brand`, `border`, `muted-foreground`), botones con variantes correctas, textos capitalizados.
6. **Accesibilidad**: labels asociados, errores inline con `aria-describedby`, foco visible, `prefers-reduced-motion` respetado.
7. **Cero cambios de lógica**: `pay.helpers.ts`, `handlePayment`, contrato WebPay y `QrActivateService` intactos.

### 4.2 Componentes propuestos

| Componente | Rol | Cambio |
| --- | --- | --- |
| `CheckoutSteps` (nuevo) | Indicador de pasos Plan → Pago → Confirmación | Nuevo |
| `PayCartSummary` | Resumen de compra (items + badge tipo + duración + precio) | Refactor visual (sin Total) |
| `PayInvoiceFields` | Campos de facturación gated por documentType | Refactor visual + errores inline |
| `PayOrderSummary` (nuevo) | Resumen del pedido: items compactos + subtotal + **Total único** | Nuevo (reemplaza el Total del footer) |
| `PayMethodCard` (nuevo) | Tarjeta de método de pago WebPay + candado | Nuevo |
| `page.tsx` | Orquestador: layout 2 col (A) o 1 col (B), estados, validación | Refactor |

### 4.3 Mejoras UX transversales (ambas alternativas)

- **Indicador de pasos**: `1 Plan → 2 Pago (activo) → 3 Confirmación`. El paso 1 enlaza a `/dashboard/qr/activate` (si `typeQr`/`qrCode` disponible) o a `/dashboard/qr`.
- **Badge de tipo de QR**: chip pequeño con `typeQr` humanizado (`list` → "Multi links", `dynamic` → "Dinámico", `vcard` → "VCard", `pet` → "Mascota", etc.) — mapeo en `pay.helpers.ts` (función pura, testeable).
- **UUID truncado visualmente**: `8c248f5f-f8dc-…` con `title` completo (tooltip nativo) — sin fetch.
- **Validación inline mejorada**: errores bajo cada campo con `aria-describedby`; el botón de pago muestra un hint ("Selecciona el tipo de documento para continuar") en vez de estar mudo deshabilitado.
- **Estado de carga**: spinner dentro del botón + texto "Procesando..." + `disabled`; micro-copy "No cierres esta ventana".
- **Señales de seguridad**: candado + "Pago seguro con WebPay" + "Transacción cifrada de extremo a extremo".
- **Botones**: primario `bg-brand hover:bg-accent-600` (o `bg-primary-button`), secundario `variant="outline"`, ambos capitalizados y full-width en el bloque de pago.
- **Breadcrumb**: "← Volver a Mis QRs" arriba (enlace a `/dashboard/qr`).

## 5. Mockups

> [!note] Mockups
> Existe un **mockup interactivo HTML/CSS/JS** (fuera del repo, `Temp/opencode/mockup-checkout-pay.html`) que cubre el flujo completo de 3 pasos: **Etapa 1 (Selección de Plan)** → **Etapa 2 (Pago)** → **Etapa 3 (Confirmación)**. **Decisiones del usuario (2026-08-29): se eligió la Alternativa B (1 columna centrada) y SOLO modo oscuro** (la app ya no tiene modo claro — `.dark` permanente). El mockup ya no tiene toggle de layout ni de tema. Usa la paleta real de la app y datos reales (QR `8c248f5f-…`, plan "Multi Link" $35.000/1 año). Aquí se documentan los mockups en ASCII para referencia; la Alternativa A (2 columnas) queda documentada como descartada en §5.4.

### 5.0 Etapa 1 — Selección de Plan (`/dashboard/qr/activate`)

La primera etapa del flujo (elegir plan) con el nuevo estilo: breadcrumb, indicador de pasos con el paso 1 activo, título + contexto del QR que se activa, y grid de cards de planes con badge "Popular", detalles con checkmarks y acciones por card.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  DashboardHeader (sticky): [logo] Panel de Administración   fernando  [🛒 1] [⏻]  │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ← Volver a Mis QRs                                                                 │
│                                                                                    │
│  ●───○───○                                                                          │
│  1    2    3        (1 Plan ● activo · 2 Pago ○ · 3 Confirmación ○)                │
│                                                                                    │
│                    Selecciona un Plan                                               │
│                    [Multi links] Activando QR 8c248f5f-f8dc-4a94-b377-…             │
│                                                                                    │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐            │
│  │ Multi Link         │  │ Multi Link         │  │ Multi Link         │            │
│  │                    │  │      [Popular]     │  │                    │            │
│  │ $20.000 /6 meses   │  │ $35.000 /1 año     │  │ $60.000 /2 años    │            │
│  │ Activa tu QR...    │  │ Activa tu QR...    │  │ Activa tu QR...    │            │
│  │ ✓ acceso Ilimitado │  │ ✓ acceso Ilimitado │  │ ✓ acceso Ilimitado │            │
│  │ ✓ Escaneo Ilimit.  │  │ ✓ Escaneo Ilimit.  │  │ ✓ Escaneo Ilimit.  │            │
│  │ ✓ Cambios Ilimit.  │  │ ✓ Cambios Ilimit.  │  │ ✓ Cambios Ilimit.  │            │
│  │                    │  │                    │  │                    │            │
│  │ [Agregar al Carrito]│  │ [Agregar al Carrito]│  │ [Agregar al Carrito]│           │
│  │ [Proceder al Pago] │  │ [Proceder al Pago] │  │ [Proceder al Pago] │            │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘            │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas de la Etapa 1:**
- Solo existe el plan real **"Multi Link" 1 año · $35.000** (verificado en navegador 2026-08-29). Las cards de 6 meses y 2 años son variantes de ejemplo para visualizar el grid.
- "Proceder al Pago" limpia el carrito, agrega el item y navega a la Etapa 2 (comportamiento actual de `activate/page.tsx` — no cambia).
- "Agregar al Carrito" mantiene el comportamiento actual (agrega y vuelve a `/dashboard/qr`).

### 5.1 Etapa 2 — Alternativa A: 2 columnas (checkout moderno) — ❌ DESCARTADA

> [!warning] Descartada por el usuario (2026-08-29)
> Se eligió la **Alternativa B** (1 columna centrada). Esta sección se conserva como registro de la alternativa evaluada.

Desktop: columna izquierda (principal, ~2/3) + columna derecha sticky (~1/3). Mobile: se apila (resumen del pedido primero o al final según decisión de implementación — recomendado: al final, tras los datos).

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  DashboardHeader (sticky): [logo] Panel de Administración   fernando  [🛒 1] [⏻]  │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ← Volver a Mis QRs                                                                 │
│                                                                                    │
│  ●───●───○                                                                          │
│  1    2    3        (1 Plan ✓ · 2 Pago ● activo · 3 Confirmación ○)                │
│                                                                                    │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Resumen de Compra                        │  │ Resumen del Pedido              │  │
│  │                                          │  │ ┌─────────────────────────────┐ │  │
│  │ ┌──────────────────────────────────────┐ │  │ │ [QR] 8c248f5f-f8dc-…        │ │  │
│  │ │ [QR icon] 8c248f5f-f8dc-4a94-b377-…  │ │  │ │ [Multi links] · 1 año       │ │  │
│  │ │ [Multi links]  Duración: 1 año       │ │  │ │              $35.000        │ │  │
│  │ │                      $35.000         │ │  │ └─────────────────────────────┘ │  │
│  │ └──────────────────────────────────────┘ │  │ ───────────────────────────────  │  │
│  │                                          │  │ Subtotal              $35.000    │  │
│  │ Datos de Facturación                     │  │ Total                 $35.000    │  │
│  │                                          │  │ ───────────────────────────────  │  │
│  │ Tipo de Documento *                      │  │ Método de Pago                   │  │
│  │ ┌──────────────────────────────────────┐ │  │ ┌─────────────────────────────┐ │  │
│  │ │ [Boleta ▾]                          │ │  │ │ [WebPay logo] WebPay         │ │  │
│  │ └──────────────────────────────────────┘ │  │ │ 🔒 Pago seguro               │ │  │
│  │                                          │  │ └─────────────────────────────┘ │  │
│  │ (si Factura: RUT · Razón Social ·        │  │                                  │  │
│  │  Dirección · Giro — grid 2 cols)         │  │ [Pagar con WebPay]  ← primario  │  │
│  │                                          │  │ [Volver]            ← outline   │  │
│  │                                          │  │ 🔒 Transacción cifrada de       │  │
│  │                                          │  │    extremo a extremo            │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas de la Alternativa A:**
- La columna derecha es `sticky top-*` (bajo el header) — el resumen y el botón de pago siempre visibles al hacer scroll.
- El Total vive **solo** en "Resumen del Pedido" (P1 resuelto).
- El botón de pago es full-width de la columna derecha.
- Mobile: 1 columna — orden: pasos → resumen de compra → facturación → método de pago → botón pagar → volver.

### 5.2 Etapa 2 — Alternativa B: 1 columna centrada ✅ ELEGIDA

> [!abstract] Decisión del usuario (2026-08-29)
> **Alternativa B elegida** + **solo modo oscuro** (la app ya no tiene modo claro). El mockup interactivo refleja esta decisión (sin toggle de layout ni de tema).

Mantiene la tarjeta única centrada (`max-w-3xl`) pero con las mejoras UX: pasos, badges, total único, método de pago y botones consistentes.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  DashboardHeader (sticky): [logo] Panel de Administración   fernando  [🛒 1] [⏻]  │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ← Volver a Mis QRs                                                                 │
│                                                                                    │
│  ●───●───○   1 Plan ✓ · 2 Pago ● · 3 Confirmación ○                                │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐                  │
│  │ Resumen de Compra                                           │                  │
│  │ ┌────────────────────────────────────────────────────────┐  │                  │
│  │ │ [QR icon] 8c248f5f-f8dc-4a94-b377-d8d4a11e4b8c         │  │                  │
│  │ │ [Multi links]  Duración: 1 año              $35.000     │  │                  │
│  │ └────────────────────────────────────────────────────────┘  │                  │
│  │                                                            │                  │
│  │ Datos de Facturación                                       │                  │
│  │ Tipo de Documento *                                        │                  │
│  │ ┌────────────────────────────────────────────────────────┐  │                  │
│  │ │ [Boleta ▾]                                            │  │                  │
│  │ └────────────────────────────────────────────────────────┘  │                  │
│  │ (si Factura: RUT · Razón Social · Dirección · Giro)         │                  │
│  │                                                            │                  │
│  │ ─────────────────────────────────────────────────────────  │                  │
│  │ Subtotal                                        $35.000    │                  │
│  │ Total                                           $35.000    │                  │
│  │ ─────────────────────────────────────────────────────────  │                  │
│  │ Método de Pago                                            │                  │
│  │ ┌────────────────────────────────────────────────────────┐  │                  │
│  │ │ [WebPay logo] WebPay · 🔒 Pago seguro                 │  │                  │
│  │ └────────────────────────────────────────────────────────┘  │                  │
│  │                                                            │                  │
│  │ [Pagar con WebPay]  ← primario, full-width                 │                  │
│  │ [Volver]            ← outline, full-width                  │                  │
│  │ 🔒 Transacción cifrada de extremo a extremo                │                  │
│  └────────────────────────────────────────────────────────────┘                  │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas de la Alternativa B:**
- Cambio mínimo de estructura vs. actual (misma tarjeta centrada) — menor riesgo de regresión.
- El Total se muestra una sola vez (P1 resuelto) dentro de la tarjeta.
- El botón de pago queda al final de la tarjeta, full-width.
- **Multi-item**: el resumen de compra lista TODOS los QRs del carrito (cada uno con badge tipo + duración + precio); el resumen del pedido lista items compactos + Subtotal (suma) + Total; el título indica "(N QRs)". Verificado en mockup con 3 QRs → $85.000.

### 5.3 Etapa 3 — Confirmación (`/dashboard/qr/pay/webpay`)

Pantalla de resultado del pago con **dos estados** (éxito y error). Ambos muestran los **Detalles de la Transacción** (decisión del usuario 2026-08-29: en el error también debe verse la info de la transacción para poder reportarla a soporte). El estado de carga ("Procesando tu pago... / No cierres esta ventana") se mantiene como está hoy.

**Estado ÉXITO:**

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  DashboardHeader (sticky)                                                           │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ← Volver al Pago                                                                   │
│                                                                                    │
│  ●───●───●   1 Plan ✓ · 2 Pago ✓ · 3 Confirmación ●                                │
│                                                                                    │
│  ┌──────────────────────────────────────────────┐                                   │
│  │              [✓ verde grande]                │                                   │
│  │            ¡Pago Exitoso!                    │                                   │
│  │  Tu QR fue activado correctamente.           │                                   │
│  │  Ya puedes compartirlo.                      │                                   │
│  │                                              │                                   │
│  │  DETALLES DE LA TRANSACCIÓN                  │                                   │
│  │  ID de Transacción   01ab4b38-f53f-…         │                                   │
│  │  Fecha                29/08/2026, 12:34      │                                   │
│  │  Total                $35.000                │                                   │
│  │                                              │                                   │
│  │  QR CODES ACTIVADOS                          │                                   │
│  │  [Multi links] 8c248f5f-f8dc-… · 1 año       │                                   │
│  │                                              │                                   │
│  │  [Ver mis QRs]            ← primario         │                                   │
│  │  [Descargar comprobante]  ← outline          │                                   │
│  └──────────────────────────────────────────────┘                                   │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Estado ERROR (con Detalles de la Transacción):**

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  DashboardHeader (sticky)                                                           │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ← Volver al Pago                                                                   │
│                                                                                    │
│  ●───●───●   1 Plan ✓ · 2 Pago ✓ · 3 Confirmación ●                                │
│                                                                                    │
│  ┌──────────────────────────────────────────────┐                                   │
│  │              [✗ rojo grande]                 │                                   │
│  │        Error en la Transacción               │                                   │
│  │  No pudimos procesar tu pago.                │                                   │
│  │  Por favor, intenta nuevamente. Si el        │                                   │
│  │  problema persiste, contacta a soporte.      │                                   │
│  │                                              │                                   │
│  │  DETALLES DE LA TRANSACCIÓN                  │                                   │
│  │  ID de Transacción   01ab4b38-f53f-…         │                                   │
│  │  Fecha                29/08/2026, 12:34      │                                   │
│  │  Total                $35.000                │                                   │
│  │  Estado               Rechazada              │                                   │
│  │                                              │                                   │
│  │  [Intentar Nuevamente]  ← primario           │                                   │
│  │  [Volver al Dashboard]  ← outline            │                                   │
│  └──────────────────────────────────────────────┘                                   │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas de la Etapa 3:**
- "Intentar Nuevamente" vuelve a la Etapa 2 (`/dashboard/qr/pay`).
- "Ver mis QRs" / "Volver al Dashboard" navegan a `/dashboard/qr`.
- El estado de carga actual (spinner + "Procesando tu pago... / Por favor, no cierres esta ventana") se conserva.
- La lógica de `webpay/page.tsx` (PATCH con `token_ws`, guard `startedRef` de StrictMode) NO cambia — solo el JSX.

### 5.4 Comparativa (registro de la evaluación)

| Criterio | A (2 columnas) | B (1 columna) ✅ |
| --- | --- | --- |
| Conversión (botón siempre visible) | ✅ sticky | ⚠️ requiere scroll |
| Claridad de jerarquía | ✅✅ | ✅ |
| Esfuerzo de implementación | Medio | Bajo |
| Riesgo de regresión | Medio | Bajo |
| Consistencia con el portal actual | Media (nuevo patrón) | Alta (evoluciona lo existente) |
| Mobile | ✅ apilado | ✅ natural |
| **Decisión final** | ❌ | ✅ **Elegida** |

## 6. Diseño técnico

```
src/app/dashboard/qr/activate/
└── page.tsx                 # REFACTOR visual — breadcrumb + pasos (1 activo) + grid de planes con badge Popular
                             #   (lógica addToCart/proceedToPayment INTACTA; solo JSX + tokens nuevos)

src/app/dashboard/qr/pay/
├── page.tsx                 # Orquestador: layout B, estados, validación, handlePayment (intacto)
├── pay.helpers.ts           # SIN cambios de lógica — el badge de tipo usa getQrTypeLabel (lib/qr-type-labels.ts, ya existe)
├── CheckoutSteps.tsx        # NUEVO — indicador de pasos (Plan/Pago/Confirmación), reutilizable en activate, pay y webpay
├── PayCartSummary.tsx       # REFACTOR — items + badge tipo (getQrTypeLabel) + duración + precio (SIN Total)
├── PayInvoiceFields.tsx     # REFACTOR — errores inline con aria-describedby
├── PayOrderSummary.tsx      # NUEVO — items compactos + subtotal + Total ÚNICO
└── PayMethodCard.tsx        # NUEVO — WebPay + candado + micro-copy seguridad

src/app/dashboard/qr/pay/webpay/
└── page.tsx                 # REFACTOR visual — CheckoutSteps (3 activo) + tarjeta de resultado con 2 estados:
                             #   ÉXITO (check verde, Detalles de la Transacción, QR activados, Ver mis QRs/Descargar)
                             #   ERROR (icono rojo, Detalles de la Transacción + Estado Rechazada, Intentar Nuevamente/Volver)
                             #   (lógica PATCH token_ws + guard startedRef INTACTA; solo JSX + tokens nuevos)
```

**Nota (2026-08-29):** el badge de tipo de QR usa `getQrTypeLabel` de `src/lib/qr-type-labels.ts` (SPEC-015, ya existe con tests) — **NO se crea `humanizeTypeQr`** (evita duplicación).

**Reglas:**
- **Cero cambios** en `pay.helpers.ts` de lógica de pago existente (`calculateTotal`, `validateInvoiceData`, `buildWebpayActivation`). Solo se AÑADE `humanizeTypeQr`.
- **Cero cambios** en `handlePayment` (page.tsx) ni en `addToCart`/`proceedToPayment` (activate/page.tsx) — solo se reubica/estiliza el JSX.
- `CheckoutSteps` se comparte entre ambas pantallas (activate: paso 1 activo; pay: paso 2 activo).
- Tokens semánticos nuevos: `bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-brand`, `bg-brand-soft`, `bg-secondary`, `rounded-xl/2xl`.
- El guardián `legacy-tokens.guard.spec.ts` (SPEC-017/025): los archivos tocados deben **reducir** su uso de tokens legacy (idealmente a 0) — no aumentarlo.
- Tests: unit tests para `humanizeTypeQr` (mapeo conocido + fallback) y mantener verdes los existentes (414+).

## 7. Trade-offs

| Decisión | Alternativa | Razón |
| --- | --- | --- |
| Mantener UUID crudo (decisión del usuario) | Fetch `QrService.getQrById` para nombre legible | Sin llamada extra ni latencia; el badge `typeQr` + truncado visual dan contexto suficiente. El fetch queda como mejora futura |
| Total único en el resumen del pedido | Mantener Total en footer | Elimina la ambigüedad (P1); el resumen del pedido es el lugar canónico |
| Badge `typeQr` humanizado | Mostrar `typeQr` crudo | Legibilidad sin costo (el dato ya viaja en el carrito) |
| **Alternativa B (1 columna)** | Alternativa A (2 columnas sticky) | **Decisión del usuario**: menor riesgo de regresión, consistente con el portal actual, evoluciona lo existente. A queda documentada como descartada |
| **Solo modo oscuro** | Mantener toggle claro/oscuro | **Decisión del usuario**: la app ya no tiene modo claro (`.dark` permanente — SPEC-025). Se usan solo los tokens dark |
| Sin cambios de contrato API | Cambiar payload para incluir nombre del QR | Riesgo alto, fuera de alcance; el backend calcula precios (SPEC-009 B12) |

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Regresión visual en dark mode | Medio | Revisión light/dark de la ruta completa (activate → pay → webpay) |
| Romper el guardián de tokens legacy | Bajo | Usar tokens semánticos nuevos; verificar `legacy-tokens.guard.spec.ts` verde |
| Re-introducir el bug documentType (SPEC-012) | Alto | Mantener el estado unificado `documentType`; no crear estados paralelos |
| Cambiar `handlePayment` por accidente | Alto | Congelar la lógica: solo se mueve JSX; diff revisado |
| Botón sticky tapa contenido en mobile | Bajo | En mobile el resumen no es sticky; apilado natural |

## 9. Criterios de aceptación (DoD)

1. `tsc --noEmit`, `lint`, `jest` (414+), `build` — verdes.
2. Guardián `legacy-tokens.guard.spec.ts` verde (sin aumento de tokens legacy en los archivos tocados).
3. Total mostrado **una sola vez** en la pantalla.
4. Indicador de pasos visible en las 3 pantallas (activate: 1 activo; pay: 2 activo; webpay: 3 activo).
5. Badge de tipo de QR visible (`Multi links` para `typeQr=list`).
6. Método de pago WebPay visible con candado y micro-copy de seguridad.
7. Botón de pago con estado de carga (spinner + "Procesando...") y hint cuando está deshabilitado.
8. Validación inline con `aria-describedby` en los campos de factura.
9. **Layout Alternativa B** (1 columna centrada `max-w-3xl`) en la Etapa 2 — sin layout A.
10. **Solo modo oscuro** — sin toggle de tema; tokens dark únicamente.
11. Etapa 3: Detalles de la Transacción visibles en **éxito Y error** (error incluye Estado "Rechazada").
12. Revisión visual en navegador (modo oscuro): flujo completo `activate → pay → webpay` (usuario con carrito).
13. `handlePayment`, `pay.helpers.ts` (lógica existente), `addToCart`/`proceedToPayment` y el PATCH de `webpay/page.tsx` sin cambios funcionales — verificado por diff.
14. **Invariantes de seguridad verificados** (S1-S4 de §3.1): `buildWebpayActivation` NO envía `price`; el payload de activación usa `user.id` del token (usuario `user`); el backend sigue rechazando con 403 un QR ajeno y con 404 un QR inexistente (tests del backend verdes — no se tocó backend).
15. **Sin cambios en el backend** (`backend-portaqr`): esta spec es 100% frontend (qr-app). Cualquier cambio de backend sería una spec aparte.
16. **Caso multi-item verificado**: con 2+ QRs en el carrito, la Etapa 2 muestra todos (resumen de compra + resumen del pedido con subtotal/total = suma) y la Etapa 3 lista todos los "QR Codes Activados". `buildWebpayActivation` envía `qrList` con todos los items.

## 10. Tareas

Registradas en `docs/tareas/SPEC-026-tareas.json`.