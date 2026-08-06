# AGENTS.md — Plataforma QR

Reglas globales del proyecto **Plataforma QR**. Léelas al iniciar cualquier tarea.

## Estructura del repositorio

```
plataforma_qr_cursor/
├── desarrollo-qr/          # Ambiente de desarrollo (código fuente)
│   ├── bff-service/        # Backend NestJS (BFF, puerto 3001)
│   ├── qr-app/             # Frontend Next.js (puerto 3000)
│   ├── user-service/       # Microservicio usuarios (puerto 3002)
│   ├── qr-service/         # Microservicio QR (puerto 3003)
│   ├── docker-compose.yml  # Orquestación local (mongo, mongo-express, servicios)
│   └── mongo-init.js       # Inicialización de MongoDB
├── docs/                   # Documentación (Obsidian)
│   ├── spec/               # Especificaciones técnicas SPEC-XXX
│   ├── backup-db/          # Backups de base de datos (no versionar)
│   └── tarea/              # Notas de tareas
├── miselanios/             # Archivos misceláneos (no versionar)
└── .opencode/              # Configuración de agentes y skills
```

## Entorno de desarrollo

- **Ambiente único**: `desarrollo-qr/` (no existen `desarrollo/`, `desarrollo2/` ni `desarrollo3/`).
- **Regla de aislamiento**: Trabaja SOLO dentro de `desarrollo-qr/`. No modifiques archivos fuera de ese entorno.
- **Servicios** (docker-compose):
  - `qr-app` (Next.js): http://localhost:3000
  - `bff-service` (NestJS): http://localhost:3001
  - `user-service` (NestJS): http://localhost:3002
  - `qr-service` (NestJS): http://localhost:3003
  - `mongo-express`: http://localhost:8081
  - `mongo`: localhost:27017

## Stack tecnológico

| Capa | Tecnología |
| ---- | ---------- |
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, Mongoose/MongoDB |
| Base de datos | MongoDB (`sistema`) |
| Autenticación | JWT (backend), next-auth (frontend) |
| Pagos | Webpay / Transbank |
| Infraestructura | Docker Compose, Railway |

## Proceso de desarrollo

1. **Especificación**: Las especificaciones técnicas se guardan en `docs/spec/SPEC-XXX-nombre.md` (formato en `rules/common/spec-driven-development.md`).
2. **Tareas**: Regístralas en Taskmaster (`.taskmaster/tasks/tasks.json`) antes de implementar.
3. **Ramas**: Trabaja en ramas feature separadas. Nunca commitees directo a `main`.
4. **TypeScript**: Todo el código debe pasar validaciones de tipos sin errores antes de commitear.
5. **Tests**: Genera tests unitarios para todo el código desarrollado.
6. **Salvaguardas**: Nunca uses `--no-verify` o `-n` para saltarte los hooks de Husky.
7. **Documentación**: La documentación vive en `docs/` (vault Obsidian). Usa wikilinks `[[...]]`, frontmatter y callouts.

## Herramientas de análisis de código

### codebase-memory-mcp (MCP) — Para encontrar y entender código
- `search_graph(name_pattern=".*NombreServicio.*")` — encontrar servicios, controladores, módulos
- `trace_path(function_name="Servicio", direction="inbound")` — quién usa un servicio
- `get_code_snippet(qualified_name="ruta/Servicio")` — leer implementación de una función
- `get_architecture(project="...", aspects=["routes"])` — listar endpoints HTTP del backend

### Graphify (CLI) — Para entender relaciones altas
- `graphify explain "EventModule"` — qué módulos se relacionan
- `graphify path "Controller" "Service"` — cómo se conectan componentes

### Lectura manual — Para verificar implementaciones concretas
- Usar `read`, `grep`, `glob` para leer archivos específicos, buscar strings exactos, revisar configs

## Memoria persistente (Engram)

El proyecto tiene acceso a **Engram**, memoria persistente que sobrevive entre sesiones, aislada por proyecto:

- **Proyecto**: `plataforma_qr_cursor` (aislamiento por proyecto nativo — no se mezcla con otros repos).
- **Tools MCP**: `mem_save`, `mem_search`, `mem_context`, `mem_update`, `mem_delete`, `mem_session_summary`, `mem_stats`, `mem_timeline`, `mem_get_observation`, `mem_suggest_topic_key`, `mem_save_prompt`.
- **Cuándo guardar** (obligatorio): bug fix completado, decisión de arquitectura, descubrimiento no obvio, cambio de configuración, patrón establecido, preferencia del usuario.
- **Cuándo buscar**: el usuario pide recordar algo, o empiezas trabajo que pudo hacerse antes (usa `mem_search` con keywords del mensaje inicial).
- **Cierre de sesión**: antes de terminar, llama `mem_session_summary` con Goal / Discoveries / Accomplished / Next Steps / Relevant Files.
- **Tras compactación**: si ves "FIRST ACTION REQUIRED", llama `mem_session_summary` de inmediato para persistir lo hecho antes del compactado.

Formato `mem_save`:
- **title**: Verbo + qué (corto, buscable)
- **type**: bugfix | decision | architecture | discovery | pattern | config | preference
- **scope**: `project` (default) | `personal`
- **topic_key** (opcional): clave estable para decisiones en evolución (ej. `architecture/auth-model`)
- **content**: What / Why / Where / Learned

## Reglas de Git

- Mensajes de commit concisos y descriptivos en español.
- No commitear secretos ni archivos `.env`.
- Revisar `git status` y `git diff` antes de commitear.
- Solo commitear, hacer push o crear PRs cuando se solicite explícitamente.