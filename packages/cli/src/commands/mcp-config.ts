import { APP_NAME } from "@iatlas-browser/shared";

export interface McpConfigOptions {
  json?: boolean;
}

type ClientName = "generic" | "cursor" | "claude-desktop";

function buildConfig() {
  return {
    mcpServers: {
      [APP_NAME]: {
        command: "npx",
        args: ["-y", APP_NAME, "--mcp"],
      },
    },
  };
}

export async function mcpConfigCommand(
  client: string | undefined,
  options: McpConfigOptions = {}
): Promise<void> {
  const normalized = (client ?? "generic") as ClientName;
  const supported: ClientName[] = ["generic", "cursor", "claude-desktop"];

  if (!supported.includes(normalized)) {
    throw new Error(`Unsupported MCP client: ${client}`);
  }

  const config = buildConfig();

  if (options.json || normalized === "generic") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`# ${normalized}`);
  console.log(JSON.stringify(config, null, 2));
}
