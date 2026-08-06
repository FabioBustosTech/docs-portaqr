---
description: Construye y despliega usando Docker Compose siguiendo las configuraciones del proyecto.
agent: general
---

Construye y despliega usando Docker Compose para el proyecto de venta de entradas.

Contexto: $ARGUMENTS

Primero, determina el entorno de desarrollo activo:
- Si el usuario especificó "desarrollo", "desarrollo2" o "desarrollo3", usa ese.
- Si no lo especificó, pregunta en qué entorno trabajar.

Pasos según el entorno:

### Entorno: desarrollo
1. **Build**: `docker compose build` en `desarrollo/`
2. **Deploy**: `docker compose up -d`
3. **Verifica**: Comprueba que los servicios respondan:
   - Frontend: http://localhost:7000
   - Backend: http://localhost:7001
   - MongoDB: puerto 7002

### Entorno: desarrollo2 / desarrollo3
- Estos entornos no tienen `docker-compose.yml` configurado.
- Informa al usuario que solo el entorno `desarrollo/` tiene Docker configurado.

Si hay errores, usa `@skill deploy-docker` o `@skill docker-patterns` para resolverlos.
