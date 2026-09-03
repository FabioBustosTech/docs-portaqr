---
title: "SPEC-030-A: Creador de correos y envío masivo en el CMS"
date: 2026-09-03
tags:
  - spec
  - newsletter
  - cms
  - bulk
  - qr-cms
status: implementado
aliases:
  - SPEC-030-A
  - newsletter issues
  - envío masivo newsletter
  - creador de correos cms
---

# SPEC-030-A: Creador de correos y envío masivo en el CMS

> [!abstract] Decisión clave
> El CMS (`qr-cms`, :3005) suma un **creador de correos**: nueva colección `newsletter-issues` (asunto, preheader, contenido por bloques, audiencia, estado) con **preview por issue** (mismo HTML que se enviará, con link de baja de ejemplo) y **envío masivo** solo a `subscribed` vía ESP (Resend recomendado — react-email es suyo). Sin sidecars: muere el puerto :3002 (`email dev` queda solo como herramienta local opcional). Reutiliza todo SPEC-030 sin cambios (suscriptores, tokens, baja 1-clic, headers).

> [!info] Metadatos
> - **Estado:** Implementado (2026-09-03)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-cms/` (colección, mapper bloques→react-email, preview, job de envío)
> - **Origen:** Requerimiento del usuario (2026-09-03): "el cms pueda manejar la creación del correo... usar eso para newsletter/correo masivo, ver la preview antes de mandarlo a los que están suscritos". Continúa a [[SPEC-030-newsletter-cms-suscripciones]] (Fase 1 implementada).
> - **Infraestructura reutilizada:** colección `subscribers` + tokens (`unsubscribeToken`), `newsletter-mail.ts` (transporte nodemailer, headers RF-12), componentes react-email (`EmailLayout`, `EmailParts`), ruta `/api/newsletter/preview` (auth admin), access patterns de `Subscribers`.
> - **Dependencias nuevas:** `resend` (SDK ESP, solo si se confirma Resend como proveedor).

---

## 1. Objetivo

1. Que el equipo cree cada newsletter **en el admin del CMS** (sin código): asunto, preheader, bloques de contenido, audiencia.
2. Que antes de enviar se vea la **preview exacta** del correo (mismo HTML, con link de baja de ejemplo) en el propio :3005 con login.
3. Que el envío masivo llegue **solo a suscritos**, un correo por destinatario con **su propio link de baja** + headers `List-Unsubscribe`.
4. Que los rebotes/quejas marquen `bounced` automáticamente (higiene de lista, entregabilidad).
5. Envío de prueba a un email arbitrario (QA) antes del masivo.

### 1.1 Out of scope

- **NO** se toca el flujo de suscripción/baja (SPEC-030 intacta) ni `qr-app`/`backend-portaqr` (salvo vars si el cron vive fuera).
- **NO** segmentación avanzada (por tags/intereses) ni A/B testing: audiencia = todos los `subscribed` + filtro opcional por `source`. Mejora futura.
- **NO** tracking de aperturas (pixel) en Fase 1 de esta spec: solo clics de baja (ya existen) + contadores de envío. El píxel se evalúa aparte (privacidad).
- **NO** editor drag&drop (Unlayer): el composer son bloques Payload nativos (los que el equipo ya conoce del blog).
- **NO** múltiples remitentes o multi-idioma: un remitente (`newsletter@news.portaqr.cl`), español.

---

## 2. Reporte de estado actual (verificado 2026-09-03)

| Aspecto | Estado actual | Brecha |
| --- | --- | --- |
| Audiencia (`subscribers`) | ✅ Existe (SPEC-030: colección + doble opt-in + baja + sync) | Sin cambios |
| Templates fijos (confirm/welcome/baja) | ✅ React Email + preview por tipo (`/api/newsletter/preview?type=`) | Generalizar a preview por issue |
| Colección de envíos (`newsletter-issues`) | **No existe** | Crear (RF-1) |
| Composer por bloques | **No existe** (blog usa bloques Lexical, no email-safe) | Bloques email + mapper (RF-2) |
| Preview del correo a enviar | Parcial (solo transaccionales fijos) | Preview por issue con baja de ejemplo (RF-3) |
| Envío de prueba | **No existe** | Endpoint admin (RF-4) |
| Envío masivo | **No existe** (solo SMTP transaccional bajo volumen) | Job por lotes vía ESP (RF-5) |
| Programación | **No existe** | `scheduledAt` + cron seguro (RF-6) |
| Rebotes | Campo `bounced` existe, nadie lo setea | Webhook ESP (RF-7) |
| Servidor `:3002` (`email dev`) | Levantado manual, fuera del CMS | **Apagar**: el preview vive en :3005 |

---

## 3. Especificación

### 3.1 Requisitos funcionales (RF)

**Bloque A — Colección `newsletter-issues` (`qr-cms`)**

- **RF-1 (colección `newsletter-issues`)**. `qr-cms/src/collections/NewsletterIssues.ts` (slug `newsletter-issues`, grupo `Newsletter`, `useAsTitle: 'title'`, `defaultSort: '-createdAt'`):
  - `title` (text, required): nombre interno ("Septiembre 2026 — novedades").
  - `subject` (text, required, maxLength 150): asunto del correo.
  - `preheader` (text, maxLength 150): texto de previsualización (bandeja).
  - `content` (blocks, required, min 1): bloques email-safe — `EmailText` (richText simple: bold/italic/link/list), `EmailImage` (upload→media + alt + link?), `EmailButton` (label + url), `EmailDivider`, `EmailSpacer`. **NO** se reutilizan los bloques del blog (Lexical con tablas/CTAs no es email-safe).
  - `audience` (select, default `all`): `all` (todos `subscribed`) | `by-source` + `audienceSources` (multi-select de sources públicos/cuenta).
  - `status` (select, default `draft`, admin readOnly salvo transiciones): `draft` → `scheduled` → `sending` → `sent`; `failed` (error job). Transiciones solo hacia adelante (más `scheduled→draft` para desprogramar).
  - `scheduledAt` (date, opcional): si `scheduled`, hora de envío.
  - Stats (readOnly admin): `sentCount`, `bouncedCount`, `sentAt`, `lastError`.
  - **Access**: todo admin (`req.user`). Nunca público, nunca en MCP.
- **RF-2 (mapper bloques → react-email)**. `qr-cms/src/lib/newsletter-issue-render.ts`: `renderIssueHtml(issue, { unsubscribeUrl, baseUrl })` — cada bloque a componentes (`EmailText`→`<Text>` con mini-sanitizador links, `EmailImage`→`<Img>` con URL absoluta R2, `EmailButton`→`EmailCta` reutilizado, `EmailDivider`→`<Hr>`, `EmailSpacer`→空 `Section` con alto). Todo dentro de `EmailLayout` (logo + footer con `EmailUnsubscribeFooter` real por destinatario). **Unit tests**: un bloque de cada tipo + issue vacío → error `empty-issue` (no se puede programar/enviar sin contenido).

**Bloque B — Preview y prueba (sin enviar al público)**

- **RF-3 (preview por issue)**. `GET /api/newsletter/issues/[id]/preview` (auth admin como la ruta actual): renderiza el issue con un suscriptor de ejemplo (`Ana Ejemplo`, `unsubscribeUrl` con token `0…0` de mentira + marca visual "VISTA PREVIA — no enviar"). Reutiliza `renderIssueHtml`. 404 si el issue no existe; 400 si está vacío.
- **RF-4 (envío de prueba)**. `POST /api/newsletter/issues/[id]/test` (auth admin), body `{ to }`: envía el issue renderizado (con el `unsubscribeUrl` **real de mentira**: link a `/newsletter/baja?token=TEST` + nota "correo de prueba") a UN email vía el mismo transporte del envío real. Rate-limit 5/hora por admin. Log `newsletter_test_sent { issueId, toHash }`.

**Bloque C — Envío masivo + programación + rebotes**

- **RF-5 (job de envío)**. `POST /api/newsletter/issues/[id]/send` (auth admin): guarda `sending` y procesa en lotes de 100 (paginación por `createdAt`/`id`, reanudable si cae a mitad: guarda `sendCursor`). Por destinatario `subscribed` (filtrado por audiencia): renderiza UNA vez la plantilla base + sustituye su `unsubscribeUrl` (token real) → envía vía puerto `INewsletterBulkSender`. Fin: `sent` + `sentAt` + `sentCount`. Fallo total: `failed` + `lastError`. **Idempotencia**: un issue `sent` no se reenvía (409); reintento solo desde `failed` (continúa desde `sendCursor`, sin duplicar a los ya enviados — set `sentIssueIds` o marca por lote).
- **RF-5.1 (puerto + adapters)**. `INewsletterBulkSender` en `src/lib/newsletter-bulk-sender.ts` con DOS adapters (decisión usuario 2026-09-03: exprimir el SMTP propio): `SmtpBulkSender` (**DEFAULT**, `NEWSLETTER_BULK_PROVIDER=smtp`) — pool nodemailer 1 conexión + envío secuencial 1-a-1 con `List-Unsubscribe` por destinatario; `ResendBulkSender` (alternativa, `=resend`, batch API). `bulkSenderFromEnv` elige por env. Tests con fake + transporte mock (assert por-destinatario, fallos 550 no bloquean, `missing-smtp` → 503).
- **RF-6 (programación)**. Si `status: scheduled` y llega `scheduledAt`: `POST /api/newsletter/issues/send-due` con header `x-cron-secret === CRON_SECRET` ejecuta los pendientes (mismo job RF-5). Cron externo (Railway/Vercel cada 5 min). Sin secreto → 401/403 genérico. Sin cron configurado, el programado simplemente espera (documentado).
- **RF-7 (webhook rebotes)**. `POST /api/newsletter/webhooks/resend` (firma del ESP según docs Resend al implementar): eventos `bounced`/`complained` → `status: 'bounced'` + `bouncedAt` en `subscribers` (por email). Log `newsletter_bounced { emailHash }`. Otros eventos → 200 ignorado.

**Bloque D — Variables y admin UX**

- **RF-8 (env)**. `RESEND_API_KEY` (requerida para bulk), `NEWSLETTER_FROM=newsletter@news.portaqr.cl` (verificado en Resend + SPF/DKIM del dominio `news.portaqr.cl`), `CRON_SECRET` (32 hex), `NEWSLETTER_BULK_BATCH_SIZE` (default 100). Documentadas en `qr-cms/.env.example` (proceso `rules/common/environment-variables.md`). Sin estas vars, el admin muestra el issue pero `send` responde 503 explicativo (no 500).
- **RF-9 (admin UX mínima)**. Descripciones en español en cada campo; `scheduledAt` solo visible si `status: scheduled`; botón doc "ver preview" (link a la ruta RF-3) en la sidebar del issue.

### 3.2 Reglas de negocio

- **RN-A1**. Solo `subscribed` recibe masivos. `pending`/`unsubscribed`/`bounced` jamás entran al lote (aunque estén en la audiencia).
- **RN-A2**. Cada destinatario recibe **su propio** `unsubscribeUrl` (token individual) + headers `List-Unsubscribe(-Post)`. Prohibido un link genérico.
- **RN-A3**. Un issue `sent` es inmutable (no se edita ni reenvía). Correcciones = nuevo issue (auditoría).
- **RN-A4**. El envío es reanudable e idempotente por destinatario (caída a mitad no duplica).
- **RN-A5**. Programar exige `subject` + ≥1 bloque + audiencia válida; si no, 400 (no se puede dejar `scheduled` inválido).
- **RN-A6**. Remitente bulk = `NEWSLETTER_FROM` con fallback a `EMAIL_FROM` (mismo dominio del hosting; reputación compartida asumida). Si se migra a Resend, usar subdominio dedicado `news.portaqr.cl` (reputación separada).
- **RN-A7**. Límite de seguridad: máx 1 envío masivo concurrente (lock por `status: sending` — un segundo `send` responde 409).

### 3.3 Criterios de aceptación (CA)

- **CA-A01**: crear issue (subject + 1 bloque texto + 1 botón) → preview muestra título, textos, botón con URL, logo, footer con baja de ejemplo y marca "VISTA PREVIA".
- **CA-A02**: `POST .../test { to: <email propio> }` → llega el correo con el contenido del issue (baja marcada como prueba).
- **CA-A03**: 3 suscriptores `subscribed` de prueba + `send` → los 3 reciben el correo, cada uno con **distinto** `unsubscribeUrl` (tokens de su doc), headers presentes; `sentCount: 3`, `status: sent`.
- **CA-A04**: 1 `pending` + 1 `unsubscribed` + 1 `bounced` en la audiencia → **no** reciben nada (solo los `subscribed`).
- **CA-A05**: reintentar `send` en issue `sent` → 409 (no duplica).
- **CA-A06**: webhook `bounced` → el suscriptor pasa a `bounced` y queda fuera del próximo envío.
- **CA-A07**: `scheduledAt` futuro + cron → se envía solo al llegar la hora; antes, nada.
- **CA-A08**: sin `RESEND_API_KEY` → `send` responde 503 explicativo (no 500).
- **CA-A09**: `tsc` + `lint` + vitest verdes sin regresión SPEC-030 (subscribers, endpoints, sync).
- **CA-A10** (manual): issue real → preview → test a casilla propia → programar/enviar → verificar en Gmail (render, link baja 1-clic, headers) + admin con stats.

---

## 4. Diseño Técnico

### 4.1 Flujo de datos

```
[Admin] crea issue (draft: subject + bloques + audiencia)
  │  GET /api/newsletter/issues/[id]/preview   (auth admin, RF-3)
  │  POST /api/newsletter/issues/[id]/test { to }  (RF-4, 5/hora)
  ▼  conforme → scheduled (con scheduledAt) o send directo
