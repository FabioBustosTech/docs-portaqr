---
name: docker-patterns
description: Patrones de Docker y Docker Compose para desarrollo local, seguridad de contenedores, networking, volúmenes y orquestación multi-servicio.
---

# Docker Patterns

## When to Activate
- Configurando Docker Compose para desarrollo local
- Diseñando arquitecturas multi-contenedor
- Revisando Dockerfiles por seguridad y tamaño
- Migrando de desarrollo local a contenedores

## Docker Compose para Desarrollo

```yaml
services:
  app:
    build:
      context: .
      target: dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodata:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh
      interval: 10s
      retries: 5

volumes:
  mongodata:
```

## Multi-stage Dockerfile

```dockerfile
# Stage: deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage: dev
FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "dev"]

# Stage: build
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage: production
FROM node:22-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

## Seguridad

```dockerfile
# Run as non-root
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app

# No secrets in image layers
ENV API_KEY  # Inyectar en runtime, no en build
```

```yaml
# docker-compose.yml
services:
  app:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

## .dockerignore

```
node_modules
.git
.env
.env.*
dist
coverage
*.log
.next
.cache
docker-compose*.yml
Dockerfile*
tests/
```

## Comandos Útiles

```bash
# Logs
docker compose logs -f app

# Shell
docker compose exec app sh

# Rebuild
docker compose up --build

# Clean up
docker compose down -v  # CUIDADO: borra volúmenes
docker system prune     # Limpia resources no usados
```

## Anti-Patterns
- ❌ Usar :latest — siempre pin versión específica
- ❌ Correr como root — siempre crear usuario no-root
- ❌ Secrets en docker-compose.yml — usar .env (gitignored)
- ❌ Un contenedor con todo — un proceso por contenedor
- ❌ Data sin volúmenes — contenedores son efímeros

## Checklist
- [ ] Multi-stage build
- [ ] Non-root user
- [ ] .dockerignore
- [ ] Sin :latest
- [ ] Volúmenes para datos persistentes
- [ ] Healthchecks configurados
