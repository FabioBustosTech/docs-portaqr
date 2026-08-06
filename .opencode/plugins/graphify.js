// graphify OpenCode plugin - Configuración del proyecto plataforma_qr_cursor
// Inyecta recordatorio del grafo de conocimiento antes de llamadas bash.
//
// Directorios del proyecto:
//   desarrollo-qr/bff-service  (NestJS, puerto 3001)
//   desarrollo-qr/qr-app       (Next.js, puerto 3000)
//   desarrollo-qr/user-service (NestJS, puerto 3002)
//   desarrollo-qr/qr-service   (NestJS, puerto 3003)
//   docs/spec/, docs/tarea/    (docs indexados)
//   docs/backup-db/, miselanios/ (EXCLUIDOS)
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
          "  Directorios indexados: desarrollo-qr/bff-service, desarrollo-qr/qr-app, desarrollo-qr/user-service, desarrollo-qr/qr-service",
          "  NO incluye: docs/backup-db/, miselanios/",
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
