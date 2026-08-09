# Spec-Driven Development (SDD)

Proceso para crear especificaciones técnicas en `docs/spec/`.

## Ubicación

- Las especificaciones viven en `docs/spec/SPEC-XXX-nombre.md`.
- El número `XXX` es correlativo al último SPEC existente en la carpeta.

## Formato de una SPEC

```markdown
---
title: "SPEC-XXX: [Nombre]"
date: YYYY-MM-DD
tags:
  - spec
  - [dominio]
status: borrador
---

# SPEC-XXX: [Nombre]

> [!abstract] Decisión clave
> [Resumen de la decisión principal]

> [!info] Metadatos
> - **Estado:** Borrador
> - **Fecha:** YYYY-MM-DD
> - **Componente destino:** [ruta/]

## 1. Objetivo
[¿Qué problema resuelve?]

## 2. Especificación
- [Requisitos funcionales]
- [Criterios de aceptación]
- [Reglas de negocio]

## 3. Diseño Técnico
- [Arquitectura / componentes]
- [Flujo de datos]
- [Contratos de API]

## 4. Mockups / Referencias
[links a diseños, diagramas]

## 5. Trade-offs
[Decisiones y alternativas consideradas]
```

## Reglas

1. Toda feature nueva requiere una SPEC antes de implementar.
2. La SPEC se registra como tarea en `docs/tareas/SPEC-XXX-tareas.json` (formato Taskmaster-compatible). **No crear `.taskmaster/`**: el usuario lo eliminó explícitamente; las tareas viven en `docs/tareas/`.
3. El desarrollo se hace en una rama feature separada.
4. Al terminar, la SPEC se actualiza con el estado final (`implementado`).

## Lecciones aprendidas (SPEC-001)

- **Monolito modular**: al fusionar microservicios, usar los controllers con validaciones de authz reales (no los del proxy/BFF). Documentar en ADRs (`docs/adr/`).
- **Imports absolutos `src/...`**: funcionan en NestJS con `baseUrl: './'` en tsconfig, pero Jest NO los resuelve solo con baseUrl — añadir `moduleNameMapper` `"^src/(.*)$": "<rootDir>/$1"` en el jest config de `package.json`.
- **Versiones pinned**: fijar versiones exactas de dependencias críticas (`mongoose` 8.9.3 exacto — el caret trae tipos más estrictos que rompen `.lean()`; `nanoid` ^3.3.8 CommonJS — ^5 es ESM-only).
- **Guards globales**: si `JwtAuthGuard` es global (`APP_GUARD`), los endpoints públicos necesitan `@Public()` explícito (ej. `/health`).
- **RolesGuard**: usar la versión que solo depende de `Reflector` (lee `request.user.role`); versiones que inyectan `JwtService` rompen módulos que no importan AuthModule.
- **Validación de contrato (CA-04)**: correr colecciones Postman con Newman (`npx newman run coleccion.json --env-var base_url=...`); los 404/500 por placeholders (`your_id_here`) son esperados y no indican rutas faltantes.
- **Puertos**: si un servicio viejo ocupa el puerto de la spec, usar otro puerto (ej. 3004) en vez de detener el servicio, salvo que el usuario indique lo contrario.