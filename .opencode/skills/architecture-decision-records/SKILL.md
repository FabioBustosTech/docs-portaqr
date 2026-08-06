---
name: architecture-decision-records
description: Capturar decisiones arquitectónicas como ADRs estructurados. Registra contexto, alternativas consideradas y rationale para que futuros desarrolladores entienden la forma del código.
---

# Architecture Decision Records (ADR)

## When to Activate
- El usuario dice "registra esta decisión" o "haz un ADR de esto"
- Se elige entre alternativas significativas (framework, librería, patrón, BD)
- El usuario dice "decidimos hacer X porque..."
- Durante la planificación cuando se discuten trade-offs arquitectónicos
- Alguien pregunta "¿por qué elegimos X?"

## Formato ADR

```markdown
# ADR-NNNN: [Título de la Decisión]

**Fecha**: YYYY-MM-DD
**Estado**: proposed | accepted | deprecated | superseded by ADR-NNNN

## Contexto
¿Qué problema motiva esta decisión? (2-5 líneas)

## Decisión
¿Qué cambio se propone? (1-3 líneas)

## Alternativas Consideradas

### Alternativa 1: [Nombre]
- **Pros**: [beneficios]
- **Contras**: [desventajas]
- **Por qué no**: [razón de rechazo]

### Alternativa 2: [Nombre]
- **Pros**: [beneficios]
- **Contras**: [desventajas]
- **Por qué no**: [razón de rechazo]

## Consecuencias
### Positivas
- [beneficio 1]

### Negativas
- [trade-off 1]

### Riesgos
- [riesgo y mitigación]
```

## Estructura de Archivos

```
docs/adr/
├── README.md       ← índice de todos los ADRs
├── 0001-use-nextjs.md
├── 0002-mongodb-over-postgres.md
└── template.md     ← template para uso manual
```

## Índice de ADRs

```markdown
# Architecture Decision Records

| ADR | Título | Estado | Fecha |
|-----|--------|--------|-------|
| [0001](0001-use-nextjs.md) | Next.js como frontend framework | accepted | 2026-07-01 |
| [0002](0002-mongodb-over-postgres.md) | MongoDB sobre PostgreSQL | accepted | 2026-07-05 |
```

## Categorías que Merecen ADR

| Categoría | Ejemplos |
|-----------|----------|
| **Tecnología** | Framework, lenguaje, BD, cloud provider |
| **Arquitectura** | Monolito vs microservicios, event-driven, CQRS |
| **API** | REST vs GraphQL, versionado, auth |
| **Infraestructura** | Deploy, CI/CD, monitoreo |
| **Seguridad** | Estrategia de auth, encriptación |
| **Testing** | Framework, cobertura, E2E vs unitario |

## Qué Hace un Buen ADR

### ✅ Hacer
- Ser específico: "Usar Prisma ORM" no "usar un ORM"
- Registrar el por qué: el rationale importa más que el qué
- Incluir alternativas rechazadas
- Ser honesto con las consecuencias
- Mantenerlo corto: legible en 2 minutos

### ❌ No Hacer
- Registrar decisiones triviales
- Escribir ensayos
- Omitir alternativas
- Dejar ADRs obsoletos sin marcar

## Ciclo de Vida

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

## Checklist
- [ ] Contexto claro del problema
- [ ] Decisión específica y concreta
- [ ] Mínimo 2 alternativas consideradas
- [ ] Consecuencias documentadas
- [ ] Número correlativo
