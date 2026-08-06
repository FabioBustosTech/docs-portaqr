import type { Plugin } from "@opencode-ai/plugin";

export default (async () => {
  return {
    "tool.execute.before": async (input, output) => {
      // Si el comando es git commit, recordar no usar --no-verify
      const command = input?.args?.command || "";
      if (command.includes("git commit") && command.includes("--no-verify")) {
        output.args.command = command.replace(" --no-verify", "");
        output.args.command += " # ⚠️ No uses --no-verify, corrige los errores de Husky";
      }
    },
  };
}) satisfies Plugin;
