---
title: "SPEC-019: Correo de confirmación cuando un QR es activado"
date: 2026-08-17
tags:
  - spec
  - backend
  - email
  - notificacion
  - qr-activate
status: borrador
aliases:
  - SPEC-019
  - correo activacion qr
  - email qr activado
---

# SPEC-019: Correo de confirmación cuando un QR es activado

> [!abstract] Decisión clave
> Enviar un **correo transaccional de confirmación** al usuario dueño cada vez que sus QRs pasan a `active: true`. El envío se dispara **desde el backend monolito (`backend-portaqr`)** en los **dos únicos puntos de activación real** — el flujo Webpay pagado (`UpdateWebpayQrActivateUseCase` → `PAYED` → `activateMany`) y la activación admin (`CreateQrActivateUseCase.executeAdmin` → `activateMany`) — reutilizando el **`EmailService` existente** (nodemailer + templates EJS) con un **nuevo template `qrActivated.ejs`** que sigue **exactamente la línea gráfica de `registerEmail.ejs`/`passwordReset.ejs`** (azul `#1E3A8A`, grises `#4B5563`/`#E5E7EB`/`#F9FAFB`, botón CTA azul, footer `soporte@portaqr.cl`, responsive). **El template es SOLO modo claro** (sin `prefers-color-scheme: dark` — decisión del usuario 2026-08-17: un solo modo de correo, evita problemas de contraste). El correo incluye, **por cada QR activado**: la **imagen del QR** (PNG generado en backend con la librería `qrcode`, adjuntado vía `cid` — robusto en Gmail/Outlook/Apple Mail), su **página de aterrizaje** (`{FRONTEND_URL}/qr/{idQr}?origen=qr`), la **fecha de activación** (campo `activationDate`, que hoy existe en el schema pero **nunca se setea** — esta spec lo asigna en el momento de la activación) y la **fecha de cierre** (`qrList[].expirationDate`). El correo se envía al `email` del usuario resuelto vía `GetUserUseCase` (ya exportado por `UsersModule`) y es **best-effort**: si SMTP falla, la activación **no se revierte** ni falla (solo se loguea `email_activation_failed`). **No se toca `qr-app`** (el correo es 100% backend) ni `bff-service`/`user-service`/`qr-service` (deprecados, SPEC-001).

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** 2026-08-17
> - **Componente destino:** `desarrollo-qr/backend-portaqr/` (módulo `qr-activate`, `shared/email`, `src/templateEmail/`)
> - **Origen:** Requerimiento del usuario (2026-08-17): "crear spec para envío de correo cuando un QR es activado... en el mail podamos darle información al cliente: su QR en imagen, su página de aterrizaje, fecha de activación y fecha de cierre, y que el correo siga la misma línea gráfica de los demás correos". Se revisaron `qr-app` y `backend-portaqr`.
> - **Infraestructura reutilizada:** `EmailService` (`shared/email/email.service.ts` — nodemailer, SMTP_*), `EmailModule`, `GetUserUseCase` (módulo `users`), templates EJS (`src/templateEmail/`).
> - **Dependencia nueva:** `qrcode` (^1.5.x, CommonJS) en `backend-portaqr` — única librería nueva; el backend hoy no genera imágenes QR (el frontend usa `qrcode.react`).

---

## 1. Objetivo

1. Que el usuario reciba un **correo de confirmación** al momento en que sus códigos QR quedan **activos** (pago Webpay autorizado o activación realizada por un admin).
2. Que el correo incluya, **por cada QR activado**:
   - **Imagen del QR** (PNG escaneable, generada en el backend).
   - **Página de aterrizaje** (URL pública `{FRONTEND_URL}/qr/{idQr}?origen=qr` — la misma que codifica el QR).
   - **Fecha de activación** (día en que el QR quedó activo).
   - **Fecha de cierre** (expiración del plan contratado).
3. Que el correo siga **la misma línea gráfica** de los correos existentes (`registerEmail.ejs` / `passwordReset.ejs`).
4. Que el envío sea **transparente para el negocio**: un fallo de SMTP **nunca** debe dejar la activación inconsistente (el QR ya quedó activo; solo se registra el error).
5. Reutilizar la infraestructura de correo existente (`EmailService` + EJS) sin introducir colas ni servicios externos.

### 1.1 Out of scope

- **NO** se agrega UI en `qr-app` (la confirmación en pantalla ya existe en `/dashboard/qr/pay/webpay` y en el flujo admin).
- **NO** se crea cola/worker (BullMQ, etc.): el envío es síncrono best-effort (ver ADR-019.3).
- **NO** se usan servicios externos de generación de QR (api.qrserver.com, etc.): la imagen se genera localmente con `qrcode` (ADR-019.5).
- **NO** se envían correos por otros eventos (renovación, expiración, desactivación, scans): solo activación (futuras specs pueden reutilizar el mismo patrón).
- **NO** se modifica `bff-service` ni los microservicios `user-service`/`qr-service` (deprecados, SPEC-001).
- **NO** se implementa re-intento automático con backoff (se documenta como mejora futura, §6).
- **NO** se agrega tracking de apertura/clics del correo.
- **NO** se incluye el QR de placas PetTag (la activación de pet-tags es otro flujo, `pet-tag/activate`; el correo de esta spec cubre `qr-activate`).

---

## 2. Especificación

### 2.1 Requisitos funcionales (RF)

**Bloque A — Template y EmailService (backend)**

