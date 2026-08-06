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
2. La SPEC se registra en Taskmaster (`.taskmaster/tasks/tasks.json`) como tarea.
3. El desarrollo se hace en una rama feature separada.
4. Al terminar, la SPEC se actualiza con el estado final (`implementado`).