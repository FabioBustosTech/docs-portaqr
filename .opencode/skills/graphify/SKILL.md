---
name: graphify
description: "Grafo de conocimiento del proyecto plataforma_qr_cursor. Usar para preguntas sobre arquitectura, relaciones entre archivos, o estructura del codebase. Si existe graphify-out/graph.json, consultar el grafo primero."
---

# /graphify - Grafo de Conocimiento del Proyecto

## Configuración del Proyecto

**Archivo de configuración**: `graphify.config.json` (raíz del proyecto)
**Archivo de exclusión**: `.graphifyignore` (misma sintaxis que .gitignore)

### Estructura de Directorios

```
plataforma_qr_cursor/
├── desarrollo-qr/                ← Entorno de desarrollo (Docker)
│   ├── bff-service/               Backend NestJS (puerto 3001)
│   ├── qr-app/                    Frontend Next.js (puerto 3000)
│   ├── user-service/              Microservicio usuarios (puerto 3002)
│   ├── qr-service/                Microservicio QR (puerto 3003)
│   └── docker-compose.yml         MongoDB en puerto 27017
├── docs/
│   ├── spec/                      Specs del proyecto (SPEC-XXX)
│   ├── tarea/                     Notas de tareas
│   └── backup-db/                 Backups de base de datos (no versionar)
├── rules/                         Reglas del proyecto
├── miselanios/                    ❌ EXCLUIDO (archivos misceláneos)
└── graphify-out/                  Grafo combinado (backend + frontend)
```

### Directorios Excluidos (`.graphifyignore`)

- `docs/backup-db/` — Backups de base de datos
- `miselanios/` — Archivos misceláneos
- `node_modules/`, `dist/`, `.next/`, `build/`

---

## Referencia Completa de Comandos

### Construir el Grafo

```bash
# Construir grafo del directorio actual (excluye lo que diga .graphifyignore)
/graphify .

# Construir de una ruta específica
/graphify ./desarrollo-qr/bff-service

# Modo profundo (extrae más relaciones, usa LLM)
/graphify . --mode deep

# Solo código (sin docs, sin costo LLM) ← RECOMENDADO para este proyecto
graphify extract ./desarrollo-qr/bff-service ./desarrollo-qr/qr-app --code-only --out .

# Extraer con backend específico
graphify extract . --backend gemini
graphify extract . --backend ollama    # local, sin API key
graphify extract . --backend claude    # usa ANTHROPIC_API_KEY
```

### Actualizar el Grafo

```bash
# Actualización incremental (solo archivos cambiados, sin costo LLM)
/graphify . --update
graphify update .

# Forzar reconstrucción completa (después de refactor grande)
graphify update . --force

# Solo reclustering (sin re-extract)
/graphify . --cluster-only
graphify cluster-only .

# Reclustering con resolución personalizada
graphify cluster-only . --resolution 1.5    # comunidades más pequeñas
graphify cluster-only . --exclude-hubs 99   # excluir nodos hub del ranking
```

### Actualizar y copiar a docs/graphs/ (opcional)

Actualiza los grafos individuales de backend y frontend y los copia automáticamente a `docs/graphs/` para versionarlos en el repo principal:

```bash
# Script que actualiza backend + frontend y copia a docs/graphs/
powershell -File scripts/update-graphs.ps1

# Luego commitear los grafos en el repo principal
git add docs/graphs/
git commit -m "docs: actualizar grafos"
```

> [!note] Si `scripts/update-graphs.ps1` no existe en este proyecto, crear los grafos individuales manualmente con `graphify extract` y copiarlos a `docs/graphs/`.

Los grafos quedan en:
- `docs/graphs/backend/` — Grafo individual del backend
- `docs/graphs/frontend/` — Grafo individual del frontend
- `graphify-out/` — Grafo combinado (backend + frontend)

### Consultar el Grafo

