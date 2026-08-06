# codebase-memory-mcp - Comandos del Proyecto

## Configuración

- **Binario**: `~/.local/bin/codebase-memory-mcp.exe`
- **Proyecto**: `C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor`
- **Base de datos**: `~/.cache/codebase-memory-mcp/`
- **Exclusiones**: `.cbmignore` + `.gitignore`

## Herramientas MCP Disponibles (Nativas en OpenCode)

| Herramienta | Descripción | Cuándo usarla |
|-------------|-------------|---------------|
| `search_graph` | Búsqueda por nombre, label, archivo, degree | Encontrar una clase/función específica por nombre |
| `search_code` | Búsqueda de código fuente con grep + enriquecimiento | Buscar strings exactos en el código |
| `trace_path` | Trazar camino entre nodos (calls, data_flow, cross_service) | Entender quién llama a quién |
| `get_code_snippet` | Leer código fuente de una función/clase | Obtener el código de una función específica |
| `get_architecture` | Resumen de arquitectura | Visión general técnica del proyecto |
| `detect_changes` | Impacto de cambios git | Análisis de impacto antes de merge |
| `manage_adr` | Architecture Decision Records | Registrar/consultar decisiones |
| `query_graph` | Consultas Cypher sobre el grafo | Patrones complejos (ej. nodos con loop_depth > 3) |
| `list_projects` | Listar proyectos indexados | Saber qué proyectos están disponibles |
| `index_repository` | Indexar/re-indexar proyecto | Actualizar el grafo local |

> **NOTA**: Todas estas herramientas están disponibles como llamadas MCP nativas desde OpenCode. No requieren invocar el CLI `codebase-memory-mcp.exe` directamente a menos que se necesite una operación que no tenga wrapper MCP.

## Comparativa: CBM vs Graphify vs Lectura Manual

| Necesidad | Herramienta | Cómo |
|-----------|-------------|------|
| Encontrar una función/clase por nombre | **CBM** `search_graph(name_pattern=".*Patrón.*")` | Búsqueda por patrón regex con BM25 ranking |
| Ver la implementación de una función | **CBM** `get_code_snippet(qualified_name="ruta.archivo.Funcion")` | Lee el código fuente directamente |
| Trazar cadena de llamadas | **CBM** `trace_path(function_name="X", direction="inbound")` | Sigue edges CALLS |
| Ver relaciones entre módulos | **Graphify** `graphify path "A" "B"` | Camino más corto en el grafo |
| Entender un componente | **Graphify** `graphify explain "Componente"` | Vecinos + edges del nodo |
| Visión general del proyecto | **Graphify** `GRAPH_REPORT.md` + **CBM** `get_architecture` | Comunidades + estructura técnica |
| Strings exactos / config | **Manual** `grep` / `read` / `glob` | Búsqueda textual directa |
| Archivos no-code (Docker, scripts) | **Manual** `read` | Lectura directa de archivos |
| Impacto de cambios | **CBM** `detect_changes` + **Graphify** `graphify affected "X"` | Git diff + grafo |
| Rendimiento / código muerto | **CBM** `search_code` + `get_architecture(aspects=["hotspots"])` | Análisis de hotspots y código no usado |
| Rutas HTTP del backend | **CBM** `get_architecture(aspects=["routes"])` | Endpoints registrados |
| Relaciones entre frontend y backend | **Graphify** `graphify path "FE_X" "BE_X"` | Camino entre conceptos cross-repo |

## Comandos CLI

Solo necesarios si las herramientas MCP nativas no cubren el caso:

```bash
# Indexar proyecto
codebase-memory-mcp cli index_repository '{"repo_path": "ruta"}'

# Buscar nodo por nombre
codebase-memory-mcp cli search_graph '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "name_pattern": ".*AuthService.*"}'

# Buscar código
codebase-memory-mcp cli search_code '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "query": "login"}'

# Trazar camino
codebase-memory-mcp cli trace_path '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "function_name": "AuthService", "direction": "inbound"}'

# Arquitectura
codebase-memory-mcp cli get_architecture '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "aspects": ["all"]}'

# Impacto de cambios
codebase-memory-mcp cli detect_changes '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor"}'

# Código muerto
codebase-memory-mcp cli dead_code '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor"}'

# Rutas HTTP
codebase-memory-mcp cli http_routes '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor"}'

# Consulta Cypher
codebase-memory-mcp cli cypher_query '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "query": "MATCH (f:Function)-[:CALLS]->(g) WHERE f.name = '\''login'\'' RETURN g.name"}'
```

## Ejemplos para Este Proyecto

### Buscar servicios de auth
```bash
codebase-memory-mcp cli search_graph '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "name_pattern": ".*Auth.*Service.*"}'
```

### Trazar flujo de login (quién llama a AuthService)
```bash
codebase-memory-mcp cli trace_path '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "function_name": "AuthService", "direction": "inbound"}'
```

### Ver rutas del backend
```bash
codebase-memory-mcp cli http_routes '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor"}'
```

### Encontrar qué archivos importan un módulo específico
```bash
codebase-memory-mcp cli search_graph '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "name_pattern": ".*Event.*Module.*"}'
```

### Hotspots del proyecto (alto acoplamiento)
```bash
codebase-memory-mcp cli get_architecture '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "aspects": ["hotspots", "clusters"]}'
```

### Leer código de un handler específico
```bash
# Primero encontrar el handler
codebase-memory-mcp cli search_graph '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "name_pattern": ".*EventHandler.*"}'
# Luego leer el snippet (el qualified_name viene del resultado anterior)
codebase-memory-mcp cli get_code_snippet '{"project": "C-Users-Admin-OneDrive-Escritorio-plataforma_qr_cursor", "qualified_name": "src/events/event.handler.ts/EventHandler"}'
```

## Lecciones Aprendidas

- **search_graph** es la herramienta más útil para empezar — usar `name_pattern` con regex siempre
- **trace_path** con `direction="inbound"` es ideal para entender quién usa un servicio
- **trace_path** con `mode="cross_service"` sigue flujos HTTP entre frontend y backend
- **get_architecture** con `aspects=["clusters"]` revela la estructura de módulos real (no la de directorios)
- **query_graph** (Cypher) es poderoso para patrones complejos — ej. `MATCH (f:Function) WHERE f.transitive_loop_depth >= 3 RETURN f.qualified_name, f.transitive_loop_depth`
- Si **search_graph** no devuelve resultados, el proyecto puede no estar indexado. Revisar con `list_projects` o `index_status`
- Siempre complementar hallazgos de CBM con Graphify para visión macro, y con lectura manual para verificar
