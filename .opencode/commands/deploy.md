---
description: Construye y despliega usando Docker Compose siguiendo las configuraciones del proyecto.
agent: general
---

Construye y despliega usando Docker Compose para el proyecto Plataforma QR.

Contexto: $ARGUMENTS

El entorno de desarrollo activo es `desarrollo-qr/` (único ambiente del proyecto).

Pasos:

1. **Build**: `docker compose build` en `desarrollo-qr/`
2. **Deploy**: `docker compose up -d`
3. **Verifica**: Comprueba que los servicios respondan:
   - Frontend (qr-app): http://localhost:3000
   - Backend (bff-service): http://localhost:3001
   - user-service: http://localhost:3002
   - qr-service: http://localhost:3003
   - mongo-express: http://localhost:8081
   - MongoDB: localhost:27017

Si hay errores, usa `@skill deploy-docker` o `@skill docker-patterns` para resolverlos.