- **RF-1 (nuevo template EJS)**. `src/templateEmail/qrActivated.ejs`: template **idéntico en línea gráfica a `registerEmail.ejs`** (mismo CSS inline: body `#E5E7EB`, contenedor `#F9FAFB` radius 8px, título `#1E3A8A` 24px, texto `#4B5563` 16px, botón CTA `#1E3A8A` texto blanco, footer `#9CA3AF` con `soporte@portaqr.cl` y ©, `@media 600px`). **SOLO modo claro: NO incluye `@media (prefers-color-scheme: dark)`** (decisión del usuario 2026-08-17 — un solo modo de correo; los templates existentes sí lo traen, este no). Textos de la tarjeta con contraste alto sobre blanco: detalles `#374151`, título/links `#1E3A8A`, badge `#DBEAFE`/`#1E3A8A`. Con las secciones:
  - Header: **logo de Porta QR** (`<img src="{baseUrl}/PORTA_QR_LOGO_HORIZONTAL.png">`, ~200px ancho, **linkeado a `{baseUrl}`** — decisión usuario 2026-08-17) + título "¡Tu QR está activado!" (título + subtítulo con nombre del usuario).
  - **Tarjeta por QR** (una por código activado): imagen del QR (`<img src="cid:qr-{idQr}">`, ~160px, fondo blanco, borde) + datos del QR:
    - **Título**: `name` del QR **si existe** (solo los QRs multilink `list` tienen `name`/`description` — verificado 2026-08-17); si no existe, el **código** del QR (`QR #abc123`). Nunca se muestra un nombre vacío.
    - **Tipo de QR**: badge/chip con el label legible del tipo (`QR Dinámico`, `QR Multi links`, `QR WhatsApp`, etc. — ver RF-1.1), estilo `background #DBEAFE`, texto `#1E3A8A`, radius 12px, font-size 12px bold.
    - **Página de aterrizaje**: URL pública `{baseUrl}/qr/{idQr}?origen=qr` (texto + link).
    - **Fecha de activación**: `{activationDate}` formateada `dd/mm/yyyy`.
    - **Fecha de cierre**: `{expirationDate}` formateada `dd/mm/yyyy`.
  - Resumen: método de activación (Webpay/Admin) y total pagado (`$CLP` formateado).
  - **CTA**: botón "Ver mis QRs" → `{dashboardUrl}`.
  - Footer idéntico al de `registerEmail.ejs`.
  - Variables EJS: `userName`, `qrItems[]` (`{ code, name, typeLabel, plan, duration, activationDate, expirationDate, landingUrl }`), `methodActivation`, `totalPrice`, `dashboardUrl`, `baseUrl`.
- **RF-1.2 (logo en el correo)**. El header usa el **logo horizontal de Porta QR en PNG**: `{baseUrl}/PORTA_QR_LOGO_HORIZONTAL.png` (~200px ancho, `alt="Porta QR"`), envuelto en `<a href="{baseUrl}">`. **PNG, no SVG** — los clientes de correo (Gmail/Outlook/Yahoo) no renderizan SVG (ADR-019.7). El PNG se genera del SVG existente (`qr-app/public/PORTA_QR_LOGO_HORIZONTAL.svg`, ya público en `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.svg`) con `sharp` (400px ancho, 6.6 KB) y se agrega a `qr-app/public/PORTA_QR_LOGO_HORIZONTAL.png` → queda público en `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png` tras el próximo deploy de qr-app. **Requiere deploy de qr-app** (nuevo asset público) — ver §6.
- **RF-1.1 (mapa de labels de tipo QR en backend)**. El backend necesita su **propio mapa** `QR_TYPE_LABELS` (no puede importar del frontend) con los **12 tipos** del enum `QrType` (`create-qr.dto.ts`): `dynamic → 'QR Dinámico'`, `static → 'QR URL Estática'`, `whatsapp → 'QR WhatsApp'`, `email → 'QR Correo electrónico'`, `call → 'QR Llamada'`, `wifi → 'QR WiFi'`, `texto → 'QR Texto'`, `list → 'QR Multi links'`, `vcard → 'QR Tarjeta de contacto'`, `pet → 'QR Mascota'`, `phone → 'QR Teléfono'`, `map → 'QR Mapa'`. Mismo formato de labels que `qr-app/src/constants/qrTypes.ts` (los tipos `phone` y `map` no existen en ese mapa del frontend — se agregan aquí). Fallback: si `typeQr` no está en el mapa → mostrar el valor crudo.
- **RF-2 (nuevo método en EmailService)**. `sendQrActivatedEmail(payload: QrActivatedEmailPayload): Promise<void>`:
  - `payload = { to: string; userName: string; qrItems: Array<{ code: string; name?: string; typeQr: string; typeLabel: string; plan?: string; duration?: string; activationDate?: Date; expirationDate?: Date; landingUrl: string }>; methodActivation: string; totalPrice: number; }`.
  - **Genera el PNG del QR por cada item**: `QRCode.toBuffer(item.landingUrl, { width: 200, margin: 2, errorCorrectionLevel: 'H' })` (librería `qrcode`, nivel H = mismo que el frontend `QrDisplay`).
  - Renderiza `qrActivated.ejs` con `ejs.render` (mismo patrón que `sendVerificationEmail`).
  - `subject: 'Tus códigos QR han sido activados | Porta QR'`.
  - `from: EMAIL_FROM`, `to: payload.to`.
  - **Attachments con `cid`** (robusto en todos los clientes de correo): un attachment por QR → `{ filename: 'qr-{idQr}.png', content: pngBuffer, cid: 'qr-{idQr}' }` referenciado en el template como `<img src="cid:qr-{idQr}">`. **No** se usan data URIs (Outlook desktop las bloquea — ADR-019.5).
  - **Misma firma de errores** que los métodos existentes: `throw` en fallo (el caller decide si aborta o es best-effort) + logs `CustomLogger` (`Enviando email de activación a: ...`, `Email de activación enviado exitosamente a: ...`, `Error al enviar email de activación a ...`).
  - **RF-2.1 (flag de activación/desactivación)**. Variable de entorno `EMAIL_ACTIVATION_ENABLED` (**default `true`**): si es `'false'` (string explícito), `sendQrActivatedEmail` **no envía** — loguea `Envío de email de activación DESACTIVADO (EMAIL_ACTIVATION_ENABLED=false) — destinatario: ...` y retorna sin tocar `fs`/`ejs`/`QRCode`/`sendMail`. Cualquier otro valor o ausencia → envía. Motivo: desarrollo local (tests manuales de activación) sin mandar correos reales. Implementado en `EmailService` (infraestructura, bajo nivel) — los use cases no cambian.
- **RF-3 (unit tests EmailService)**. `email.service.spec.ts` extiende con: render correcto del template (llama a `transporter.sendMail` con `to`, `subject`, `html` conteniendo `cid:qr-...` y `landingUrl`), **attachments generados** (un `cid` por QR, buffer PNG no vacío), errores propagados, y mocks de `fs.readFileSync`/`ejs.render`/`QRCode.toBuffer` (mismo patrón de los specs existentes).

**Bloque B — Integración en la activación (módulo qr-activate)**

- **RF-4 (nuevo servicio de notificación)**. `modules/qr-activate/application/services/qr-activated-notification.service.ts`: orquesta **resolución de datos + envío**. **Respeta hexagonal (ADR-019.8)**: la capa de aplicación **nunca inyecta `EmailService`** (infraestructura concreta) — inyecta el **puerto `ICanSendQrActivatedEmail`** (token `QR_ACTIVATE_EMAIL_PORT`, binding `useExisting: EmailService` en el módulo). Las únicas clases concretas inyectadas son use cases de otros módulos (patrón establecido: `GetPlanUseCase`/`GetQrUseCase`/`CommitTransactionUseCase`):
  1. `GetUserUseCase.execute(activation.userId, tracking)` → `User` (404 si el usuario fue eliminado → **skip silencioso con warn**, no rompe la activación).
