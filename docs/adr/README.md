---
title: "Architecture Decision Records"
date: 2026-08-06
tags:
  - adr
  - indice
---

# Architecture Decision Records

Registro de decisiones arquitectónicas del proyecto **Plataforma QR**.

| ADR | Título | Estado | Fecha |
|-----|--------|--------|-------|
| [[ADR-001-01-monolito-modular-backend-portaqr\|ADR-001-01]] | Monolito modular backend-portaqr | accepted | 2026-08-06 |
| [[ADR-001-02-jwtstrategy-con-bd\|ADR-001-02]] | JwtStrategy con BD (user-service como fuente de verdad) | accepted | 2026-08-06 |
| [[ADR-001-03-controllers-user-qr-service-como-base\|ADR-001-03]] | Controllers de user/qr-service como base (validaciones de authz) | accepted | 2026-08-06 |
| [[ADR-004-01-usereducer-formularios-complejos\|ADR-004-01]] | useReducer para formularios complejos en qr-app | accepted | 2026-08-09 |
| [[ADR-004-02-recipe-refactor-componentes-gigantes\|ADR-004-02]] | Recipe de refactor de componentes gigantes (helpers puros + subcomponentes) | accepted | 2026-08-09 |
| [[ADR-004-03-contrato-values-onfieldchange-contexto-separado\|ADR-004-03]] | Contrato values + onFieldChange y contexto separado para formularios | accepted | 2026-08-09 |
| [[ADR-004-04-errores-conocidos-gotchas\|ADR-004-04]] | Errores conocidos y gotchas (SPEC-004/004-B) | accepted | 2026-08-09 |

## Relacionado

- [[SPEC-001-migracion-monolito-modular]] — especificación que motiva los ADR-001
- [[SPEC-004-react-doctor-qr-app]] — auditoría react-doctor (motiva ADR-004-01)
- [[SPEC-004-B-no-giant-component-qr-app]] — refactor de componentes gigantes (motiva ADR-004-02/03/04)
- [[SPEC-001-tareas]] — estado de ejecución de la spec