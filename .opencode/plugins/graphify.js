// graphify OpenCode plugin - Configuración del proyecto ventasEntrasdasV2
// Inyecta recordatorio del grafo de conocimiento antes de llamadas bash.
//
// Directorios del proyecto:
//   desarrollo/venta-entradas-v2-backend  (NestJS, puerto 7001)
//   desarrollo/venta-entradas-v2-frontend  (Next.js, puerto 7000)
//   doc/spect/, doc/tareas/, doc/prd.txt  (docs indexados)
//   doc/wiki/, doc/.obsidian/             (EXCLUIDOS)
//
// IMPORTANTE: mantener el string libre de backticks y $(...) constructs.
import { existsSync } from "fs";
import { join } from "path";

export const GraphifyPlugin = async ({ directory }) => {
  let reminded = false;

  return {
    "tool.execute.before": async (input, output) => {
      if (reminded) return;
      if (!existsSync(join(directory, "graphify-out", "graph.json"))) return;

      if (input.tool === "bash") {
        const reminder = [
          "[graphify] Grafo disponible en graphify-out/ (8331 nodos, 22044 edges)",
          "  VISIÓN MACRO -> graphify explain|path (relaciones, comunidades)",
          "  PRECISIÓN     -> codebase-memory-mcp (search_graph, trace_path, get_code_snippet)",
          "  VERIFICACIÓN  -> grep/read (strings exactos, config, tests)",
          "  Directorios indexados: desarrollo/venta-entradas-v2-backend, desarrollo/venta-entradas-v2-frontend",
          "  NO incluye: doc/wiki/, doc/.obsidian/, my-video/, desarrollo2/, desarrollo3/",
        ].join(" | ");

        // ';' no '&&' — Windows PowerShell 5.1 rechaza '&&' como separador
        output.args.command =
          `echo "${reminder}" ; ` +
          output.args.command;
        reminded = true;
      }
    },
  };
};