2. **Por cada QR de `qrList`**: `GetQrUseCase.execute(qr.qrCode, tracking)` → resuelve `typeQr` (el snapshot `QrElement` no lo guarda — solo `qrCode/price/expirationDate/duration/plan`, verificado 2026-08-17), `name` (solo QRs `list`), `description` y `idQr` (el **UUID público** del QR para la landing — FIX 2026-08-17: la página pública `/qr/[id]` busca por `idQr`, NO por el `_id` de Mongo; usar `qrDoc.id` daba 404). Arma `QrActivatedEmailPayload`:
      - `qrItems` → `{ code, name?, typeQr, typeLabel (mapa `QR_TYPE_LABELS`, RF-1.1), plan?, duration, activationDate, expirationDate, landingUrl: ${FRONTEND_URL}/qr/${qr.idQr}?origen=qr }`.
     - `userName = ${firstName} ${paternalLastName}`.
     - `totalPrice` del snapshot (`activation.price.TotalPrice` — RN-5).
     - `activationDate` = `activation.activationDate` (RF-8) con fallback `activation.createdAt`.
  3. `emailSender.sendQrActivatedEmail(payload)` (vía puerto) — **todo dentro de try/catch**: error → `traceService.error` + log `email_activation_failed { activationId, userId, reason }` y **no re-throw** (best-effort, ADR-019.2).
- **RF-5 (disparo en flujo Webpay)**. `UpdateWebpayQrActivateUseCase.execute()`: **después** del `activateMany` exitoso (rama `state = PAYED`, SPEC-009 B12 amount coincide) y **después** del `updater.update` (con `updated` — así el correo lee el `activationDate` ya persistido, ADR-019.6), invocar `notifyQrActivated(updated, tracking)` envuelto en try/catch defensivo (el servicio nunca re-throw por contrato, pero un fallo aquí jamás debe romper el callback de Webpay — RN-2). El `update` del estado se ejecuta siempre (el correo nunca bloquea la persistencia).
- **RF-6 (disparo en flujo admin)**. `CreateQrActivateUseCase.executeAdmin()`: **después** del `activateMany` exitoso, invocar `notifyQrActivated(created, tracking)`. La respuesta al admin no cambia.
- **RF-7 (wiring del módulo)**. `qr-activate.module.ts`:
  - Importar `UsersModule` (ya exporta `GetUserUseCase`) y `EmailModule` (exporta `EmailService`).
  - Registrar el servicio de notificación como provider.
  - **Binding del puerto de email** (ADR-019.8): `{ provide: QR_ACTIVATE_EMAIL_PORT, useExisting: EmailService }` — `EmailService` implementa estructuralmente `ICanSendQrActivatedEmail` (mismo patrón puerto→adaptador de `modules/mail` con `NodemailerContactAdapter`; sin duplicar nodemailer ni templates).
  - **No hay cambios de contrato de API** (no se exponen endpoints nuevos).
- **RF-8 (fecha de activación persistida)**. El campo `activationDate` existe en schema/entidad/mapper pero **nunca se asigna** (verificado 2026-08-17: `CreateQrActivateUseCase` no lo setea). Esta spec lo fija en el **momento en que los QRs quedan activos**:
  - `UpdateWebpayQrActivateUseCase`: en el `updater.update` de la rama PAYED → `{ state: PAYED, activationDate: new Date(), WebpayTransaction: {...} }`.
  - `CreateQrActivateUseCase.executeAdmin`: en el `creator.create` → `activationDate: new Date()` (la activación admin nace activa).
  - El correo lo usa como "fecha de activación" (RF-4.3). Sin esto, el correo no tendría fecha real de activación (solo `createdAt`, que en Webpay es la fecha del PENDING, no del pago).

### 2.2 Reglas de negocio

- **RN-1**. El correo se envía **solo cuando los QRs quedan efectivamente activos** (post-`activateMany` exitoso). Si el pago falla o el amount no coincide con el snapshot (SPEC-009 B12), **no** se envía.
- **RN-2**. El correo es **best-effort**: un fallo de SMTP, de render del template, de generación del PNG o de resolución del usuario **no** revierte ni falla la activación (el QR ya está activo en BD).
- **RN-3**. El destinatario es el **dueño de la activación** (`activation.userId`), no el admin que activa (el admin activa POR un cliente — SPEC-009 A3).
- **RN-4**. Si el usuario no existe (eliminado), se **omite** el envío con warn (sin excepción).
- **RN-5**. El correo usa datos ya persistidos en la activación (snapshot del plan, precio congelado, expiración) — **no** se consulta el plan de nuevo (consistencia con SPEC-009 B12).
- **RN-6**. No se envían correos duplicados: el flujo Webpay es idempotente (solo procesa `PENDING` una vez — el doble-fetch del frontend devuelve la activación ya procesada sin re-enviar).
- **RN-7**. La imagen del QR se genera **localmente** (librería `qrcode`) con la **misma URL que codifica el frontend** (`{FRONTEND_URL}/qr/{idQr}?origen=qr` — verificado en `QrDisplay.tsx`): el QR del correo es escaneable y lleva a la misma landing que el QR físico.
- **RN-8**. `activationDate` se persiste **una sola vez** en el momento de la activación (RF-8); no se re-escribe en updates posteriores (el `UpdateQrActivateDto` no lo expone — forbidNonWhitelisted).

### 2.3 Criterios de aceptación (CA)

- **CA-01**: activar QRs por Webpay (pago autorizado + amount coincide) → `EmailService.sendQrActivatedEmail` invocado con `to` = email del dueño, `qrItems` con todos los códigos de la compra y `totalPrice` del snapshot. Verificado con mock en unit test.
- **CA-02**: activación admin (`POST /qr-activate` con `methodActivation: ADMIN`) → mismo envío al **cliente** (`dto.userId`), no al admin.
- **CA-03**: fallo simulado de SMTP (mock `sendMail` rechaza) → la activación **queda PAYED/ADMINCREATED igual**, el `updater.update` corre, y se loguea `email_activation_failed` (sin excepción al cliente).
- **CA-04**: usuario dueño inexistente (`GetUserUseCase` 404) → **no** se envía correo, no se rompe la activación, warn en logs.
- **CA-05**: pago no autorizado o `amount` ≠ snapshot → **no** se envía correo (la activación queda FAILED).
- **CA-06**: el HTML renderizado contiene: nombre del usuario, **una `<img src="cid:qr-{idQr}">` por QR**, la landing URL `{FRONTEND_URL}/qr/{idQr}?origen=qr`, **fecha de activación** y **fecha de cierre** formateadas `dd/mm/yyyy`, total formateado (`$CLP`) y CTA a `/dashboard/qr`.
- **CA-07**: `sendMail` recibe **un attachment por QR** con `cid` único (`qr-{idQr}`) y `content` = buffer PNG no vacío (mock de `QRCode.toBuffer`).
- **CA-08**: tras una activación Webpay exitosa, el documento `qractivates` tiene `activationDate` persistido (≈ fecha del pago, no del PENDING); tras activación admin, `activationDate` = fecha de creación. Verificado con `mongosh`.
- **CA-09**: `tsc --noEmit` y suite jest verdes (unit: `EmailService` + use cases qr-activate con mocks). Sin regresión en SPEC-009/011/012 (webpay, idempotencia, documentType).
- **CA-10** (integración manual): transacción real en entorno local con SMTP configurado → correo recibido con imagen QR escaneable, landing, fechas correctas y línea gráfica idéntica a los correos existentes; con SMTP inválido → activación OK + `email_activation_failed` en logs.

