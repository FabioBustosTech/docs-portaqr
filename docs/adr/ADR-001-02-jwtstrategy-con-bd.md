---
title: "ADR-001-02: JwtStrategy con BD (user-service como fuente de verdad)"
date: 2026-08-06
tags:
  - adr
  - arquitectura
  - autenticacion
  - spec-001
estado: accepted
---

# ADR-001-02: JwtStrategy con BD (user-service como fuente de verdad)

**Fecha**: 2026-08-06
**Estado**: accepted

## Contexto

En la arquitectura original, `user-service` era la fuente de verdad de usuarios y emitía los JWT. El `bff-service` validaba tokens con su propia `JwtStrategy` que consultaba a `user-service` por HTTP. Al fusionar en el monolito, la estrategia JWT debe validar contra la misma BD `sistema` (RF-4) sin llamadas HTTP.

## Decisión

`JwtStrategy` del monolito (`src/auth/strategies/jwt.strategy.ts`) inyecta `UsersService` directamente (sin HTTP) y valida el payload `{sub, email, userName, role}` contra la BD. El payload del token se mantiene idéntico al de `user-service` para no romper tokens existentes.

## Alternativas Consideradas

### Alternativa 1: Validar solo el token (sin consultar BD)
- **Pros**: más rápido, sin dependencia de BD en cada request
- **Contras**: no detecta usuarios eliminados/desactivados; el token sigue válido tras el borrado
- **Por qué no**: se pierde la validación de estado del usuario que sí hacía user-service

### Alternativa 2: Consultar user-service por HTTP (como el bff)
- **Pros**: reutiliza el código del bff
- **Contras**: reintroduce latencia HTTP y el patrón proxy que se quiere eliminar (CA-07)
- **Por qué no**: contradice el objetivo del monolito

### Alternativa 3: Inyectar UsersService directo (elegida)
- **Pros**: validación contra BD sin HTTP, un solo proceso, tokens compatibles
- **Contras**: `JwtStrategy` depende de `UsersModule` (debe importarse en `AuthModule`)

## Consecuencias

### Positivas
- Tokens JWT existentes siguen funcionando (mismo payload y secreto)
- Validación de usuarios contra BD real
- Sin latencia HTTP

### Negativas
- `AuthModule` debe importar `UsersModule` (acoplamiento auth → users, aceptable)

### Riesgos
- **Secreto JWT compartido**: `JWT_SECRET=tu_clave_secreta_muy_segura_2024` debe mantenerse igual en Railway para no invalidar sesiones
- **RolesGuard**: se usó la versión de qr-service (solo `Reflector`, lee `request.user.role`); la versión de user-service (con `JwtService`) rompía módulos que no importan AuthModule

## Relacionado

- [[SPEC-001-migracion-monolito-modular]]
- [[ADR-001-01]]
- [[ADR-001-03]]