---
name: testing-backend
description: Patrones de testing para backend NestJS. Incluye cobertura, mocking, tests de integración y estrategias de testing.
---

# Testing Backend

## When to Activate
Usa esta skill cuando necesites crear o actualizar tests para el backend NestJS.

## Patrones de Testing

### Tests Unitarios
- Usar Jest con `@nestjs/testing`
- Mockear dependencias con `jest.fn()` o `createMock()`
- Probar casos: happy path, errores, edge cases

### Tests de Integración
- Usar `supertest` + `MongoMemoryServer`
- Probar endpoints REST completos
- Incluir validación de autenticación y autorización

### Cobertura
- Statements y Lines > 90%
- Branches y Functions > 70%
- Excepción: archivos de configuración y tipos

## Checklist
- [ ] Happy path cubierto
- [ ] Edge cases cubiertos
- [ ] Errores validados
- [ ] Mocks correctamente tipados
