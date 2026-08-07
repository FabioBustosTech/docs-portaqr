---
title: "ADR-001-01: Monolito modular backend-portaqr"
date: 2026-08-06
tags:
  - adr
  - arquitectura
  - spec-001
estado: accepted
---

# ADR-001-01: Monolito modular backend-portaqr

**Fecha**: 2026-08-06
**Estado**: accepted

## Contexto

La plataforma QR tenía 3 microservicios NestJS separados (`bff-service` en 3001, `user-service` en 3002, `qr-service` en 3003) que se comunicaban por HTTP. El `bff-service` actuaba como proxy hacia los otros dos, duplicando lógica de autenticación y contratos. Esto generaba: mantenimiento duplicado, latencia extra por llamadas HTTP internas, y complejidad de despliegue (3 servicios + frontend).

La SPEC-001 propuso migrar a un **monolito modular** (`backend-portaqr/`) que fusiona los 3 servicios en un solo proceso NestJS con módulos por dominio.

## Decisión

Crear `desarrollo-qr/backend-portaqr/` como monolito modular NestJS que contiene los módulos de los 3 servicios: `AuthModule`, `UsersModule`, `QrModule`, `ScanModule`, `PlanModule`, `PetTagModule`, `QrActivateModule`, `QrFreeGenerationModule`, `StatisticsModule`, `MailModule`, `WebpayModule`, `HealthModule`. Corre en el puerto **3004** (decisión del usuario: mantener los servicios viejos corriendo en paralelo).

## Alternativas Consideradas

### Alternativa 1: Mantener microservicios con BFF
- **Pros**: aislamiento por dominio, escalado independiente
- **Contras**: 3 deploys, latencia HTTP interna, duplicación de auth, complejidad operacional
- **Por qué no**: el equipo es pequeño y la carga no justifica la complejidad; el BFF duplicaba contratos

### Alternativa 2: Monolito clásico (todo en un módulo)
- **Pros**: máximo simple
- **Contras**: sin límites de dominio, difícil de mantener a escala
- **Por qué no**: se pierde la separación por dominio que ya existía en los microservicios

### Alternativa 3: Monolito modular (elegida)
- **Pros**: un solo deploy, módulos por dominio reutilizando el código existente, sin llamadas HTTP internas, tests unitarios simples
- **Contras**: acoplamiento implícito entre módulos si no se respetan los límites

## Consecuencias

### Positivas
- Un solo servicio a desplegar (Railway: 1 backend en vez de 3)
- Eliminación de proxies HTTP (`HttpService`/`firstValueFrom` — CA-07 verificado: cero en `src/`)
- BD unificada `sistema` (RF-4) sin cambios
- Tests unitarios directos sin mocking de HTTP

### Negativas
- Los módulos comparten el mismo proceso: un error en un módulo puede afectar a otros
- Se requiere disciplina para no importar servicios entre módulos arbitrariamente

### Riesgos
- **Acoplamiento entre módulos**: mitigado con imports absolutos `src/...` y revisión en code review
- **Puerto 3001 ocupado por bff-service**: mitigado corriendo el mono en 3004 hasta el cleanup

## Relacionado

- [[SPEC-001-migracion-monolito-modular]]
- [[ADR-001-02]]
- [[ADR-001-03]]