# AGENTS.md — Plataforma QR

Reglas globales del proyecto **Plataforma QR**. Léelas al iniciar cualquier tarea.

## Estructura del repositorio

```
plataforma_qr_cursor/
├── desarrollo-qr/          # Ambiente de desarrollo (código fuente)
│   ├── backend-portaqr/    # Backend NestJS (monolito modular, ÚNICO backend activo, puerto 3004)
│   ├── qr-app/             # Frontend Next.js (puerto 3000)
│   ├── qr-cms/             # CMS del blog (Payload CMS 3.x, puerto 3005)
│   ├── bff-service/        # DEPRECADO (SPEC-001) — no se usa
│   ├── user-service/       # DEPRECADO (SPEC-001) — no se usa
│   ├── qr-service/         # DEPRECADO (SPEC-001) — no se usa
│   ├── e2e-tests-portaqr/  # Tests E2E
│   ├── portaqrtest-main/   # (legacy / pruebas)
│   ├── docker-compose.yml  # Orquestación local (mongo, mongo-express, servicios)
│   └── mongo-init.js       # Inicialización de MongoDB
├── docs/                   # Documentación (Obsidian)
│   ├── spec/               # Especificaciones técnicas SPEC-XXX
│   ├── backup-db/          # Backups de base de datos (no versionar)
│   └── tareas/             # Archivos JSON de tareas (uno por SPEC)
├── miselanios/             # Archivos misceláneos (no versionar)
└── .opencode/              # Configuración de agentes y skills
```

## Entorno de desarrollo

- **Ambiente único**: `desarrollo-qr/` (no existen `desarrollo/`, `desarrollo2/` ni `desarrollo3/`).
- **Regla de aislamiento**: Trabaja SOLO dentro de `desarrollo-qr/`. No modifiques archivos fuera de ese entorno.
- **Servicios** (docker-compose):
  - `qr-app` (Next.js): http://localhost:3000
  - `backend-portaqr` (NestJS, monolito modular): http://localhost:3004
  - `qr-cms` (Payload CMS): http://localhost:3005/admin
  - `mongo-express`: http://localhost:8081
  - `mongo`: localhost:27017
  - **DEPRECADOS (SPEC-001, comentados en docker-compose, NO se usan):** `bff-service` (:3001), `user-service` (:3002), `qr-service` (:3003). Toda la lógica vive en `backend-portaqr`; `qr-app` apunta a `NEXT_PUBLIC_BFF_URL=http://backend-portaqr:3004`.

## Stack tecnológico

| Capa | Tecnología |
| ---- | ---------- |
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, Mongoose/MongoDB |
| Base de datos | MongoDB (`sistema`) |
| Autenticación | JWT RS256 + jose (backend y frontend), tokenVersion + logout |
| Pagos | Webpay / Transbank |
| CMS | Payload CMS 3.x (Next.js) + Cloudflare R2 |
| Infraestructura | Docker Compose, Railway |

## Proceso de desarrollo

> [!important] Workflow de implementación
> Al **implementar una SPEC**, sigue el proceso detallado en `rules/common/implementation-workflow.md` (obligatorio). Resumen:

1. **Especificación**: Las especificaciones técnicas se guardan en `docs/spec/SPEC-XXX-nombre.md` (formato en `rules/common/spec-driven-development.md`).
2. **Tareas**: Regístralas en `docs/tareas/SPEC-XXX-tareas.json` (formato Taskmaster-compatible, un archivo JSON por SPEC: tasks con `id`, `content`, `status`, `priority`, `dependencies`, `subtasks`). **No crear `.taskmaster/`** — el usuario lo eliminó; las tareas viven en `docs/tareas/`.
3. **Ramas**:
   - **Repos de desarrollo** (`qr-app`, `backend-portaqr`, `qr-cms`, `e2e-tests-portaqr`): crea una rama feature por SPEC en **cada repo afectado** (`feat/spec-XXX-descripcion`). Nunca commitees directo a `main` en estos repos.
   - **Repo principal** (`plataforma_qr_cursor`, donde viven `docs/`, `AGENTS.md`, `rules/`): **NO usar ramas** — los cambios de documentación y tareas se commitean **directo a `main`**.
4. **Ciclo por tarea**: implementa cada tarea con su **test unitario** (nuevo o actualizado), valida (`tsc --noEmit`, `lint`, `jest`), haz un **commit atómico** por tarea, y **marca la tarea como `done` en tiempo real** (no al final) para reflejar el avance.
5. **Tests E2E**: agrega tests E2E (Playwright) en `e2e-tests-portaqr` para los **flujos que toca la SPEC**.
6. **TypeScript**: Todo el código debe pasar validaciones de tipos sin errores antes de commitear.
7. **Salvaguardas**: Nunca uses `--no-verify` o `-n` para saltarte los hooks de Husky.
8. **Documentación**: La documentación vive en `docs/` (vault Obsidian). Usa wikilinks `[[...]]`, frontmatter y callouts.

## Herramientas de análisis de código

### codebase-memory-mcp (MCP) — Para encontrar y entender código
- `search_graph(name_pattern=".*NombreServicio.*")` — encontrar servicios, controladores, módulos
- `trace_path(function_name="Servicio", direction="inbound")` — quién usa un servicio
- `get_code_snippet(qualified_name="ruta/Servicio")` — leer implementación de una función
- `get_architecture(project="...", aspects=["routes"])` — listar endpoints HTTP del backend

### Graphify (CLI) — Para entender relaciones altas
- `graphify explain "EventModule"` — qué módulos se relacionan
- `graphify path "Controller" "Service"` — cómo se conectan componentes

### Payload CMS (MCP) — Para interactuar con el CMS del blog (`qr-cms`)

El proyecto tiene dos MCP de Payload configurados en `.opencode/opencode.json`:
- `payload` — CMS local (`http://localhost:3005/api/mcp`)
- `payload-prod` — CMS producción (Railway)

Tools disponibles (prefijo `payload_` / `payload-prod_`):
- `findPosts` / `createPosts` / `updatePosts` / `deletePosts` — gestionar posts del blog
- `findMedia` / `uploadMedia` / `updateMedia` / `updateMediaFile` — imágenes (WebP, R2)
- `findCategories` / `createCategories` / `updateCategories` / `deleteCategories` — categorías
- `findUsers` — usuarios del admin

Úsalas para crear/editar contenido del blog, subir imágenes o consultar el CMS sin tocar el admin web. El blog público (`qr-app`) consume la REST API de Payload con ISR. Especificaciones: `docs/spec/SPEC-023-blog-payload-cms-isr.md` y derivadas (`SPEC-023-A/B/C/D`).

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