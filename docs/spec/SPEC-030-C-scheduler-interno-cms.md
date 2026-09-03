---
title: "SPEC-030-C: Scheduler interno del CMS (adiós cron externo)"
date: 2026-09-03
tags:
  - spec
  - newsletter
  - cms
  - scheduler
status: borrador
---

# SPEC-030-C: Scheduler interno del CMS (adiós cron externo)

> [!abstract] Decisión clave
> El CMS (`qr-cms`) gatilla sus propios envíos programados con un **loop interno** (`setInterval` en el proceso Next, vía `instrumentation.ts`): cada N minutos ejecuta `processDueIssues()`, la misma función que hoy corre la ruta `send-due`. **Muere `CRON_SECRET`** y el cron externo pasa a innecesario. El admin conserva un botón manual "Procesar programados ahora" (misma función, con su sesión). Restricción: 1 sola instancia del CMS en producción (el lock es en memoria).

> [!info] Metadatos
> - **Estado:** Borrador (implementación diferida — sin suscriptores aún, sin apuro)
> - **Fecha:** 2026-09-03
> - **Componente destino:** `desarrollo-qr/qr-cms/` (scheduler, instrumentation, botón admin, cleanup env)
> - **Origen:** Pregunta del usuario (2026-09-03): "¿no lo podemos gatillar del mismo cms?" + "un cron es un loop, solo admin es lo que se usará, nadie más gatilla eso". Continúa a [[SPEC-030-A-creador-envio-masivo-cms]] (RF-6 cron externo, a reemplazar).
> - **Infraestructura reutilizada:** `processDueIssues()` / lógica de `send-due`, lock 1-envío-concurrente (RN-A7), job por lotes + throttling SMTP, botón/Admin API con sesión.

---

## 1. Objetivo

Eliminar la dependencia de un cron externo (Railway/Vercel Cron) y su secreto (`CRON_SECRET`) para los envíos programados de la newsletter. Si el único que gatilla el proceso es el propio CMS, el timer vive dentro del CMS: menos piezas, menos secretos, mismo comportamiento.

## 2. Especificación

### 2.1 Requisitos funcionales

- **RF-1 (loop interno)**. Al arrancar el server (`instrumentation.ts` → `register()`), el CMS enciende un scheduler que cada `NEWSLETTER_SCHEDULER_INTERVAL_MS` (default 300000 = 5 min) ejecuta `processDueIssues()`: issues con `status: scheduled` y `scheduledAt <= now` → `sending` → job por lotes (igual que hoy).
- **RF-2 (single-flight)**. Si una ejecución sigue corriendo cuando vence el siguiente tick, se salta (log + métrica). Nunca 2 procesamientos concurrentes (extiende RN-A7 de SPEC-030-A al scheduler).
- **RF-3 (kill-switch)**. `NEWSLETTER_SCHEDULER_ENABLED` (default `true`; solo `'false'` lo apaga). Permite congelar el automático sin redeploy de código (ej. incidente de reputación).
- **RF-4 (botón manual)**. En el admin de `newsletter-issues`, botón "Procesar programados ahora" (misma `processDueIssues()`, auth = sesión admin). Cubre el caso "lo programé, lo proceso cuando entro".
- **RF-5 (muerte de CRON_SECRET)**. Se elimina la ruta `send-due` con `x-cron-secret` (o se deja solo como alias admin con sesión — decidir en implementación). Se quita `CRON_SECRET` de `.env.example`, NOTA de producción y docs.
- **RF-6 (observabilidad mínima)**. Log en español por tick con resultado (`[NewsletterScheduler] tick: 2 vencidos, 0 enviados, 1 saltado por lock`) + exponer `lastRunAt`/`lastResult` donde el admin lo vea (campo read-only del issue o log consultable — decidir en implementación).

### 2.2 Reglas de negocio

- **RN-C1 (1 instancia)**. Producción corre **una sola instancia** de `qr-cms`. El lock single-flight es en memoria: con 2+ instancias habría doble procesamiento. Si algún día se escala horizontal → migrar a cola persistente (Payload Jobs) sin cambiar el contrato (`processDueIssues()` ya es la unidad).
- **RN-C2 (dev no molesta)**. En `next dev`, el scheduler también corre pero con log `dev` visible; `register()` de Next garantiza una sola instancia por proceso (cuidado con HMR duplicado — verificar en implementación).
- **RN-C3 (sin suscriptores, sin apuro)**. No hay presión de fecha: implementar cuando haya lista real o cuando el envío manual empiece a molestar.