[send] POST .../[id]/send (auth admin)  |  cron → POST .../send-due (CRON_SECRET)
  1. lock status=sending (RN-A7) · valida programable (RN-A5)
  2. pagina subscribers { status: subscribed (+sources) } en lotes de 100
  3. por lote: renderIssueHtml(base) + unsubscribeUrl por token
     → bulkSender.sendBulk(...) (Resend, RN-A6)
     → avanza sendCursor (reanudable, RN-A4)
  4. sent + sentAt + sentCount  |  failed + lastError
[Resend] eventos → POST /api/newsletter/webhooks/resend → bounced (RF-7)
```

### 4.2 Contratos de API (todas admin salvo webhook con firma)

```
GET  /api/newsletter/issues/[id]/preview   auth admin → text/html (marca VISTA PREVIA)
POST /api/newsletter/issues/[id]/test      auth admin { to } → 200 | 429
POST /api/newsletter/issues/[id]/send      auth admin → 202 { status: sending } | 409 si sent/sending | 503 sin ESP
POST /api/newsletter/issues/send-due       CRON_SECRET → 200 { processed: n }
POST /api/newsletter/webhooks/resend       firma Resend → 200 (bounced/complained → bounced)
```

```ts
// newsletter-issue-render.ts
interface IssueBlockMail { type: 'text' | 'image' | 'button' | 'divider' | 'spacer'; [k: string]: unknown }
renderIssueHtml(issue: { subject: string; preheader?: string; blocks: IssueBlockMail[] },
  ctx: { unsubscribeUrl: string; baseUrl: string }): Promise<string> // throw 'empty-issue'