---

## 3. Baseline del problema (verificado 2026-08-17)

| Aspecto | Comportamiento actual | Comportamiento esperado |
| --- | --- | --- |
| Activación Webpay | `UpdateWebpayQrActivateUseCase` — commit Transbank → `PAYED` + `activateMany` (L59-79) — **sin correo** | + notificación post-`activateMany` (RF-5) |
| Activación admin | `CreateQrActivateUseCase.executeAdmin` — `activateMany` batch (L139-156) — **sin correo** | + notificación post-`activateMany` (RF-6) |
| `activationDate` | Existe en schema/entidad/mapper (L18 schema, L72 entidad) pero **nunca se asigna** en los use cases | Se persiste en el momento de la activación (RF-8) |
| `EmailService` | `sendVerificationEmail`, `sendPasswordResetEmail` (nodemailer + EJS) | + `sendQrActivatedEmail` con attachments `cid` (RF-2) |
| Templates | `registerEmail.ejs`, `passwordReset.ejs` (azul `#1E3A8A`, grises, botón CTA, footer soporte, dark mode) | + `qrActivated.ejs` con **misma línea gráfica** (RF-1) pero **solo modo claro** (sin dark mode — decisión usuario 2026-08-17) |
| Generación de imagen QR | **No existe en backend** (frontend usa `qrcode.react` — `QrDisplay.tsx` codifica `{origin}/qr/{idQr}?origen=qr`) | + librería `qrcode` en backend, PNG por QR (RF-2, RN-7) |
| `QrActivateModule` imports | `CommonModule, WebpayModule, QrModule, PlanModule, MongooseModule` | + `UsersModule` + `EmailModule` (RF-7) |
| `GetUserUseCase` | Exportado por `UsersModule` (usa `USER_GET_PORT` → `getById`) | Reutilizado tal cual (RF-4) |
| Destino del correo | — (no existe) | `User.email` del dueño de la activación (RN-3) |
| Fallo SMTP | — (no existe) | Best-effort: log `email_activation_failed`, activación intacta (RN-2, CA-03) |

---

## 4. Diseño Técnico

### 4.1 Flujo de datos — activación Webpay (usuario)

```
[Transbank callback] PATCH /qr-activate/webpay/:token_ws  (público)
   │
   ▼
[UpdateWebpayQrActivateUseCase.execute]
   1. getByWebpayToken(token_ws) → activación PENDING (idempotente si ya procesada)
   2. commitTransactionUseCase.execute(token_ws) → AUTHORIZED
   3. amount == price.TotalPrice (snapshot, SPEC-009 B12)  → NO → FAILED (sin correo)
      │
      ▼ SÍ
4. qrActivator.activateMany(codes, expirationDate)  ← QRs quedan active: true
    5. updater.update(id, { state: PAYED, activationDate: new Date(), WebpayTransaction: AUTHORIZED })  ← siempre corre (RF-8)
    6. notifyQrActivated(updated, tracking)             ← NUEVO (RF-5, best-effort, try/catch defensivo)
         ├─ GetUserUseCase.execute(userId) → user.email (404 → warn + skip)
         ├─ Por cada QR: QRCode.toBuffer(landingUrl) → PNG (nivel H)
         ├─ ejs.render(qrActivated.ejs, payload) → html (img cid:qr-{idQr})
         └─ emailService.sendQrActivatedEmail(...)     ← fallo → log email_activation_failed, NO re-throw
   │
   ▼
   Respuesta 200 → frontend muestra "¡Pago Exitoso!" (/dashboard/qr/pay/webpay)
```

**Flujo de datos — activación admin**

```
[Admin] POST /qr-activate  (methodActivation: ADMIN, userId = cliente)
   │
   ▼
[CreateQrActivateUseCase.executeAdmin]
   1. execute(dto, actor) → crea activación ADMINCREATED con activationDate: new Date() (RF-8)
        (userId = dto.userId || admin)
   2. qrActivator.activateMany(codes, expirationDate)  ← QRs quedan active: true
   3. notifyQrActivated(created, tracking)             ← NUEVO (RF-6, best-effort)
        └─ ... idéntico (correo al CLIENTE — RN-3)
   │
   ▼
   Respuesta 201 → UI admin muestra ActivationSuccess
```

### 4.2 Contratos (sin cambios de API)

```
POST /qr-activate                    — sin cambios (respuesta 201 igual; el correo es efecto secundario)
PATCH /qr-activate/webpay/:token_ws  — sin cambios (respuesta 200 igual)
```

Nuevos internos:

```ts
// modules/qr-activate/domain/ports/queries/qr-activate-email.port.ts  (NUEVO — ADR-019.8)
interface ICanSendQrActivatedEmail {
  sendQrActivatedEmail(payload: QrActivatedEmailPayload): Promise<void>;
}
// token: QR_ACTIVATE_EMAIL_PORT (qr-activate.tokens.ts)
// binding en qr-activate.module.ts: { provide: QR_ACTIVATE_EMAIL_PORT, useExisting: EmailService }

// shared/email/email.service.ts  (implementa estructuralmente el puerto)
interface QrActivatedEmailPayload {
  to: string;
  userName: string;
  qrItems: Array<{
    code: string;
    name?: string;
    typeQr: string; // enum QrType: dynamic | static | whatsapp | email | call | wifi | texto | list | vcard | pet | phone | map
    typeLabel: string; // label legible (RF-1.1): 'QR Dinámico', 'QR Multi links', ...
    plan?: string;
    duration?: string;
    activationDate?: Date;
    expirationDate?: Date;
    landingUrl: string; // {FRONTEND_URL}/qr/{idQr}?origen=qr
  }>;
  methodActivation: string; // 'WEBPAY' | 'TRANSFER' | 'ADMIN'
  totalPrice: number;
}

class EmailService implements ICanSendQrActivatedEmail {
  sendQrActivatedEmail(payload: QrActivatedEmailPayload): Promise<void>;
  // internamente: QRCode.toBuffer(landingUrl, { width: 200, margin: 2, errorCorrectionLevel: 'H' })
  //   → attachments: [{ filename: `qr-${code}.png`, content: png, cid: `qr-${code}` }]
}

// modules/qr-activate/application/services/qr-activated-notification.service.ts
class QrActivatedNotificationService {
  constructor(
    @Inject(QR_ACTIVATE_EMAIL_PORT) private readonly emailSender: ICanSendQrActivatedEmail, // puerto, NO EmailService
    private readonly getUserUseCase: GetUserUseCase,   // use case de otro módulo (patrón establecido)
    private readonly getQrUseCase: GetQrUseCase,       // resuelve typeQr/name/id por código (QrElement no guarda el tipo)
    private readonly traceService: TraceService,
  ) {}
  async notify(activation: QrActivate, tracking: TrackingContext): Promise<void>;
  // best-effort: nunca re-throw; 404 user → warn + skip; error SMTP/PNG → log email_activation_failed
}
```

