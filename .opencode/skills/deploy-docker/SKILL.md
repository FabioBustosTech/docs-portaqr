---
name: deploy-docker
description: Build, deploy y CI/CD con Docker. Incluye docker-compose, multi-stage builds y estrategias de despliegue.
---

# Deploy Docker

## When to Activate
Usa esta skill al crear o modificar configuraciones Docker, docker-compose o pipelines CI/CD.

## Patrones

### Docker Compose
- Frontend: puerto 7000
- Backend: puerto 7001
- MongoDB: puerto 7002

### Multi-stage Builds
- Stage 1: Build de dependencias
- Stage 2: Build de la app
- Stage 3: Producción (imagen mínima)

### Seguridad
- No exponer puertos innecesarios
- Usar usuarios no root
- Escanear imágenes con vulnerabilidades

## Checklist
- [ ] docker-compose.yml funcional
- [ ] Puertos correctos
- [ ] Variables de entorno configuradas
- [ ] Volúmenes para persistencia