// newsletter-bulk-sender.ts
interface BulkMail { to: string; subject: string; html: string; headers: Record<string, string> }
interface INewsletterBulkSender { sendBulk(mails: BulkMail[]): Promise<{ sent: number; failed: string[] }> }
class ResendBulkSender implements INewsletterBulkSender // batch/emails de Resend, 1 llamada por lote
```

### 4.3 Cambios por archivo (`qr-cms`)

| Archivo | Cambio |
| --- | --- |
| `src/collections/NewsletterIssues.ts` (nuevo) | RF-1 (campos, transiciones, access admin, sin MCP) |
| `src/collections/NewsletterIssues.spec.ts` (nuevo) | Estructura + transiciones + RN-A5 |
| `src/lib/newsletter-issue-render.ts` (nuevo) | RF-2 mapper bloques→react-email + `empty-issue` |
| `src/lib/newsletter-issue-render.spec.ts` (nuevo) | 1 test por bloque + sanitización links + footer por destinatario |
| `src/lib/newsletter-bulk-sender.ts` (nuevo) | Puerto + `SmtpBulkSender` (default) + `ResendBulkSender` + fake para tests |
| `src/lib/newsletter-bulk-sender.spec.ts` (nuevo) | Por-destinatario único, headers, batch, 503 sin key |
| `src/app/api/newsletter/issues/[id]/preview/route.ts` (nuevo) | RF-3 (auth admin, marca VISTA PREVIA) |
| `src/app/api/newsletter/issues/[id]/test/route.ts` (nuevo) | RF-4 (rate-limit, link TEST) |
| `src/app/api/newsletter/issues/[id]/send/route.ts` (nuevo) | RF-5 (lock, lotes, cursor, stats) |
| `src/app/api/newsletter/issues/send-due/route.ts` (nuevo) | RF-6 (CRON_SECRET) |
| `src/app/api/newsletter/webhooks/resend/route.ts` (nuevo) | RF-7 (firma, bounced) |
| `src/payload.config.ts` | Registrar `NewsletterIssues` (sin MCP) + `payload-types` |
| `qr-cms/.env.example` | RF-8 (`RESEND_API_KEY`, `NEWSLETTER_FROM`, `CRON_SECRET`, batch) |
| `package.json` | + `resend` (SDK) |
| E2E (`e2e-tests-portaqr`) | Crear issue → preview 200 → test send (stub Resend) — según factibilidad con auth admin |

### 4.4 ADRs

> [!info] ADR-030A.1 — ¿Bloques Payload propios o reutilizar los del blog?
> **Decisión**: **bloques email propios** (`EmailText/Image/Button/Divider/Spacer`).
> - Los bloques del blog (Lexical rico, tablas, CTAs con JS-ish) no son email-safe (la mayoría de clientes ignora `<table>` complejos, JS y CSS externo). Un set mínimo garantiza render en Gmail/Outlook/Apple Mail.
> - Contra-punto: dos sets de bloques que mantener. Aceptado: el email exige restricciones que el blog no tiene; el mapper es ~100 líneas testeadas.

> [!info] ADR-030A.2 — ¿SMTP propio o ESP (Resend/Brevo/SES)?
> **Decisión (rev. 2026-09-03, usuario)**: **SMTP propio por defecto** (el hosting es de uso exclusivo del proyecto aunque compartido; sin límites duros más que no caer en spam). Throttling en 3 capas: pool 1 conexión + secuencial (~30-60/min por RTT), pausa configurable entre lotes (`NEWSLETTER_BULK_PAUSE_MS`, default 30s), lotes de 50. **Resend queda como alternativa** vía el mismo puerto (`NEWSLETTER_BULK_PROVIDER=resend`) si el volumen o la entregabilidad lo exigen.
> - react-email es suyo: `render()` + `resend.emails.send/batch` hablan el mismo idioma; webhooks de bounce simples; DX y docs de primera. Alternativas válidas si el volumen/costo lo pide (Brevo tiene tier gratis generoso).
> - El puerto `INewsletterBulkSender` deja la puerta abierta a cambiar sin tocar el job.

> [!info] ADR-030A.3 — ¿Cola (BullMQ/Payload jobs) o loop paginado en el request?
> **Decisión**: **loop paginado reanudable en el request** (lotes de 100, `sendCursor`).
> - Volumen esperado inicial (cientos-miles bajos): un request con streaming de lotes basta; sin infra nueva (el proyecto no tiene Redis/BullMQ). Si el volumen o los timeouts lo exigen, migrar a cola sin cambiar el contrato (el cursor ya es el checkpoint).
> - RN-A7 (1 envío concurrente) evita duplicados sin locks distribuidos.

> [!info] ADR-030A.4 — ¿Píxel de apertura?
> **Decisión**: **no en esta spec** (solo contadores de envío + bajas).
> - El píxel es tracking de terceros que exige debate de privacidad/consentimiento (Ley 19.628). Se evalúa aparte con su propia base legal.

---

## 5. Mockups / Referencias

- **Admin issue**: form Payload estándar (título interno arriba, subject + preheader, builder de `content`, sidebar con `status`/`scheduledAt`/stats + link "Ver preview").
- **Preview**: mismo layout de los transaccionales (logo, h1 = subject, bloques, footer con baja) + banda superior "VISTA PREVIA — los links de baja son de ejemplo".
- **Referencias**: `src/collections/Subscribers.ts` (patrón colección+access), `src/lib/newsletter-service.ts` (idempotencia), `src/lib/newsletter-mail.ts` (transporte/headers), `src/emails/components/*` (piezas a reutilizar), Resend docs (batch + webhooks), RFC 2369/8058.

---

## 6. Trade-offs

| Alternativa | Pros | Contras | Decisión |
| --- | --- | --- | --- |
| Bloques email propios vs reutilizar blog | Render garantizado en clientes | Dos sets de bloques | ✅ Propios (ADR-030A.1) |
| Resend vs Brevo/SES | Mismo ecosistema react-email, webhooks simples | Costo a volumen (a cotizar) | ✅ Resend provisional (ADR-030A.2) |
| Loop paginado vs cola | Sin infra nueva, suficiente al inicio | Request largo a gran volumen | ✅ Loop + cursor (ADR-030A.3) |
| Píxel apertura vs solo envío/baja | Métricas de engagement | Privacidad/consentimiento | ❌ Fuera (ADR-030A.4) |
| `email dev` :3002 vs preview en :3005 | Hot-reload local | Servicio extra fuera del CMS | ❌ Apagado; preview en CMS |
| Remitente bulk dedicado vs transaccional | Reputación separada | Verificar dominio/keys | ✅ Dedicado (RN-A6) |

---

## 7. Producción

1. **DNS**: `news.portaqr.cl` + SPF/DKIM/DMARC de Resend antes del primer masivo (sin esto, spam directo).
2. **Railway `qr-cms`**: `RESEND_API_KEY`, `NEWSLETTER_FROM=newsletter@news.portaqr.cl`, `CRON_SECRET=<32 hex>`, `NEWSLETTER_BULK_BATCH_SIZE=100`.
3. **Cron**: cada 5 min → `POST {CMS}/api/newsletter/issues/send-due` con `x-cron-secret`.
4. **Calentamiento**: primeros envíos a listas pequeñas (reputación del dominio nuevo).
5. **Apagar :3002**: `email dev` queda solo como herramienta local del dev (`npm run email:dev`), nunca en prod.

> [!note] Verificación post-despliegue
> 1. Crear issue de prueba → preview OK → test a casilla propia → llega con su link de baja.
> 2. Enviar a 2-3 suscriptores de prueba → cada uno recibe su link único; stats en admin.
> 3. Programar a +10 min → se envía solo vía cron.
> 4. Simular bounce (dirección de test del ESP) → suscriptor pasa a `bounced`.

---

## 8. Criterios de calidad

- **qr-cms**: vitest colección (RF-1/RN-A5), render (RF-2: 5 bloques + sanitización + footer), bulk-sender (RF-5.1: unicidad, headers, batch, 503), job (RN-A4/A7 con store fake: reanuda sin duplicar, segundo send → 409), webhook (RF-7: bounced/complained/ignorado). `tsc` + `lint` limpios, sin regresión SPEC-030.
- **E2E** (si el auth admin es factible en el entorno): issue → preview → test-send stubbeado.
- **Accesibilidad/legal**: preview con marca de agua; cláusula de privacidad ya cubre masivos (revisar texto v1 si cambia la frecuencia real).

## 9. Tareas

- [ ] Tareas registradas en `docs/tareas/SPEC-030-A-tareas.json` (formato Taskmaster).
- [ ] Rama `feat/spec-030-A-newsletter-issues` (qr-cms; e2e si aplica).

## 10. Referencias

- [[SPEC-030-newsletter-cms-suscripciones]] — Fase 1 (audiencia, tokens, baja, headers, visualizador por tipo).
- `qr-cms/src/collections/Subscribers.ts` + `src/lib/newsletter-service.ts` — patrones a reutilizar.
- `qr-cms/src/emails/components/*` — piezas React Email (layout, CTA, footers).
- Resend: batch send + webhooks (docs oficiales al implementar).
- RFC 2369/8058 (`List-Unsubscribe(-Post)`).

---

## 11. Bitácora de implementación

| Fecha | Detalle |
| --- | --- |
| 2026-09-03 | **Implementada** en rama `feat/spec-030-A-newsletter-issues` (qr-cms, base react-email): `63b4831` colección, `a769aa6` mapper, `0f8811a` preview+test, `20b3867` Resend, `82802e6` job, `f3868e1` cron+webhook, `297c854` fix auth-401; e2e `8496ab0` guards 6/6 chromium. Validación: vitest 167/167, tsc/lint limpios (pre-existente scripts TS1117 no tocado). E2E encontró bug real (payload.auth lanza sin sesión → fix 401). |
| 2026-09-03 | **SPEC creada** (borrador). Hija de SPEC-030: el CMS gestiona la creación del correo (issues por bloques), preview antes de enviar y masivo a suscritos, todo en :3005. Se apaga el sidecar :3002. |
