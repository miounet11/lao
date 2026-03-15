import { APP_NAME, DAEMON_BASE_URL } from "@iatlas-browser/shared";

export interface ApiGuideOptions {
  json?: boolean;
}

function buildPayloadExamples() {
  return {
    baseUrl: DAEMON_BASE_URL,
    status: {
      method: "GET",
      url: `${DAEMON_BASE_URL}/status`,
      example: `curl -s ${DAEMON_BASE_URL}/status`,
    },
    snapshot: {
      method: "POST",
      url: `${DAEMON_BASE_URL}/command`,
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        id: "demo-snapshot",
        action: "snapshot",
      },
      example: `curl -s ${DAEMON_BASE_URL}/command -H "Content-Type: application/json" -d '{"id":"demo-snapshot","action":"snapshot"}'`,
    },
    open: {
      method: "POST",
      url: `${DAEMON_BASE_URL}/command`,
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        id: "demo-open",
        action: "open",
        url: "https://example.com",
      },
      example: `curl -s ${DAEMON_BASE_URL}/command -H "Content-Type: application/json" -d '{"id":"demo-open","action":"open","url":"https://example.com"}'`,
    },
  };
}

export async function apiGuideCommand(
  options: ApiGuideOptions = {}
): Promise<void> {
  const payload = buildPayloadExamples();

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`${APP_NAME} local API`);
  console.log(`base URL: ${payload.baseUrl}`);
  console.log("");
  console.log("start the local daemon first:");
  console.log(`  ${APP_NAME} daemon`);
  console.log("");
  console.log("status:");
  console.log(`  ${payload.status.example}`);
  console.log("");
  console.log("snapshot command:");
  console.log(`  ${payload.snapshot.example}`);
  console.log("");
  console.log("open command:");
  console.log(`  ${payload.open.example}`);
  console.log("");
  console.log("notes:");
  console.log("- /command waits for the extension to execute the request");
  console.log("- browser commands require the extension to be connected");
  console.log("- use `iatlas-browser doctor` if requests fail");
}
