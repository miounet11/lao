/**
 * iatlas-browser CLI 入口
 *
 * 用法：
 *   iatlas-browser open <url>     打开指定 URL
 *   iatlas-browser snapshot       获取当前页面快照
 *   iatlas-browser daemon         前台启动 Daemon
 *   iatlas-browser start          前台启动 Daemon（别名）
 *   iatlas-browser stop           停止 Daemon
 *   iatlas-browser status         查看 Daemon 状态
 *   iatlas-browser --help         显示帮助信息
 *   iatlas-browser --version      显示版本号
 *
 * 全局选项：
 *   --json                    以 JSON 格式输出
 */

import { openCommand } from "./commands/open.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { clickCommand } from "./commands/click.js";
import { hoverCommand } from "./commands/hover.js";
import { fillCommand } from "./commands/fill.js";
import { typeCommand } from "./commands/type.js";
import { closeCommand } from "./commands/close.js";
import { getCommand, type GetAttribute } from "./commands/get.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { waitCommand } from "./commands/wait.js";
import { pressCommand } from "./commands/press.js";
import { scrollCommand } from "./commands/scroll.js";
import { daemonCommand, stopCommand, statusCommand } from "./commands/daemon.js";
import { reloadCommand } from "./commands/reload.js";
import { backCommand, forwardCommand, refreshCommand } from "./commands/nav.js";
import { checkCommand, uncheckCommand } from "./commands/check.js";
import { selectCommand } from "./commands/select.js";
import { evalCommand } from "./commands/eval.js";
import { tabCommand } from "./commands/tab.js";
import { frameCommand, frameMainCommand } from "./commands/frame.js";
import { dialogCommand } from "./commands/dialog.js";
import { networkCommand } from "./commands/network.js";
import { consoleCommand } from "./commands/console.js";
import { errorsCommand } from "./commands/errors.js";
import { traceCommand } from "./commands/trace.js";
import { fetchCommand } from "./commands/fetch.js";
import { siteCommand } from "./commands/site.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { mcpConfigCommand } from "./commands/mcp-config.js";
import { apiGuideCommand } from "./commands/api-guide.js";
import { APP_NAME, APP_VERSION } from "@iatlas-browser/shared";

const HELP_TEXT = `
iatlas-browser - AI Agent 浏览器自动化工具

用法：
  iatlas-browser <command> [options]

网站 CLI 化（把任何网站变成命令行 API）：
  site list            列出所有可用 adapter（50+）
  site search <q>      搜索 adapter
  site <name> [args]   运行 adapter（如 site reddit/thread <url>）
  site update          更新社区 adapter 库
  guide                如何创建新 adapter（开发指南）
  setup                一键初始化扩展/MCP/API 示例
  mcp-config [client]  输出 MCP 配置片段
  api-guide            输出本地 HTTP API 示例

  示例：
    iatlas-browser setup
    iatlas-browser mcp-config cursor
    iatlas-browser api-guide
    iatlas-browser site twitter/search "claude code"
    iatlas-browser site reddit/thread <url>
    iatlas-browser site github/pr-create owner/repo --title "feat: ..."

页面导航：
  open <url> [--tab]   打开指定 URL（默认新 tab，--tab current 当前 tab）
  back / forward       后退 / 前进
  refresh              刷新页面
  close                关闭当前标签页
  tab                  列出所有标签页
  tab new [url]        新建标签页
  tab <n>              切换到第 n 个标签页（按 index）
  tab select --id <id> 切换到指定 tabId 的标签页
  tab close [n|--id <id>]  关闭标签页
  frame <selector>     切换到指定 iframe
  frame main           返回主 frame
  wait <ms|@ref>       等待时间或元素

页面交互：
  click <ref>          点击元素（ref 如 @5 或 5）
  hover <ref>          悬停在元素上
  fill <ref> <text>    填充输入框（清空后填入）
  type <ref> <text>    逐字符输入（不清空）
  check <ref>          勾选复选框
  uncheck <ref>        取消勾选复选框
  select <ref> <val>   下拉框选择
  press <key>          发送键盘按键（如 Enter, Tab, Control+a）
  scroll <dir> [px]    滚动页面（up/down/left/right，默认 300px）
  dialog accept [text] 接受对话框
  dialog dismiss       拒绝/关闭对话框

页面信息：
  snapshot             获取当前页面快照（默认完整树）
  get text <ref>       获取元素文本
  get url              获取当前页面 URL
  get title            获取页面标题
  screenshot [path]    截取当前页面
  eval "<js>"          执行 JavaScript
  fetch <url>          在浏览器上下文中 fetch（自动同源路由，带登录态）

网络与调试：
  network requests [filter]  查看网络请求
  network route <url> [--abort|--body <json>]  拦截请求
  network unroute [url]      移除拦截规则
  network clear              清空请求记录
  console [--clear]          查看/清空控制台消息
  errors [--clear]           查看/清空 JS 错误
  trace start|stop|status    录制用户操作

Daemon 管理：
  daemon / start       前台启动 Daemon
  stop                 停止 Daemon
  status               查看 Daemon 状态
  reload               重载扩展（需要 CDP 模式）
  doctor               检查 daemon / extension / build 状态

选项：
  --json               以 JSON 格式输出
  -i, --interactive    只输出可交互元素（snapshot 命令）
  -c, --compact        移除空结构节点（snapshot 命令）
  -d, --depth <n>      限制树深度（snapshot 命令）
  -s, --selector <sel> 限定 CSS 选择器范围（snapshot 命令）
  --tab <tabId>        指定操作的标签页 ID
  --mcp                启动 MCP server（用于 Claude Code / Cursor 等 AI 工具）
  --help, -h           显示帮助信息
  --version, -v        显示版本号
`.trim();

interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    interactive: boolean;
    compact: boolean;
    depth?: number;
    selector?: string;
    tab?: string;
  };
}

/**
 * 解析命令行参数
 */
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // 跳过 node 和脚本路径

  const result: ParsedArgs = {
    command: null,
    args: [],
    flags: {
      json: false,
      help: false,
      version: false,
      interactive: false,
      compact: false,
    },
  };

  let skipNext = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
    } else if (arg === "--compact" || arg === "-c") {
      result.flags.compact = true;
    } else if (arg === "--depth" || arg === "-d") {
      skipNext = true;
      const nextArg = args[index + 1];
      if (nextArg !== undefined) {
        result.flags.depth = parseInt(nextArg, 10);
      }
    } else if (arg === "--selector" || arg === "-s") {
      skipNext = true;
      const nextArg = args[index + 1];
      if (nextArg !== undefined) {
        result.flags.selector = nextArg;
      }
    } else if (arg === "--id") {
      // --id 及其值由子命令通过 process.argv 自行解析，这里跳过
      skipNext = true;
    } else if (arg === "--tab") {
      // --tab 参数及其值，无论出现在命令前后都跳过
      skipNext = true;
    } else if (arg.startsWith("-")) {
      // 未知选项，忽略
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  // 解析全局 --tab 参数
  const tabArgIdx = process.argv.indexOf('--tab');
  const globalTabId = tabArgIdx >= 0 && process.argv[tabArgIdx + 1]
    ? parseInt(process.argv[tabArgIdx + 1], 10)
    : undefined;

  // 处理全局选项
  if (parsed.flags.version) {
    console.log(APP_VERSION);
    return;
  }

  if (process.argv.includes("--mcp")) {
    const mcpPath = new URL("./mcp.js", import.meta.url).pathname;
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [mcpPath], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    console.log(HELP_TEXT);
    return;
  }

  // 路由到对应命令
  try {
    switch (parsed.command) {
      case "open": {
        const url = parsed.args[0];
        if (!url) {
          console.error("错误：缺少 URL 参数");
          console.error("用法：iatlas-browser open <url> [--tab current|<tabId>]");
          process.exit(1);
        }
        // 解析 --tab 参数
        const tabIndex = process.argv.findIndex(a => a === "--tab");
        const tab = tabIndex >= 0 ? process.argv[tabIndex + 1] : undefined;
        await openCommand(url, { json: parsed.flags.json, tab });
        break;
      }

      case "snapshot": {
        await snapshotCommand({
          json: parsed.flags.json,
          interactive: parsed.flags.interactive,
          compact: parsed.flags.compact,
          maxDepth: parsed.flags.depth,
          selector: parsed.flags.selector,
          tabId: globalTabId,
        });
        break;
      }

      case "click": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser click <ref>");
          console.error("示例：iatlas-browser click @5");
          process.exit(1);
        }
        await clickCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "hover": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser hover <ref>");
          console.error("示例：iatlas-browser hover @5");
          process.exit(1);
        }
        await hoverCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "check": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser check <ref>");
          console.error("示例：iatlas-browser check @5");
          process.exit(1);
        }
        await checkCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "uncheck": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser uncheck <ref>");
          console.error("示例：iatlas-browser uncheck @5");
          process.exit(1);
        }
        await uncheckCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "fill": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser fill <ref> <text>");
          console.error('示例：iatlas-browser fill @3 "hello world"');
          process.exit(1);
        }
        if (text === undefined) {
          console.error("错误：缺少 text 参数");
          console.error("用法：iatlas-browser fill <ref> <text>");
          console.error('示例：iatlas-browser fill @3 "hello world"');
          process.exit(1);
        }
        await fillCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "type": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser type <ref> <text>");
          console.error('示例：iatlas-browser type @3 "append text"');
          process.exit(1);
        }
        if (text === undefined) {
          console.error("错误：缺少 text 参数");
          console.error("用法：iatlas-browser type <ref> <text>");
          console.error('示例：iatlas-browser type @3 "append text"');
          process.exit(1);
        }
        await typeCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "select": {
        const ref = parsed.args[0];
        const value = parsed.args[1];
        if (!ref) {
          console.error("错误：缺少 ref 参数");
          console.error("用法：iatlas-browser select <ref> <value>");
          console.error('示例：iatlas-browser select @4 "option1"');
          process.exit(1);
        }
        if (value === undefined) {
          console.error("错误：缺少 value 参数");
          console.error("用法：iatlas-browser select <ref> <value>");
          console.error('示例：iatlas-browser select @4 "option1"');
          process.exit(1);
        }
        await selectCommand(ref, value, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "eval": {
        const script = parsed.args[0];
        if (!script) {
          console.error("错误：缺少 script 参数");
          console.error("用法：iatlas-browser eval <script>");
          console.error('示例：iatlas-browser eval "document.title"');
          process.exit(1);
        }
        await evalCommand(script, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "get": {
        const attribute = parsed.args[0] as GetAttribute | undefined;
        if (!attribute) {
          console.error("错误：缺少属性参数");
          console.error("用法：iatlas-browser get <text|url|title> [ref]");
          console.error("示例：iatlas-browser get text @5");
          console.error("      iatlas-browser get url");
          process.exit(1);
        }
        if (!["text", "url", "title"].includes(attribute)) {
          console.error(`错误：未知属性 "${attribute}"`);
          console.error("支持的属性：text, url, title");
          process.exit(1);
        }
        const ref = parsed.args[1];
        await getCommand(attribute, ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "daemon":
      case "start": {
        const hostIdx = process.argv.findIndex(a => a === "--host");
        const host = hostIdx >= 0 ? process.argv[hostIdx + 1] : undefined;
        await daemonCommand({ json: parsed.flags.json, host });
        break;
      }

      case "stop": {
        await stopCommand({ json: parsed.flags.json });
        break;
      }

      case "status": {
        await statusCommand({ json: parsed.flags.json });
        break;
      }

      case "doctor": {
        await doctorCommand({ json: parsed.flags.json });
        break;
      }

      case "setup": {
        await setupCommand({ json: parsed.flags.json });
        break;
      }

      case "mcp-config": {
        await mcpConfigCommand(parsed.args[0], { json: parsed.flags.json });
        break;
      }

      case "api-guide": {
        await apiGuideCommand({ json: parsed.flags.json });
        break;
      }

      case "reload": {
        await reloadCommand({ json: parsed.flags.json });
        break;
      }

      case "close": {
        await closeCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "back": {
        await backCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "forward": {
        await forwardCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "refresh": {
        await refreshCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "screenshot": {
        const outputPath = parsed.args[0];
        await screenshotCommand(outputPath, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "wait": {
        const target = parsed.args[0];
        if (!target) {
          console.error("错误：缺少等待目标参数");
          console.error("用法：iatlas-browser wait <ms|@ref>");
          console.error("示例：iatlas-browser wait 2000");
          console.error("      iatlas-browser wait @5");
          process.exit(1);
        }
        await waitCommand(target, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "press": {
        const key = parsed.args[0];
        if (!key) {
          console.error("错误：缺少 key 参数");
          console.error("用法：iatlas-browser press <key>");
          console.error("示例：iatlas-browser press Enter");
          console.error("      iatlas-browser press Control+a");
          process.exit(1);
        }
        await pressCommand(key, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "scroll": {
        const direction = parsed.args[0];
        const pixels = parsed.args[1]; // 传 string，scrollCommand 内部解析
        if (!direction) {
          console.error("错误：缺少方向参数");
          console.error("用法：iatlas-browser scroll <up|down|left|right> [pixels]");
          console.error("示例：iatlas-browser scroll down");
          console.error("      iatlas-browser scroll up 500");
          process.exit(1);
        }
        await scrollCommand(direction, pixels, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "tab": {
        await tabCommand(parsed.args, { json: parsed.flags.json });
        break;
      }

      case "frame": {
        const selectorOrMain = parsed.args[0];
        if (!selectorOrMain) {
          console.error("错误：缺少 selector 参数");
          console.error("用法：iatlas-browser frame <selector>");
          console.error('示例：iatlas-browser frame "iframe#editor"');
          console.error("      iatlas-browser frame main");
          process.exit(1);
        }
        if (selectorOrMain === "main") {
          await frameMainCommand({ json: parsed.flags.json, tabId: globalTabId });
        } else {
          await frameCommand(selectorOrMain, { json: parsed.flags.json, tabId: globalTabId });
        }
        break;
      }

      case "dialog": {
        const subCommand = parsed.args[0];
        if (!subCommand) {
          console.error("错误：缺少子命令");
          console.error("用法：iatlas-browser dialog <accept|dismiss> [text]");
          console.error("示例：iatlas-browser dialog accept");
          console.error('      iatlas-browser dialog accept "my input"');
          console.error("      iatlas-browser dialog dismiss");
          process.exit(1);
        }
        const promptText = parsed.args[1]; // accept 时可选的 prompt 文本
        await dialogCommand(subCommand, promptText, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "network": {
        const subCommand = parsed.args[0] || "requests";
        const urlOrFilter = parsed.args[1];
        // 解析 network 特有的选项
        const abort = process.argv.includes("--abort");
        const withBody = process.argv.includes("--with-body");
        const bodyIndex = process.argv.findIndex(a => a === "--body");
        const body = bodyIndex >= 0 ? process.argv[bodyIndex + 1] : undefined;
        await networkCommand(subCommand, urlOrFilter, { json: parsed.flags.json, abort, body, withBody, tabId: globalTabId });
        break;
      }

      case "console": {
        const clear = process.argv.includes("--clear");
        await consoleCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }

      case "errors": {
        const clear = process.argv.includes("--clear");
        await errorsCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }

      case "trace": {
        const subCmd = parsed.args[0] as 'start' | 'stop' | 'status' | undefined;
        if (!subCmd || !['start', 'stop', 'status'].includes(subCmd)) {
          console.error("错误：缺少或无效的子命令");
          console.error("用法：iatlas-browser trace <start|stop|status>");
          console.error("示例：iatlas-browser trace start");
          console.error("      iatlas-browser trace stop");
          console.error("      iatlas-browser trace status");
          process.exit(1);
        }
        await traceCommand(subCmd, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "fetch": {
        const fetchUrl = parsed.args[0];
        if (!fetchUrl) {
          console.error("[error] fetch: <url> is required.");
          console.error("  Usage: iatlas-browser fetch <url> [--json] [--method POST] [--body '{...}']");
          console.error("  Example: iatlas-browser fetch https://www.reddit.com/api/me.json --json");
          process.exit(1);
        }
        // 解析 fetch 特有选项
        const methodIdx = process.argv.findIndex(a => a === "--method");
        const fetchMethod = methodIdx >= 0 ? process.argv[methodIdx + 1] : undefined;
        const fetchBodyIdx = process.argv.findIndex(a => a === "--body");
        const fetchBody = fetchBodyIdx >= 0 ? process.argv[fetchBodyIdx + 1] : undefined;
        const headersIdx = process.argv.findIndex(a => a === "--headers");
        const fetchHeaders = headersIdx >= 0 ? process.argv[headersIdx + 1] : undefined;
        const outputIdx = process.argv.findIndex(a => a === "--output");
        const fetchOutput = outputIdx >= 0 ? process.argv[outputIdx + 1] : undefined;
        await fetchCommand(fetchUrl, {
          json: parsed.flags.json,
          method: fetchMethod,
          body: fetchBody,
          headers: fetchHeaders,
          output: fetchOutput,
          tabId: globalTabId,
        });
        break;
      }

      case "site": {
        await siteCommand(parsed.args, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "guide": {
        console.log(`How to turn any website into a ${APP_NAME} site adapter
=======================================================

1. REVERSE ENGINEER the API
   iatlas-browser network clear --tab <tabId>
   iatlas-browser refresh --tab <tabId>
   iatlas-browser network requests --filter "api" --with-body --json --tab <tabId>

2. TEST if direct fetch works (Tier 1)
   iatlas-browser eval "fetch('/api/endpoint',{credentials:'include'}).then(r=>r.json())" --tab <tabId>

   If it works → Tier 1 (Cookie auth, like Reddit/GitHub/Zhihu/Bilibili)
   If needs extra headers → Tier 2 (like Twitter: Bearer + CSRF token)
   If needs request signing → Tier 3 (like Xiaohongshu: Pinia store actions)

3. WRITE the adapter (one JS file per operation)

   /* @meta
   {
     "name": "platform/command",
     "description": "What it does",
     "domain": "www.example.com",
     "args": { "query": {"required": true, "description": "Search query"} },
     "readOnly": true,
     "example": "iatlas-browser site platform/command value"
   }
   */
   async function(args) {
     if (!args.query) return {error: 'Missing argument: query'};
     const resp = await fetch('/api/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
     if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
     return await resp.json();
   }

4. TEST it
   Save to ~/.iatlas-browser/sites/platform/command.js (private, takes priority)
   iatlas-browser site platform/command "test query" --json

5. CONTRIBUTE
   Option A (with gh CLI):
     git clone https://github.com/miounet11/lao-s && cd lao-s
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     gh pr create --repo miounet11/lao-s

   Option B (without gh CLI, using iatlas-browser itself):
     iatlas-browser site github/fork miounet11/lao-s
     git clone https://github.com/YOUR_USER/lao-s && cd lao-s
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     iatlas-browser site github/pr-create miounet11/lao-s --title "feat(platform): add adapters" --head "YOUR_USER:feat-platform"

Private adapters:  ~/.iatlas-browser/sites/<platform>/<command>.js
Community:         ~/.iatlas-browser/bb-sites/ (via iatlas-browser site update)
Full guide:        https://github.com/miounet11/lao-s/blob/main/SKILL.md`);
        break;
      }

      default: {
        console.error(`错误：未知命令 "${parsed.command}"`);
        console.error(`运行 ${APP_NAME} --help 查看可用命令`);
        process.exit(1);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (parsed.flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: message,
        })
      );
    } else {
      console.error(`错误：${message}`);
    }

    process.exit(1);
  }
}

main();
