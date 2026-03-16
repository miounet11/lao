/**
 * HTTP 客户端 - 与 Daemon 通信
 */

import type { Request, Response } from "@iatlas-browser/shared";
import { DAEMON_BASE_URL, COMMAND_TIMEOUT } from "@iatlas-browser/shared";

/**
 * 发送命令到 Daemon 并等待响应
 */
export async function sendCommand(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COMMAND_TIMEOUT);

  try {
    const res = await fetch(`${DAEMON_BASE_URL}/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // 根据 HTTP 状态码返回错误
      if (res.status === 408) {
        return {
          id: request.id,
          success: false,
          error: "命令执行超时",
        };
      }
      if (res.status === 503) {
        const payload = (await res.json().catch(() => null)) as Response | null;
        return {
          id: request.id,
          success: false,
          error: payload?.error ?? [
            "Chrome extension not connected.",
            "",
            "1. Download extension: https://github.com/miounet11/lao/releases/latest",
            "2. Unzip the downloaded file",
            "3. Open chrome://extensions/ → Enable Developer Mode",
            "4. Click \"Load unpacked\" → select the unzipped folder",
          ].join("\n"),
        };
      }
      return {
        id: request.id,
        success: false,
        error: `HTTP 错误: ${res.status} ${res.statusText}`,
      };
    }

    return (await res.json()) as Response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          id: request.id,
          success: false,
          error: "请求超时",
        };
      }
      // 连接错误
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED")
      ) {
        throw new Error([
          "Cannot connect to daemon.",
          "",
          "Start the daemon first:",
          "  iatlas-browser daemon",
          "",
          "Then load the Chrome extension:",
          "  chrome://extensions/ → Developer Mode → Load unpacked → node_modules/iatlas-browser/extension/",
        ].join("\n"));
      }
      throw error;
    }
    throw error;
  }
}