```bash
# Pregunta sobre el codebase
graphify query "como funciona el checkout"
graphify query "que modulos dependen de auth"
graphify query "rutas del frontend que llaman al backend"

# Modo DFS (trazado específico)
graphify query "flujo de autenticacion" --dfs

# Limitar presupuesto de tokens
graphify query "explicar modulo de eventos" --budget 1500

# Camino entre dos conceptos
graphify path "AuthModule" "Database"
graphify path "Evento" "Entrada"

# Explicar un nodo
graphify explain "EventService"
graphify explain "UsuarioController"

# Encontrar impacto inverso (qué afecta a X)
graphify affected "AuthService"
graphify affected "Evento" --relation calls --depth 3
```

### Exportar

```bash
# HTML interactivo (si grafo < 5000 nodos)
graphify export html

# HTML de flujo de llamadas
graphify export callflow-html
graphify export callflow-html --max-sections 8
graphify export callflow-html --output docs/arquitectura.html

# SVG (para Notion, GitHub)
graphify . --svg

# GraphML (para Gephi, yEd)
graphify . --graphml

# Obsidian vault
graphify . --obsidian
graphify . --obsidian --obsidian-dir ~/vaults/ventas

# Wiki markdown
graphify . --wiki

# Neo4j
graphify . --neo4j
graphify . --neo4j-push bolt://localhost:7687

# FalkorDB
graphify . --falkordb
graphify . --falkordb-push falkordb://localhost:6379
```

### Git Hooks

```bash
# Instalar hooks (auto-rebuild en cada commit)
graphify hook install

# Verificar estado
graphify hook status

# Desinstalar
graphify hook uninstall
```

### PRs y GitHub

```bash
# Dashboard de PRs
graphify prs

# Detalle de un PR
graphify prs 42

# Triage con IA
graphify prs --triage

# PRs con conflictos de merge
graphify prs --conflicts

# Filtrar por branch base
graphify prs --base main

# Repo diferente
graphify prs --repo owner/repo
```

### Multi-repo

```bash
# Clonar y grafear un repo
graphify clone https://github.com/owner/repo

# Merge de grafos
graphify merge-graphs backend.json frontend.json --out merged.json

# Grafo global (cross-proyecto)
graphify global add graphify-out/graph.json --as ventas-v2
graphify global list
graphify global remove ventas-v2
```

### Gestión de la Skill

```bash
# Instalar/actualizar skill
graphify install --platform opencode

# Desinstalar
graphify uninstall --platform opencode

# Versión
graphify --version
```

---

## Reglas de Extracción para Este Proyecto

### SIEMPRE hacer

1. **Usar `--code-only`** para extracción inicial (sin costo LLM)
2. **Excluir** `docs/backup-db/`, `miselanios/`
3. **Indexar SOLO** `desarrollo-qr/bff-service/`, `desarrollo-qr/qr-app/`, `desarrollo-qr/user-service/` y `desarrollo-qr/qr-service/`
4. **Fuente canónica**: `desarrollo-qr/` es el entorno principal

### NUNCA hacer

1. No indexar `docs/backup-db/` (backups binarios)
2. No indexar `miselanios/` (archivos misceláneos)
3. No usar `--mode deep` sin necesidad (costa tokens)
4. No generar HTML si grafo > 5000 nodos

### Flujo de Trabajo Recomendado

```bash
# 1. Extracción inicial (una vez)
graphify extract ./desarrollo-qr/bff-service ./desarrollo-qr/qr-app --code-only --out .

# 2. Clustering y nombres
graphify label . --backend gemini

# 3. Consultas (sin costo)
graphify query "pregunta aqui"
graphify path "A" "B"
graphify explain "Node"

# 4. Actualización después de cambios en código (grafo combinado)
graphify update .

# 5. Actualizar grafos individuales y copiar a docs/graphs/ (opcional)
powershell -File scripts/update-graphs.ps1

# 6. Commitear los grafos versionados
git add docs/graphs/
git commit -m "docs: actualizar grafos"

# 7. Actualización si cambiaron docs (necesita LLM)
graphify extract . --backend gemini
```

---

## Cómo Responder Preguntas

### Si existe graphify-out/graph.json

1. **Primero**: intentar `graphify query "<pregunta>"`
2. **Si no hay resultado**: leer `graphify-out/GRAPH_REPORT.md`
3. **Solo si es necesario**: leer archivos específicos del código