### 4.3 Cambios por archivo — Backend (`backend-portaqr`)

| Archivo | Cambio |
| --- | --- |
| `package.json` | + `qrcode` ^1.5.x (CommonJS; `@types/qrcode` en devDeps) |
| `src/templateEmail/qrActivated.ejs` (nuevo) | Template EJS **misma línea gráfica** que `registerEmail.ejs` (RF-1) |
| `src/shared/email/email.service.ts` | `sendQrActivatedEmail()` (implementa estructuralmente `ICanSendQrActivatedEmail`) + interfaz `QrActivatedEmailPayload` + generación PNG con `qrcode` + attachments `cid` (RF-2). **Nota**: usar el patrón de transporte del `NodemailerContactAdapter` (port numérico, `secure: false`) — no copiar el `SMTP_TTL`/string del constructor actual |
| `src/shared/email/email.service.spec.ts` | Tests del método nuevo (RF-3, CA-01/06/07) |
| `src/modules/qr-activate/domain/ports/queries/qr-activate-email.port.ts` (nuevo) | Puerto `ICanSendQrActivatedEmail` (ADR-019.8) |
| `src/modules/qr-activate/domain/constants/qr-activate.tokens.ts` | + `QR_ACTIVATE_EMAIL_PORT` |
| `src/modules/qr-activate/domain/constants/qr-type-labels.ts` (nuevo) | Mapa `QR_TYPE_LABELS` (RF-1.1): 12 tipos del enum `QrType` (importado de `modules/qr/application/dto/create-qr.dto`) + fallback valor crudo |
| `src/modules/qr-activate/application/services/qr-activated-notification.service.ts` (nuevo) | `notify()` best-effort (RF-4, RN-2/3/4) — inyecta puerto email + `GetUserUseCase` + `GetQrUseCase` |
| `src/modules/qr-activate/application/use-cases/update-webpay-qr-activate.usecase.ts` | Inyectar servicio; `notify(updated, tracking)` post-`updater.update` en rama PAYED (try/catch defensivo); `activationDate: new Date()` en el update (RF-5, RF-8) |
| `src/modules/qr-activate/application/use-cases/create-qr-activate.usecase.ts` | Inyectar servicio; `notify()` post-`activateMany` en `executeAdmin`; `activationDate: new Date()` en la creación admin (RF-6, RF-8) |
| `src/modules/qr-activate/qr-activate.module.ts` | Importar `UsersModule` + `EmailModule`; registrar servicio; **binding `{ provide: QR_ACTIVATE_EMAIL_PORT, useExisting: EmailService }`** (RF-7, ADR-019.8) |
| Tests | `update-webpay-qr-activate.usecase.spec.ts` y `create-qr-activate.usecase.spec.ts` actualizados (CA-01/02/03/05/08), spec del servicio nuevo (CA-04), spec del mapa `QR_TYPE_LABELS` |

### 4.4 ADRs

> [!info] ADR-019.1 — ¿Dónde se dispara el correo: backend monolito o frontend?
> **Decisión**: backend (`backend-portaqr`).
> - El frontend ya conoce el resultado (toast de éxito), pero el correo debe llegar aunque el usuario cierre la pestaña o el callback Webpay sea entregado por IPN sin navegador. El único lugar que garantiza el envío es el backend, en el punto donde el QR pasa a `active: true`.
> - Patrón consistente con los correos existentes (verificación/registro → backend).

> [!info] ADR-019.2 — ¿Best-effort o bloqueante?
> **Decisión**: **best-effort** (try/catch + log `email_activation_failed`, sin re-throw).
> - El QR **ya quedó activo** al momento del envío: revertir o fallar el request por SMTP degradaría el negocio (el usuario pagó y su QR no queda "confirmado" por un problema de correo).
> - El fallo queda auditado en logs con `activationId` para reproceso manual/automático futuro (mejora futura: cola con backoff, §6).
> - Contra-punto aceptado: el correo puede perderse si SMTP está caído en el momento exacto (probabilidad baja; mitigable a futuro con cola).

> [!info] ADR-019.3 — ¿Síncrono o cola?
> **Decisión**: síncrono (mismo patrón que los correos existentes del sistema).
> - No existe infraestructura de colas en el proyecto (verificado: sin BullMQ/event-emitter). Introducir una cola para un correo transaccional de baja frecuencia (activaciones) es sobre-ingeniería.
> - El `transporter.sendMail` de nodemailer ya tiene timeout; el envío agrega ~100-500ms al request del callback Webpay (que el frontend ya espera con spinner).
> - Si el volumen crece o se requieren reintentos, migrar a cola sin cambiar el contrato del servicio (ADR-019.2).

> [!info] ADR-019.4 — ¿Correo al admin también?
> **Decisión**: solo al **cliente dueño** (`activation.userId`). El admin activa POR un cliente (SPEC-009 A3) y ya ve la confirmación en su pantalla (`ActivationSuccess`). Enviar además al admin duplicaría correos en cada activación del panel.

> [!info] ADR-019.5 — ¿Cómo se genera la imagen del QR en el correo?
> **Decisión**: librería **`qrcode` (npm) en el backend** + **attachment con `cid`** en nodemailer.
> - **Por qué no data URI base64 inline**: Outlook desktop bloquea imágenes con data URIs; con `cid` la imagen se muestra en Gmail, Outlook, Apple Mail y móviles (estándar MIME multipart/related).
> - **Por qué no servicio externo** (api.qrserver.com): dependencia de terceros (disponibilidad, privacidad de la URL, latencia) — el backend ya tiene sharp/nodemailer; `qrcode` es una librería madura (~sin dependencias, CommonJS, compatible con el stack).
> - **Nivel de corrección H** (30%): mismo nivel que usa el frontend (`QrDisplay.tsx` → `level="H"`) para máxima escaneabilidad en impresiones pequeñas.
> - **URL codificada**: `{FRONTEND_URL}/qr/{idQr}?origen=qr` — exactamente la misma que genera el frontend (RN-7): el QR del correo es funcionalmente idéntico al QR físico del usuario.