### 2.3 Criterios de aceptación

- **CA-01**: con un issue `scheduled` vencido y scheduler encendido, en ≤ intervalo + duración del job el issue pasa a `sent` y los `subscribed` reciben el correo (mismo HTML/stats que el envío manual).
- **CA-02**: con `NEWSLETTER_SCHEDULER_ENABLED=false`, los vencidos NO se procesan solos; el botón manual sí los procesa.
- **CA-03**: un tick durante un job en curso se salta (log explícito), sin duplicar envíos.
- **CA-04**: `tsc --noEmit`, `eslint`, `vitest` verdes; sin `CRON_SECRET` en ningún archivo versionado.

## 3. Diseño Técnico

```
proceso qr-cms
  instrumentation.ts → register() → startNewsletterScheduler()
    cada NEWSLETTER_SCHEDULER_INTERVAL_MS (default 5 min)
      └─ processDueIssues()  (extraída de send-due, pura e importable)
           ├─ lock en memoria (single-flight, extiende RN-A7)
           └─ por cada issue vencido → runIssueSend() (job actual, SMTP+throttling)

admin newsletter-issues → botón "Procesar programados ahora"
      └─ POST ruta admin (sesión) → processDueIssues()  [misma función]
```

| Archivo | Cambio |
|---|---|
| `src/lib/newsletter-scheduler.ts` (nuevo) | `startNewsletterScheduler()` + single-flight + logs |
| `src/instrumentation.ts` (nuevo) | `register()` → enciende el scheduler una vez |
| `src/app/api/newsletter/issues/send-due/route.ts` | Extraer `processDueIssues()` a lib importable; ruta pasa a sesión-admin o se elimina |
| `src/collections/NewsletterIssues.ts` | Botón admin "Procesar programados ahora" |
| `qr-cms/.env.example` | −`CRON_SECRET`, +`NEWSLETTER_SCHEDULER_INTERVAL_MS`, +`NEWSLETTER_SCHEDULER_ENABLED` |
| `newsletter-*.spec.ts` | Scheduler: skip-on-busy, kill-switch, tick procesa vencidos (timers falsos) |
| Docs | NOTA prod + SPEC-030-A (RF-6 pasa a histórico) |

### 3.1 ADRs

> [!info] ADR-030C.1 — ¿Loop interno, cron externo o Payload Jobs?
> **Decisión**: **loop interno** (un cron es un loop; nadie fuera del CMS lo gatilla).
> - Cron externo: una pieza + un secreto para algo que el propio proceso puede hacer; se elimina.
> - Payload Jobs: correcto si hubiera multi-instancia o persistencia de intentos, pero hoy es sobredimensionado; queda como ruta de escape documentada en RN-C1.
> - Riesgo aceptado: lock en memoria + restricción de 1 instancia (volúmenes iniciales: cientos-miles bajos).

## 4. Referencias

- [[SPEC-030-A-creador-envio-masivo-cms]] (RF-5/RF-6/RN-A7 a reemplazar/extender)
- NOTA `docs/produccion/NOTA-despliegue-produccion-SPEC-030.md` (§cron + `CRON_SECRET` a limpiar al implementar)
- Next.js `instrumentation.ts` (`register()` corre una vez por arranque del server)

## 5. Trade-offs

- **Pro**: −1 servicio externo, −1 secreto, −1 punto de fallo; el programado funciona en cualquier entorno (hasta local) sin configurar nada.
- **Contra**: acopla el scheduling al ciclo de vida del proceso web (si el CMS está caído, nada se procesa — igual que hoy si el cron no puede alcanzar al CMS caído, empate); no escala horizontal sin cambiar a Jobs.
- **Diferido a propósito**: sin suscriptores no hay caso de uso; el envío manual cubre el mientras tanto.

---

| Fecha | Detalle |
|---|---|
| 2026-09-03 | **SPEC creada** (borrador). Diferida: sin suscriptores, sin fecha. |
