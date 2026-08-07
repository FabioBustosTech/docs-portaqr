---
title: "ADR-001-03: Controllers de user/qr-service como base (validaciones de authz)"
date: 2026-08-06
tags:
  - adr
  - arquitectura
  - autorizacion
  - spec-001
estado: accepted
---

# ADR-001-03: Controllers de user/qr-service como base (validaciones de authz)

**Fecha**: 2026-08-06
**Estado**: accepted

## Contexto

Al fusionar los 3 servicios en el monolito, los controllers de `bff-service` (proxy) no tenían validaciones de autorización reales: delegaban al servicio destino. Los controllers de `user-service` y `qr-service` sí validaban propietario y roles (ej. `GET /qr/:id` devuelve 403 si `!admin && qr.userId !== user.id`). La decisión es qué controllers usar como base.

## Decisión

Usar los controllers de `user-service` y `qr-service` como base (los que tienen validaciones de authz reales), NO los del `bff-service`. El `bff-service` solo aportó el `HealthModule` unificado y la lógica de `qr-free-generation` que no existía en qr-service.

## Alternativas Consideradas

### Alternativa 1: Usar controllers del bff (proxy)
- **Pros**: contratos "amigables" para el frontend
- **Contras**: sin validación de propietario (inseguro), duplicación de lógica
- **Por qué no**: un usuario podría ver QRs ajenos — vulnerabilidad de autorización

### Alternativa 2: Usar controllers de user/qr-service (elegida)
- **Pros**: validaciones de authz reales (403 para recursos ajenos), contratos más expresivos (`{data, pagination}`)
- **Contras**: el frontend debe adaptarse al contrato nuevo (ya lo hace: `qr.service.ts` consume `data.pagination`)

### Alternativa 3: Mezclar ambos por endpoint
- **Pros**: flexibilidad
- **Contras**: inconsistencia de contratos, mantenimiento confuso
- **Por qué no**: se decidió mantener la firma del qr-service tal cual (§6.4/§7.2) porque el front ya la soporta

## Consecuencias

### Positivas
- Autorización real por propietario y rol (CA-01/CA-05 verificados)
- Contrato único y expresivo
- `GET /qr` responde `{data, pagination}` — el frontend ya lo consume (verificado en `qr-app/src/services/qr.service.ts` líneas 206-210)

### Negativas
- `GET /qr` cambió de array a `{data, pagination}` (diferencia de contrato documentada en §6.4)
- `GET /qr/user/favorites` ahora usa `@GetUser()` en vez de `userId` por query (se acepta ambos para compatibilidad)

### Riesgos
- **Frontend con contrato viejo**: mitigado — se verificó que `qr.service.ts` ya consume `{data, pagination}`
- **Colecciones Postman**: se actualizaron las variables a `http://localhost:3004` al correr con Newman (CA-04 OK)

## Relacionado

- [[SPEC-001-migracion-monolito-modular]]
- [[ADR-001-01]]
- [[ADR-001-02]]