/**
 * daemon 命令 - Daemon 管理
 * 用法：
 *   iatlas-browser daemon    前台启动 Daemon
 *   iatlas-browser start     前台启动 Daemon（别名）
 *   iatlas-browser stop      停止 Daemon
 */

import { spawn } from "node:child_process";
import { isDaemonRunning, stopDaemon, getDaemonPath } from "../daemon-manager.js";

export interface DaemonOptions {
  json?: boolean;
  host?: string;
}

/**
 * 前台启动 Daemon
 * 通过 spawn 启动 daemon.js，stdio 继承到当前终端
 */
export async function daemonCommand(
  options: DaemonOptions = {}
): Promise<void> {
  // 检查是否已经运行
  if (await isDaemonRunning()) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "Daemon 已在运行" }));
    } else {
      console.log("Daemon 已在运行");
    }
    return;
  }

  const daemonPath = getDaemonPath();
  const args = [daemonPath];
  if (options.host) {
    args.push("--host", options.host);
  }

  if (options.json) {
    console.log(JSON.stringify({ success: true, message: "Daemon 启动中..." }));
  } else {
    console.log("Daemon 启动中...");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Daemon exited with code ${code}`));
      } else {
        resolve();
      }
    });
    child.on("error", reject);
  });
}

/**
 * 停止 Daemon
 */
export async function stopCommand(options: DaemonOptions = {}): Promise<void> {
  // 检查是否运行中
  if (!(await isDaemonRunning())) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "Daemon 未运行" }));
    } else {
      console.log("Daemon 未运行");
    }
    return;
  }

  // 发送停止信号
  const stopped = await stopDaemon();

  if (stopped) {
    if (options.json) {
      console.log(JSON.stringify({ success: true, message: "Daemon 已停止" }));
    } else {
      console.log("Daemon 已停止");
    }
  } else {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: "无法停止 Daemon" }));
    } else {
      console.error("无法停止 Daemon");
    }
    process.exit(1);
  }
}

/**
 * 状态命令
 */
export async function statusCommand(
  options: DaemonOptions = {}
): Promise<void> {
  const running = await isDaemonRunning();

  if (options.json) {
    console.log(JSON.stringify({ running }));
  } else {
    console.log(running ? "Daemon 运行中" : "Daemon 未运行");
  }
}