> [!info] ADR-019.6 — ¿De dónde sale la fecha de activación?
> **Decisión**: campo **`activationDate`** persistido en el momento de la activación (RF-8).
> - El campo ya existe en schema/entidad/mapper pero nunca se asigna (verificado 2026-08-17). Usar `createdAt` sería incorrecto en Webpay: es la fecha del PENDING (cuando se creó la transacción), no la del pago.
> - Se setea en los dos puntos de activación (PAYED y admin) y el correo lo lee con fallback a `createdAt` por robustez (activaciones legacy sin el campo).

> [!info] ADR-019.7 — ¿Qué imagen del logo se usa en el correo?
> **Decisión**: **PNG** del logo horizontal (`{baseUrl}/PORTA_QR_LOGO_HORIZONTAL.png`), linkeado a `{baseUrl}` (decisión usuario 2026-08-17).
> - El usuario indicó el logo público existente `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.svg`. **Los clientes de correo (Gmail/Outlook/Yahoo) no renderizan SVG** — solo Apple Mail/Thunderbird. Por eso se usa el **mismo logo convertido a PNG** (generado con `sharp` desde el SVG: 400px ancho, 6.6 KB, fondo transparente) y publicado en `qr-app/public/PORTA_QR_LOGO_HORIZONTAL.png` → `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png` tras deploy.
> - El PNG se referencia por URL remota (no attachment `cid`): es un asset estático del sitio, no un dato de la activación. Requiere deploy de qr-app (RF-1.2, §6).

> [!info] ADR-019.8 — ¿Cómo consume la capa de aplicación el envío de email? (revisión hexagonal 2026-08-17)
> **Decisión**: **puerto `ICanSendQrActivatedEmail`** en `qr-activate/domain/ports/queries/` + token `QR_ACTIVATE_EMAIL_PORT` + binding `{ provide: QR_ACTIVATE_EMAIL_PORT, useExisting: EmailService }` en `qr-activate.module.ts`. `EmailService` implementa estructuralmente el puerto (mismo patrón de `modules/mail`: `ICanSendContactEmail` + `NodemailerContactAdapter`).
> - **Por qué no inyectar `EmailService` directo** (como hace `users` module con `create-user`/`forgot-password`/`resend-verification-code`): `EmailService` es **infraestructura concreta** (nodemailer + EJS + fs). Inyectarlo en `QrActivatedNotificationService` (capa de aplicación) violaría la regla de dependencia hexagonal **dentro del módulo `qr-activate`, que hoy es 100% hexagonal** (todos sus use cases inyectan puertos con tokens). El patrón legacy de `users` es deuda existente, no precedente a replicar en módulos hexagonales.
> - **Por qué `useExisting` y no un adaptador nuevo**: `EmailService` ya es el único lugar con transporter/templates; un `NodemailerQrActivatedAdapter` duplicaría esa lógica. El binding `useExisting` alias la clase existente bajo el token del puerto (patrón NestJS estándar).
> - **Qué sí se inyecta como clase concreta**: solo use cases de otros módulos (`GetUserUseCase`, `GetQrUseCase`) — patrón ya establecido en el módulo (`GetPlanUseCase`, `CommitTransactionUseCase`). La capa de aplicación depende de aplicación, nunca de infraestructura.
> - **Beneficio colateral**: el spec del servicio de notificación mockea el puerto (token), no la clase concreta; y `users` module podría migrar al mismo puerto en el futuro sin tocar `EmailService`.

---

## 5. Mockups / Referencias

- **Correo** (mockup textual, línea gráfica de `registerEmail.ejs`): contenedor centrado max-600px → header "¡Tu QR está activado!" → saludo con nombre → **tarjeta por QR**: imagen QR ~160px (fondo blanco, borde) + código/nombre + **badge de tipo** (`QR Dinámico`, `QR Multi links`, ... — RF-1.1) + "Página de aterrizaje: {URL}" + "Fecha de activación: dd/mm/yyyy" + "Fecha de cierre: dd/mm/yyyy" → bloque resumen (método de activación, **Total: $X CLP**) → botón "Ver mis QRs" → footer estándar (soporte@portaqr.cl, ©).
- **Referencias**: `src/templateEmail/registerEmail.ejs` (línea gráfica base), `passwordReset.ejs` (variables + URL). `shared/email/email.service.ts` (patrón de render + envío). `qr-app/src/components/QrDisplay.tsx` (URL que codifica el QR: `{origin}/qr/{idQr}?origen=qr`, nivel H).

---

## 6. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| **Correo desde backend** | Garantiza envío en callbacks/IPN; patrón existente | Acopla qr-activate a EmailModule (dependencia ya madura) | ✅ (ADR-019.1) |
| **Correo desde frontend** | Control visual inmediato | Se pierde si el usuario cierra la pestaña; duplica lógica | ❌ |
| **Best-effort síncrono** | Simple; la activación nunca falla por correo | Pérdida silenciosa si SMTP cae (auditable en logs) | ✅ (ADR-019.2) |
| **Cola + retry (BullMQ)** | Reintentos automáticos, desacopla el envío | Infraestructura nueva para 1 correo de baja frecuencia; sobre-ingeniería hoy | ❌ (mejora futura) |
| **QR con librería `qrcode` + attachment `cid`** | Imagen local, robusta en todos los clientes; mismo nivel H que el frontend | 1 dependencia nueva (madura, sin deps) | ✅ (ADR-019.5) |
| **Logo PNG remoto vs SVG** | PNG funciona en todos los clientes de correo; SVG no (Gmail/Outlook lo bloquean) | PNG nuevo en `qr-app/public` requiere deploy de qr-app | ✅ PNG (ADR-019.7) |
| **QR como data URI base64** | Cero attachments | Outlook desktop bloquea data URIs | ❌ |
| **QR vía servicio externo** | Cero código | Dependencia de terceros (disponibilidad/privacidad/latencia) | ❌ |
| **`activationDate` persistido** | Fecha real de activación (no del PENDING) | Cambio menor en 2 use cases (RF-8) | ✅ (ADR-019.6) |
| **Nuevo método en EmailService** | Cero cambios de firma en módulos; template EJS en un lugar | EmailService crece (3 métodos) — aceptable, sigue siendo cohesivo | ✅ |
| **Puerto `ICanSendQrActivatedEmail` + `useExisting: EmailService`** | La capa de aplicación depende de una abstracción (hexagonal); testeable con mock del token; sin duplicar nodemailer | 1 interfaz + 1 token + 1 binding nuevos | ✅ (ADR-019.8) |
| **Inyectar `EmailService` directo en la notificación** | Cero archivos nuevos; patrón de `users` module | Viola hexagonal dentro de `qr-activate` (módulo 100% hexagonal hoy) | ❌ (ADR-019.8) |
| **Correo al admin también** | El admin tiene evidencia por correo | Duplicación; el admin ya ve confirmación en pantalla | ❌ (ADR-019.4) |
| **Template reutilizando registerEmail.ejs** | Consistencia visual y de código | Tamaño del archivo (template autónomo) | ✅ (patrón existente) |