### Formato de Respuesta

- Citar `source_location` cuando se mencione código específico
- Mostrar qué comunidades están involucradas
- Identificar si la relación es `EXTRACTED` (explícita) o `INFERRED` (inferida)
- Usar la estructura de directorios para contextualizar

---

## Puertos por Servicio

| Servicio | Puertos | Docker |
|----------|---------|--------|
| `qr-app` (Next.js) | :3000 | Sí |
| `bff-service` (NestJS) | :3001 | Sí |
| `user-service` (NestJS) | :3002 | Sí |
| `qr-service` (NestJS) | :3003 | Sí |
| `mongo-express` | :8081 | Sí |
| `mongo` | :27017 | Sí |

---

## Variables de Entorno Útiles

| Variable | Uso |
|----------|-----|
| `GEMINI_API_KEY` | Backend para docs/labels (ya configurada) |
| `GRAPHIFY_MAX_WORKERS` | Paralelismo AST (default: cpu_count) |
| `GRAPHIFY_FORCE` | Forzar rebuild con menos nodos |
| `GRAPHIFY_API_TIMEOUT` | Timeout HTTP (default: 600s) |

---

## Lecciones Aprendidas (Evaluación en Proyecto Real)

Basado en el uso extensivo de Graphify en el proyecto plataforma_qr_cursor:

### ✅ Lo que funciona bien

- **`graphify explain "Nombre"`** — Excelente para entender rápidamente qué rodea a un componente. Hace matching parcial (no necesita el ID exacto).
- **`graphify path "A" "B"`** — Muy útil para descubrir cómo se conectan dos conceptos en el grafo.
- **`GRAPH_REPORT.md`** — Proporciona visión general inmediata con comunidades, estadísticas y topología.
- **`graphify export html` / `graphify export callflow-html`** — Exportaciones visuales útiles para documentación y presentaciones.
- **Visión macro y comunidades** — Graphify agrupa nodos por comunidades (Leiden), lo que revela módulos de facto que pueden diferir de la estructura de directorios.

### ❌ Lo que funciona mal

- **`graphify query "pregunta"`** — Muy ruidoso. Tiende a mezclar conceptos no relacionados en una sola respuesta. **Preferir `explain` o `path` para preguntas enfocadas.**
- **`graphify affected "X"`** — No hace matching parcial como `explain`; requiere el ID exacto del nodo. Usar `explain` en su lugar para análisis de impacto.
- **Caminos frontend↔backend** — Los caminos entre frontend y backend frecuentemente pasan por `package.json`, `bcrypt`, `pnpm-lock.yaml` en lugar de conexiones reales de negocio. **Ignorar esos nodos intermediarios** al interpretar resultados.
- **Preguntas en lenguaje natural** — Graphify no entiende sinónimos ni stems. Un `query` en español puede no encontrar nodos etiquetados en inglés. Para eso, CBM con `search_graph` es mejor.

### 🔄 Cuándo complementar con otras herramientas

| Situación | Usar Graphify | Luego complementar con |
|-----------|--------------|------------------------|
| Visión general del proyecto | `GRAPH_REPORT.md` | CBM `get_architecture` |
| Relaciones entre módulos | `graphify path "A" "B"` | CBM `trace_path` para call chains |
| Entender un componente | `graphify explain "X"` | CBM `get_code_snippet` para leer código |
| Impacto de cambios | `graphify affected "X"` (si se sabe ID exacto) | CBM `detect_changes` |
| Encontrar función específica | — | CBM `search_graph(name_pattern=".*func.*")` |
| Strings exactos / config | — | Lectura manual (grep + read) |

---

## Referencias

- [Query y traversal](references/query.md)
- [Update incremental](references/update.md)
- [codebase-memory-mcp CLI](references/cbm-commands.md) — Herramienta complementaria
- [Guía de elección de herramientas](AGENTS.md#herramientas-de-análisis-del-codebase) — Cuándo usar Graphify vs CBM vs manual
- [GitHub repo: Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
