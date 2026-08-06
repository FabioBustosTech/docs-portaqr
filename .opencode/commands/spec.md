---
description: Genera una plantilla SPEC en doc/spect/ siguiendo el formato del proyecto.
agent: architect
---

Crea una especificación técnica en `doc/spect/` para el siguiente requerimiento.

Sigue esta estructura:

```markdown
# SPEC-XXX: [Nombre]

## Fecha
YYYY-MM-DD

## Objetivo
[¿Qué problema resuelve?]

## Especificación
- [Requisitos funcionales]
- [Criterios de aceptación]
- [Reglas de negocio]

## Diseño Técnico
- [Arquitectura / componentes]
- [Flujo de datos]
- [Contratos de API]

## Mockups / Referencias
[links a diseños, diagramas]

## Trade-offs
[Decisiones y alternativas consideradas]
```

Requerimiento: $ARGUMENTS

Asigna el número correlativo al último en `doc/spect/`. Usa `@doc-writer` para dar formato final si es necesario.