---

## 7. Producción (sin cambios de infraestructura)

1. **Sin variables nuevas**: se reutilizan `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_TTL`, `EMAIL_FROM` y `FRONTEND_URL` (ya usadas por verificación/registro).
2. **Railway**: solo redeploy de `backend-portaqr` (npm install incluirá `qrcode`). Verificar en logs de la app: `Email de activación enviado exitosamente a: ...` tras una activación real.
3. **Sin cambios de CORS, R2 ni Mongo** (el correo es saliente vía SMTP; la imagen QR se genera en memoria, no se persiste).
4. **(Opcional) Reputación de dominio**: el remitente es el mismo de los correos existentes (`EMAIL_FROM`), por lo que SPF/DKIM ya aplican si están configurados. El peso del correo crece ~10-20KB por QR (PNG 200px) — irrelevante para SMTP.

> [!note] Verificación post-despliegue
> 1. Activar un QR por Webpay (modo integración Transbank) → el dueño recibe el correo con **imagen QR escaneable**, landing URL, **fecha de activación** y **fecha de cierre**.
> 2. Activar por panel admin → el **cliente** recibe el correo (no el admin).
> 3. Escanear el QR del correo → llega a la misma landing que el QR físico (`/qr/{idQr}?origen=qr`).
> 4. Romper `SMTP_HOST` temporalmente → la activación sigue OK (PAYED/ADMINCREATED) y aparece `email_activation_failed` en logs.
> 5. `mongosh`: el documento `qractivates` de la compra tiene `activationDate` poblado.

---

## 8. Criterios de calidad

- **Backend**: unit tests de `EmailService.sendQrActivatedEmail` (CA-01/06/07 — incluye verificación de attachments `cid` y buffer PNG), del servicio de notificación (CA-03/04 con mocks de `GetUserUseCase`/`EmailService`) y de los use cases `update-webpay` (CA-01/03/05/08) y `create` admin (CA-02/08). `tsc --noEmit` + lint sin errores.
- **Sin regresión**: suite completa de `qr-activate`, `webpay`, `users` y `email` verde (el wiring nuevo de módulos no debe romper imports — los módulos `UsersModule`/`EmailModule` ya son importados por otros módulos sin ciclos).
- **E2E** (opcional, `e2e-tests-portaqr`): activación admin → verificar en logs/BD que el servicio de notificación fue invocado (mockear SMTP en el entorno E2E; no enviar correos reales en CI).

## 9. Tareas

- [ ] Tareas registradas en `docs/tareas/SPEC-019-tareas.json` (formato Taskmaster).
- [ ] Rama `feat/spec-019-correo-activacion-qr` (backend-portaqr).

## 10. Referencias

- [[SPEC-009]] — hardening authz/auth: A3 (admin activa por cliente → destinatario del correo), B12 (snapshot de precio → monto del correo), idempotencia del callback.
- [[SPEC-016]] — patrón de spec completo (baseline verificado, ADRs, bitácora) y de integración de módulos (importar módulos existentes en el módulo consumidor).
- `src/shared/email/email.service.ts` + `src/templateEmail/registerEmail.ejs` + `passwordReset.ejs` — infraestructura y línea gráfica reutilizadas.
- `qr-app/src/components/QrDisplay.tsx` — URL codificada en el QR (`{origin}/qr/{idQr}?origen=qr`, nivel H).
- `qrcode` npm: https://www.npmjs.com/package/qrcode — generación de PNG en Node (CommonJS, sin dependencias).
- Nodemailer attachments (cid): https://nodemailer.com/message/attachments/

---

