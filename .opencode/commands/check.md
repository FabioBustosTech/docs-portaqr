---
description: Ejecuta las validaciones del proyecto: TypeScript, tests, linter y cobertura.
agent: general
---

Ejecuta las validaciones de calidad del proyecto para verificar que todo está correcto.

Contexto adicional: $ARGUMENTS

Pasos a seguir:
1. **TypeScript**: Ejecuta `tsc --noEmit` en backend y frontend
2. **Tests**: Ejecuta `npm test` o el comando de tests correspondiente
3. **Linter**: Verifica que no hay warnings (excepto en tests)
4. **Reporta**: Si hay errores, indica qué corregir

Recuerda: Los warnings solo están permitidos en archivos de tests.
