---
description: Ejecuta una revisión de código completa usando @code-reviewer y @security-officer.
agent: code-reviewer
---

Realiza una code review completa del código propuesto.

Contexto: $ARGUMENTS

Cubre estas áreas:
1. **Calidad del código**: legibilidad, naming, estructura
2. **Buenas prácticas**: patrones, SOLID, clean code
3. **Seguridad**: validación de inputs, sanitización, autenticación
4. **Rendimiento**: queries, memoria, caching
5. **Testing**: cobertura, casos edge

Proporciona feedback con:
- Ubicación exacta (archivo:línea)
- Problema identificado
- Sugerencia concreta
- Prioridad (alta/media/baja)