## 11. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-08-17 | **SPEC creada** (borrador). Investigación verificada en `backend-portaqr`: puntos de activación reales (`UpdateWebpayQrActivateUseCase` L59-79, `CreateQrActivateUseCase.executeAdmin` L139-156), infraestructura email existente (`EmailService` + EJS + `EmailModule`), resolución de dueño (`GetUserUseCase` exportado por `UsersModule`), sin colas en el proyecto (ADR-019.3), **sin librería de QR en backend** (frontend usa `qrcode.react` — `QrDisplay.tsx` codifica `{origin}/qr/{idQr}?origen=qr` con nivel H), **`activationDate` nunca se asigna** (ADR-019.6), línea gráfica de templates confirmada (`registerEmail.ejs`/`passwordReset.ejs`: azul `#1E3A8A`, grises, botón CTA, footer soporte, dark mode). |
| 2026-08-17 | **Actualización por requerimiento del usuario**: el correo ahora incluye **imagen del QR** (librería `qrcode` + attachment `cid`, ADR-019.5), **página de aterrizaje** (`{FRONTEND_URL}/qr/{idQr}?origen=qr`, RN-7), **fecha de activación** (campo `activationDate` persistido — RF-8/ADR-019.6) y **fecha de cierre** (`qrList[].expirationDate`), manteniendo la **línea gráfica** de los correos existentes (RF-1). |
| 2026-08-17 | **Actualización por requerimiento del usuario**: cada tarjeta del correo muestra el **tipo de QR activado** como badge (`QR Dinámico`, `QR Multi links`, `QR WhatsApp`, ...). Nuevo **RF-1.1** (mapa `QR_TYPE_LABELS` en backend con los 12 tipos del enum `QrType`, formato de labels de `qr-app/src/constants/qrTypes.ts` + `phone`/`map` que faltan en el frontend). Payload `qrItems[]` extiende con `typeQr` + `typeLabel`. Maqueta actualizada en `miselanios/maqueta-correo-activacion-qr.html`. |
| 2026-08-17 | **Actualización por requerimiento del usuario**: el título de la tarjeta ya **no muestra el nombre del QR** (solo los QRs `list` tienen `name`/`description` — el resto no). Regla final: título = `name` si existe, si no el **código** (`QR #abc123`). Maqueta ajustada (una sola tarjeta, sin nombre). |
| 2026-08-17 | **Actualización por requerimiento del usuario**: el template es **SOLO modo claro** — se elimina `@media (prefers-color-scheme: dark)` (los templates existentes lo traen, este no). Motivo: en dark mode los textos azules `#1E3A8A` sobre fondo oscuro tenían poco contraste; el usuario decidió un solo modo de correo. Textos de la tarjeta con contraste alto sobre blanco: detalles `#374151`, título/links `#1E3A8A`, badge `#DBEAFE`/`#1E3A8A`. Maqueta actualizada. |
| 2026-08-17 | **Actualización por requerimiento del usuario**: el header del correo incluye el **logo de Porta QR** linkeado a `portaqr.cl`. El usuario indicó el logo público `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.svg`; como los clientes de correo no renderizan SVG, se generó el **PNG** (`sharp` desde el SVG, 400px, 6.6 KB) en `qr-app/public/PORTA_QR_LOGO_HORIZONTAL.png` → público en `https://portaqr.cl/PORTA_QR_LOGO_HORIZONTAL.png` tras deploy. Nuevo **RF-1.2** + **ADR-019.7**. Maqueta actualizada. |
| 2026-08-17 | **Revisión hexagonal de la propuesta** (requerimiento del usuario): verificado contra el código real — `qr-activate` es 100% hexagonal (puertos `ICanXxx` + tokens + adaptadores; use cases inyectan puertos; clases concretas solo para use cases de otros módulos: `GetPlanUseCase`/`GetQrUseCase`/`CommitTransactionUseCase`); `modules/mail` muestra el patrón hexagonal de email (`ICanSendContactEmail` + `NodemailerContactAdapter`); `shared/email/EmailService` es infraestructura sin puerto (patrón legacy de `users`). **Ajuste**: `QrActivatedNotificationService` ya NO inyecta `EmailService` directo — inyecta el **puerto `ICanSendQrActivatedEmail`** (token `QR_ACTIVATE_EMAIL_PORT`, binding `useExisting: EmailService`). Además: `QrElement` no guarda `typeQr` → se resuelve con `GetQrUseCase` por código (patrón ya usado en `CreateQrActivateUseCase`); mapa `QR_TYPE_LABELS` en `qr-activate/domain/constants/`; nota de no copiar el bug `SMTP_TTL` del constructor actual en el método nuevo. Nuevo **ADR-019.8**. RF-4/RF-7/§4.2/§4.3/§6 actualizados. |
| 2026-08-17 | **Implementada** en rama `feat/spec-019-correo-activacion-qr` (backend-portaqr, 7 commits: `0ae18cb` template+labels+qrcode, `2739e54` EmailService.sendQrActivatedEmail, `f8f94fe` puerto+servicio, `b115b59` disparo Webpay, `d508ccf` disparo admin, `878816c` wiring módulo, `94146f0` fix landing). Tareas 1-8 completadas. Validación: tsc 0 errores, suites qr-activate/users/email/webpay verdes (48 suites/429 tests), suite completa 156/157 (smoke test AppModule requiere Mongo local — levantado con `docker compose up -d -V backend-portaqr` tras rebuild por `qrcode`). **FIX post-implementación (commit `94146f0`)**: la landing del correo usaba `qrDoc.id` (el `_id` de Mongo) → 404 en `/qr/[id]`; la página pública busca por `idQr` (UUID, SPEC-009 A10). Corregido a `qrDoc.idQr` + test actualizado. Nota de despliegue: [[NOTA-despliegue-produccion-SPEC-019]]. |
| 2026-08-17 | **RF-2.1 (requerimiento del usuario)**: variable `EMAIL_ACTIVATION_ENABLED` (default `true`) para activar/desactivar el envío del correo de activación — para desarrollo local (tests manuales) sin mandar correos reales. Implementado en `EmailService.sendQrActivatedEmail` (check al inicio, solo `'false'` explícito desactiva) + 2 tests nuevos en `email.service.spec.ts` (12/12 verdes) + variable documentada en `backendPortaqr.env` (no versionado). tsc 0 errores. |
| 2026-08-17 | **FIX post-prueba manual (commit `2cc0119`) — idempotencia ante carrera en `UpdateWebpayQrActivateUseCase`**: el usuario pagó por Webpay y la UI mostró "pago fallido" aunque el QR se activó. Causa: React StrictMode dispara el `PATCH /qr-activate/webpay/:token_ws` **dos veces** (mount → unmount → remount, documentado en `webpay/page.tsx`); ambas leyeron la activación `PENDING` (la 1ª tardó ~5s en commitear) y la 2ª recibió **422 de Webpay** (token ya committeado) → error propagado → UI de error. El guard existente (`state !== PENDING → return`) no cubre la carrera. **Fix**: try/catch alrededor del commit — si falla, **re-leer** la activación; si ya no está `PENDING` (la otra request la procesó), devolver su estado actual (200, idempotente — SPEC-007 RF-3); si sigue `PENDING`, re-lanzar (fallo real). +2 tests (16/16 en el spec, suite completa 157/157/1298). El pago del usuario fue AUTHORIZED y el QR quedó activo — solo la UI mintió. |
| 2026-08-17 | **FIX 2 (commits `18778ab` backend + `6a3f72a` frontend, rama `fix/webpay-doble-fetch-strictmode`) — la carrera persistía**: la re-lectura simple ocurría **antes** de que la request ganadora persistiera el PAYED (commit + update tardan ~2-5s) → seguía `PENDING` → re-lanzaba → UI de error de nuevo (verificado en logs: 2º PATCH 422 a 5ms del 1º, activación `6a8380bd...` PAYED). **Fix doble**: (1) **Backend**: si el error es **422** (token ya committeado = otra request en curso), **polling** de re-lectura (10 × 500ms = 5s de ventana, constantes `RACE_RECHECK_ATTEMPTS`/`RACE_RECHECK_DELAY_MS`) hasta que la activación deje `PENDING` → devolver su estado (200). Errores sin 422 se re-lanzan inmediato. +2 tests con fake timers (16/16). (2) **Frontend** (`webpay/page.tsx`): **guard `useRef`** para ejecutar el PATCH **una sola vez** — el ref persiste entre los ciclos de StrictMode (mismo fiber); **sin** el flag `isMounted` con cleanup que causó el loading eterno del hotfix SPEC-009 (el cleanup del 1er ciclo mataba los setState del fetch en vuelo y el 2º ciclo no hacía fetch). Sin cleanup, los setState del 1er ciclo actualizan el estado preservado del remount; en desmontaje real React 18 los ignora sin warning. tsc 0 errores en ambos. |