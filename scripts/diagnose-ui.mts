/**
 * @file scripts/diagnose-ui.mts
 *
 * 浏览器 UI 病灶取证脚本（Phase 1 工具链标准化，见 docs/toolchain/phase-1-standardization.md §4）。
 *
 * 用途：对目标页面元素执行标准 7 步取证链
 *       ① navigate → ② snapshot → ③ click（可选）→ ④ snapshot → ⑤ get styles + eval → ⑥ errors → ⑦ screenshot，
 *       组装并写出符合 §4 Schema 的病灶 JSON（内嵌 before 截图路径）。
 *
 * 用法：
 *   pnpm exec tsx scripts/diagnose-ui.mts <url> <css-selector> \
 *     [--bug-id B1] [--interaction click] [--out <json 路径>] [--timeout-ms 60000]
 *
 * 依赖：仅 agent-browser CLI + Node 内置模块（零新装）。
 * 平台：Windows 11（cmd.exe）与 POSIX 兼容。Windows 下按顺序尝试
 *       agent-browser.cmd / agent-browser.bat / agent-browser（cmd 的 PATHEXT 解析），
 *       可用环境变量 AGENT_BROWSER_BIN 显式指定可执行文件。
 *
 * 输出约定：进度日志一律写 stderr，病灶 JSON 写 stdout（可管道消费）并落盘到 --out。
 * 退出码：取证关键步骤（open / eval / screenshot before）失败时置 process.exitCode = 1，
 *         非关键步骤（snapshot ref 提取、get styles、errors）失败只降级记录，不阻塞。
 *         会话在 finally 中保证 close，close 失败不掩盖主结果。
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";
const CWD = process.cwd();
const MAX_BUFFER = 30 * 1024 * 1024; // snapshot --json 可能很大
const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_BROWSER_TIMEOUT_MS ?? 60000);
const DEFAULT_EVIDENCE_DIR = join(CWD, "docs", "toolchain", "evidence");

/** 见 eslint：本脚本遵从仓库约定，用 process.exitCode 而非 process.exit()。 */

class UsageError extends Error {}

class AgentCliError extends Error {
  command: string;
  detail?: string;
  constructor(message: string, command: string, detail?: string) {
    super(message);
    this.command = command;
    this.detail = detail;
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
}

interface DiagnoseArgs {
  help: boolean;
  url?: string;
  selector?: string;
  bugId: string;
  /** 交互类型：click = 按 7 步链补一次点击与交互后快照；none = 纯静态取证 */
  interaction: "click" | "none";
  out?: string;
  timeoutMs: number;
}

interface MessageItem {
  level: string;
  text: string;
}

type DeepFindResult<T> =
  | { found: true; value: T }
  | { found: false };

/* ------------------------------------------------------------------ *
 * 基础工具函数
 * ------------------------------------------------------------------ */

/** stderr 进度日志。 */
function logStep(message: string): void {
  console.error(`[diagnose-ui] ${message}`);
}

/** stderr 警告日志。 */
function logWarn(message: string): void {
  console.error(`[diagnose-ui][warn] ${message}`);
}

/** 把任意错误压成一行可读文本。 */
function describeError(error: unknown): string {
  if (error instanceof AgentCliError) return String(error.detail ?? error.message);
  if (error instanceof Error) return error.message;
  return String(error);
}

/** cmd.exe 安全的参数引用；含双引号/换行/控制字符的参数直接拒绝（本工具参数域内不应出现）。 */
function shellQuote(arg: string): string {
  if (/["\r\n\u0000]/u.test(arg)) {
    throw new AgentCliError(
      `参数包含 cmd 无法安全转义的字符（双引号/换行/控制字符）: ${arg}`,
      "shellQuote",
    );
  }
  return `"${arg}"`;
}

/** 容忍 stdout 前部混入日志的 JSON 解析。 */
function tryJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const starts = new Set<number>([0]);
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  if (firstBrace !== -1) starts.add(firstBrace);
  if (firstBracket !== -1) starts.add(firstBracket);
  const ends = new Set<number>([trimmed.length, trimmed.lastIndexOf("}") + 1, trimmed.lastIndexOf("]") + 1]);
  for (const start of starts) {
    for (const end of ends) {
      if (end <= start) continue;
      const slice = trimmed.slice(start, end);
      try {
        return JSON.parse(slice) as unknown;
      } catch {
        // 继续尝试下一组切分
      }
    }
  }
  return null;
}

/** BFS 深度查找第一个满足谓词的值（JSON 无环，安全）。 */
function deepFind<T>(value: unknown, predicate: (v: unknown) => boolean): DeepFindResult<T> {
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (predicate(current)) return { found: true, value: current as T };
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
    } else if (typeof current === "object" && current !== null) {
      for (const child of Object.values(current as Record<string, unknown>)) queue.push(child);
    }
  }
  return { found: false };
}

/** 病灶编号小写化为文件/会话名片段：B1 → b1，SMOKE-TEST → smoke-test。 */
function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

/** 绝对路径转相对 cwd 的 POSIX 路径（病灶 JSON 里截图路径统一用正斜杠相对路径）。 */
function toPosixRelative(absPath: string): string {
  return relative(CWD, absPath).split(sep).join("/");
}

/** 原子写 JSON（先写临时文件再 rename，避免写一半留下损坏文件）。 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    renameSync(tmpPath, filePath);
  } catch (error) {
    // Windows 极端情况下 rename 失败则退回直接写
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try {
      unlinkSync(tmpPath);
    } catch {
      // 忽略清理失败
    }
    logWarn(`JSON 原子写回退为直接写: ${describeError(error)}`);
  }
}

/* ------------------------------------------------------------------ *
 * agent-browser CLI 调用
 * ------------------------------------------------------------------ */

/**
 * Windows 下 cmd.exe 通过 PATHEXT 解析 .cmd，因此候选列表把 .cmd 放最前；
 * 环境变量 AGENT_BROWSER_BIN 可显式指定（优先级最高，且不再走候选链）。
 */
function collectBinCandidates(): string[] {
  const envBin = process.env.AGENT_BROWSER_BIN;
  if (envBin) return [envBin];
  return IS_WINDOWS
    ? ["agent-browser.cmd", "agent-browser.bat", "agent-browser"]
    : ["agent-browser"];
}

/**
 * 执行一条 agent-browser 命令（--session 非粘性，每条命令都必须带）。
 * 命令本身失败（非零退出/超时/缓冲溢出）时抛 AgentCliError；
 * 仅当「可执行文件本身找不到 / shim 失效」时才换下一个候选可执行名重试。
 *
 * Windows/cmd 注意：可执行名一律不加引号（加引号会让 cmd 对 .cmd 做 realpath 解析，
 * 经 junction 后可能指向失效路径——本机实测 `"agent-browser.cmd"` 会报
 * MODULE_NOT_FOUND 而裸名正常）；仅当路径含空格时才给可执行名加引号。
 */
async function runAgent(
  session: string,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let spawnError: unknown = null;
  for (const bin of collectBinCandidates()) {
    try {
      if (IS_WINDOWS) {
        // 可执行名裸写（无空格时不加引号），其余参数统一 shellQuote
        const parts: string[] = [];
        parts.push(/\s/u.test(bin) ? shellQuote(bin) : bin);
        parts.push(shellQuote("--session"), shellQuote(session));
        for (const arg of args) parts.push(shellQuote(arg));
        const { stdout, stderr } = await execFileAsync(parts.join(" "), {
          shell: true,
          windowsHide: true,
          timeout: timeoutMs,
          maxBuffer: MAX_BUFFER,
          encoding: "utf8",
        });
        return { stdout, stderr };
      }
      const { stdout, stderr } = await execFileAsync(bin, ["--session", session, ...args], {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
      });
      return { stdout, stderr };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string };
      const stderrText = String(err.stderr ?? err.message ?? "");
      // 可执行文件启动失败（ENOENT 等）或 shim 失效（引用已卸载的模块）：换下一个候选名
      const isBinResolutionFailure =
        typeof err.code === "string" ||
        /Cannot find module|MODULE_NOT_FOUND|is not recognized|不是内部或外部命令/iu.test(stderrText);
      if (isBinResolutionFailure) {
        spawnError = error;
        continue;
      }
      const isTimeout = err.killed === true || err.code === "ETIMEDOUT" || String(err.message).includes("ETIMEDOUT");
      throw new AgentCliError(
        isTimeout
          ? `agent-browser 命令执行超时（>${timeoutMs}ms）`
          : `agent-browser 命令失败（exit=${String(err.code ?? "unknown")}）`,
        [bin, "--session", session, ...args].join(" "),
        stderrText.slice(0, 2000),
      );
    }
  }
  throw new AgentCliError(
    `无法启动 agent-browser CLI：可执行文件未找到或 shim 失效（候选: ${collectBinCandidates().join(", ")}）。可用环境变量 AGENT_BROWSER_BIN 指定。`,
    "agent-browser",
    String(spawnError ?? ""),
  );
}

/** close 收口：失败只警告（会话可能本来就不存在），不掩盖主结果。 */
async function tryCloseSession(session: string): Promise<void> {
  try {
    await runAgent(session, ["close"], { timeoutMs: 15000 });
  } catch {
    logWarn(`close 会话 ${session} 失败（已忽略，可能无残留会话）`);
  }
}

/* ------------------------------------------------------------------ *
 * 快照 ref 提取（尽力而为，取不到不阻塞，用 CSS 选择器兜底）
 * ------------------------------------------------------------------ */

/** 从选择器最后一个复合选择器里取 class / id 作为快照匹配线索。 */
function selectorNeedle(selector: string): string {
  const lastCompound = selector.split(/[\s>+~]/u).filter(Boolean).pop() ?? selector;
  const classes = lastCompound.match(/\.([\w-]+)/gu);
  if (classes?.length) return classes[classes.length - 1]!.slice(1);
  const idMatch = lastCompound.match(/#([\w-]+)/u);
  if (idMatch) return idMatch[1]!;
  return "";
}

/**
 * 从 snapshot 输出（--json 优先）里找目标元素 ref（如 @e12）。
 * ref 是 agent-browser 栈内引用，与 chrome-devtools MCP 的 UID 不通用（见 §6.5）。
 */
function extractRefFromSnapshot(stdout: string, needle: string): string | null {
  const trimmed = stdout.trim();
  if (!needle) return null;
  const parsed = tryJson(trimmed);
  if (parsed !== null) {
    const found = deepFind<Record<string, unknown>>(parsed, (v) => {
      if (typeof v !== "object" || v === null) return false;
      const o = v as Record<string, unknown>;
      const ref = typeof o.ref === "string" ? o.ref : typeof o.refId === "string" ? o.refId : "";
      if (!ref) return false;
      return JSON.stringify(o).toLowerCase().includes(needle.toLowerCase());
    });
    if (found.found) {
      const o = found.value;
      return typeof o.ref === "string" ? o.ref : (o.refId as string);
    }
    return null;
  }
  // 文本快照兜底：找包含 needle 的行里的 @ref
  for (const line of trimmed.split(/\r?\n/u)) {
    if (line.toLowerCase().includes(needle.toLowerCase())) {
      const match = line.match(/@e\d+/u);
      if (match) return match[0];
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * evaluate 取证 JS（内联在脚本里，经 -b base64 传入避免 shell 转义）
 * ------------------------------------------------------------------ */

/** computedStyle 取证属性子集（与病灶相关的常用样式属性，见 §4 字段约束）。 */
const FORENSICS_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "fontFamily",
  "display",
  "visibility",
  "opacity",
  "pointerEvents",
  "position",
  "zIndex",
  "cursor",
  "textAlign",
  "boxShadow",
  "margin",
  "padding",
  "border",
  "transform",
];

/** 生成浏览器内执行的取证 JS：元素信息 + computedStyle 子集 + boxModel（含 elementFromPoint 命中检测）。 */
function buildForensicsScript(selector: string): string {
  const styleKeysJson = JSON.stringify(FORENSICS_STYLE_KEYS);
  return `(() => {
  const selector = ${JSON.stringify(selector)};
  const el = document.querySelector(selector);
  if (!el) return { found: false, selector };
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const styleKeys = ${styleKeysJson};
  const styles = {};
  for (const key of styleKeys) styles[key] = cs[key] ?? "";
  const attrs = {};
  const attrNames = ["class", "id", "type", "title", "aria-disabled", "style", "href", "src", "value", "placeholder"];
  for (const name of attrNames) {
    const v = el.getAttribute(name);
    if (v !== null && v !== "") attrs[name] = v;
  }
  if ("disabled" in el) attrs.disabled = !!el.disabled;
  const className = (hit && typeof hit.getAttribute === "function") ? hit.getAttribute("class") : null;
  const hitTarget = hit
    ? [hit.tagName.toLowerCase(), hit.id ? "#" + hit.id : "", className ? "." + String(className).trim().split(/\\s+/).filter(Boolean).join(".") : ""].join("")
    : null;
  return {
    found: true,
    selector,
    element: { selector, tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").trim().slice(0, 120), attrs },
    computedStyle: styles,
    boxModel: {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      zIndex: cs.zIndex, hitTarget, hitMatchesTarget: hit ? (hit === el || el.contains(hit)) : false,
    },
  };
})()`;
}

/* ------------------------------------------------------------------ *
 * 控制台取证（consoleErrors）
 * ------------------------------------------------------------------ */

const LEVEL_KEYS = ["level", "severity", "type", "kind"];
const TEXT_KEYS = ["text", "message", "description", "error", "value"];

/** 把 errors / console 命令的 JSON 输出归一化成 { level, text } 列表。 */
function normalizeMessages(value: unknown): MessageItem[] {
  const out: MessageItem[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    const o = v as Record<string, unknown>;
    let text = "";
    for (const key of TEXT_KEYS) {
      if (typeof o[key] === "string" && (o[key] as string).trim()) {
        text = (o[key] as string).trim();
        break;
      }
    }
    if (text) {
      let level = "";
      for (const key of LEVEL_KEYS) {
        if (typeof o[key] === "string" && (o[key] as string).trim()) {
          level = (o[key] as string).trim().toLowerCase();
          break;
        }
      }
      out.push({ level: level || "log", text: text.slice(0, 500) });
    }
    for (const key of Object.keys(o)) {
      if (LEVEL_KEYS.includes(key) || TEXT_KEYS.includes(key)) continue;
      const child = o[key];
      if (Array.isArray(child) || (typeof child === "object" && child !== null)) visit(child);
    }
  };
  visit(value);
  return out;
}

/**
 * 采集控制台报错（7 步链第 ⑥ 步）。
 * 主用 errors 命令；errors 为空时用 console 命令兜底（补抓 Vue hydration warning 等 warning 级消息）。
 * 无报错时返回 []（§4 要求该字段必须存在，证明「已查过」）。
 */
async function collectConsoleErrors(session: string): Promise<MessageItem[]> {
  let messages: MessageItem[] = [];
  try {
    const out = await runAgent(session, ["errors", "--json"], { timeoutMs: 30000 });
    messages = normalizeMessages(tryJson(out.stdout));
  } catch (error) {
    logWarn(`errors 命令失败: ${describeError(error)}`);
  }
  if (messages.length === 0) {
    try {
      const out = await runAgent(session, ["console", "--json"], { timeoutMs: 30000 });
      messages = normalizeMessages(tryJson(out.stdout)).filter(
        (m) => m.level === "error" || m.level === "warning",
      );
    } catch {
      // console 兜底失败不阻塞
    }
  }
  const seen = new Set<string>();
  return messages.filter((m) => {
    const key = `${m.level}\u0000${m.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * get styles 解析
 * ------------------------------------------------------------------ */

const STYLE_KEYS = new Set<string>(FORENSICS_STYLE_KEYS);

/** 从 get styles --json 输出里提取 computedStyle 子集（形状未知，做防御式查找）。 */
function extractStyles(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {};
  const node = deepFind<Record<string, unknown>>(value, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return Object.keys(o).some((k) => STYLE_KEYS.has(k) && typeof o[k] === "string");
  });
  const out: Record<string, string> = {};
  if (!node.found) return out;
  const o = node.value;
  for (const [key, val] of Object.entries(o)) {
    if (STYLE_KEYS.has(key) && typeof val === "string") out[key] = val;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

function printUsage(toStdout: boolean): void {
  const lines = [
    "用法：pnpm exec tsx scripts/diagnose-ui.mts <url> <css-selector> [options]",
    "",
    "对目标页面元素执行 7 步取证链（open → snapshot → click → snapshot → get styles → eval → errors → screenshot），",
    "输出符合 phase-1-standardization.md §4 Schema 的病灶 JSON。",
    "",
    "必填参数：",
    "  <url>                    目标页面地址，如 https://drill.ruan-cat.com/",
    "  <css-selector>           目标元素 CSS 选择器，如 button.notice-btn",
    "",
    "选项：",
    "  --bug-id <id>            病灶编号，默认 B1；决定会话名（diag-<id>）与产物文件名（小写化）",
    "  --interaction click      是否执行点击交互（click / none，默认 none）；click 时补全交互后快照",
    "  --out <path>             病灶 JSON 输出路径，默认 docs/toolchain/evidence/<id小写>-report.json",
    "  --timeout-ms <ms>        单条 agent-browser 命令超时，默认 60000",
    "  -h, --help               打印本帮助",
    "",
    "环境变量：",
    "  AGENT_BROWSER_BIN        自定义 agent-browser 可执行文件路径（Windows 下默认尝试 .cmd / .bat）",
    "  AGENT_BROWSER_TIMEOUT_MS 等价于 --timeout-ms",
    "",
    "输出约定：进度日志写 stderr；病灶 JSON 写 stdout（可管道消费）并落盘到 --out。",
    "退出码：关键步骤（open / eval / screenshot before）失败为 1，其余降级记录。",
  ];
  (toStdout ? console.log : console.error)(lines.join("\n"));
}

function parseDiagnoseArgs(argv: string[]): DiagnoseArgs {
  const args: DiagnoseArgs = { help: false, bugId: "B1", interaction: "none", timeoutMs: DEFAULT_TIMEOUT_MS };
  const positionals: string[] = [];
  const takeValue = (flag: string, inline: string | null, index: number): string => {
    if (inline !== null) return inline;
    const next = argv[index + 1];
    if (next === undefined) throw new UsageError(`参数 ${flag} 缺少值`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const inline = (name: string): string | null => (token.startsWith(`${name}=`) ? token.slice(name.length + 1) : null);
    if (token === "-h" || token === "--help") {
      args.help = true;
    } else if (token === "--bug-id" || inline("--bug-id") !== null) {
      args.bugId = takeValue("--bug-id", inline("--bug-id"), i++);
    } else if (token === "--interaction" || inline("--interaction") !== null) {
      const value = takeValue("--interaction", inline("--interaction"), i++);
      if (value !== "click" && value !== "none") {
        throw new UsageError(`--interaction 只支持 click / none，收到: ${value}`);
      }
      args.interaction = value;
    } else if (token === "--out" || inline("--out") !== null) {
      args.out = takeValue("--out", inline("--out"), i++);
    } else if (token === "--timeout-ms" || inline("--timeout-ms") !== null) {
      const value = Number(takeValue("--timeout-ms", inline("--timeout-ms"), i++));
      if (!Number.isFinite(value) || value <= 0) throw new UsageError(`--timeout-ms 必须是正数，收到: ${value}`);
      args.timeoutMs = value;
    } else if (token.startsWith("-")) {
      throw new UsageError(`未知参数: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  if (args.help) return args; // 帮助优先，跳过必填参数校验
  if (positionals.length < 2) throw new UsageError(`缺少必填参数 <url> <css-selector>`);
  if (positionals.length > 2) throw new UsageError(`多余的位置参数: ${positionals.slice(2).join(" ")}`);
  args.url = positionals[0];
  args.selector = positionals[1];
  return args;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  let args: DiagnoseArgs;
  try {
    args = parseDiagnoseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`[diagnose-ui] ${error.message}`);
      printUsage(false);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (args.help) {
    printUsage(true);
    return;
  }

  const url = args.url!;
  const selector = args.selector!;
  const bugId = args.bugId;
  const slug = slugify(bugId);
  const session = `diag-${slug}`;
  const reportPath = resolve(args.out ?? join(DEFAULT_EVIDENCE_DIR, `${slug}-report.json`));
  const beforePng = join(DEFAULT_EVIDENCE_DIR, `${slug}-before.png`);
  const startedAt = Date.now();
  mkdirSync(DEFAULT_EVIDENCE_DIR, { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  logStep(`会话 ${session} | URL ${url} | 选择器 ${selector}`);
  // 预清理：确保会话从全新状态开始（失败说明会话本来就不存在，可忽略）
  await tryCloseSession(session);

  /** 病灶 JSON（§4 Schema），先建骨架，各步骤后回填。 */
  const report: Record<string, unknown> = {
    schemaVersion: "1.0",
    url,
    capturedAt: new Date().toISOString(),
    bugId,
    element: { uid: null, selector },
    computedStyle: {},
    boxModel: {},
    consoleErrors: [],
    screenshots: {},
  };
  const failures: string[] = [];

  try {
    logStep("① navigate: open");
    await runAgent(session, ["open", url], { timeoutMs: args.timeoutMs });
    // 页面加载缓冲：SPA（如 Vue）在 app mount 后才会渲染目标元素，等待其挂载完成
    logStep("①.5 settle: wait 1500ms");
    await runAgent(session, ["wait", "1500"], { timeoutMs: 30000 });

    const needle = selectorNeedle(selector);
    const refs: string[] = [];

    logStep("② snapshot");
    try {
      const snap1 = await runAgent(session, ["snapshot", "--json"], { timeoutMs: args.timeoutMs });
      const ref1 = extractRefFromSnapshot(snap1.stdout, needle);
      if (ref1) refs.push(ref1);
      logStep(`snapshot 目标 ref: ${ref1 ?? "未提取到（后续用 CSS 选择器兜底）"}`);
    } catch (error) {
      logWarn(`snapshot 失败（不阻塞，用 CSS 选择器兜底）: ${describeError(error)}`);
    }

    if (args.interaction === "click") {
      const clickTarget = refs[refs.length - 1] ?? selector;
      logStep(`③ click ${clickTarget}`);
      try {
        await runAgent(session, ["click", clickTarget], { timeoutMs: args.timeoutMs });
        logStep("④ snapshot（交互后）");
        const snap2 = await runAgent(session, ["snapshot", "--json"], { timeoutMs: args.timeoutMs });
        const ref2 = extractRefFromSnapshot(snap2.stdout, needle);
        if (ref2) refs.push(ref2);
      } catch (error) {
        const message = `click 交互失败（不阻塞取证）: ${describeError(error)}`;
        logWarn(message);
        failures.push(message);
      }
    }
    // §4 字段约束：element.uid 必须来自最近一次 snapshot
    const latestRef = refs[refs.length - 1] ?? null;

    let computedStyleCli: Record<string, string> = {};
    logStep("⑤a get styles（computedStyle）");
    try {
      const stylesOut = await runAgent(session, ["get", "styles", selector, "--json"], { timeoutMs: args.timeoutMs });
      computedStyleCli = extractStyles(tryJson(stylesOut.stdout));
    } catch (error) {
      logWarn(`get styles 失败（用 eval 取证结果顶替）: ${describeError(error)}`);
    }

    let forensics: Record<string, unknown> | null = null;
    logStep("⑤b eval 取证脚本");
    try {
      const js = buildForensicsScript(selector);
      const evalOut = await runAgent(session, [
        "eval",
        "-b",
        Buffer.from(js, "utf8").toString("base64"),
        "--json",
      ], { timeoutMs: args.timeoutMs });
      const parsed = tryJson(evalOut.stdout);
      // 兼容 CLI 对结果的包装（如 { result: {...} }）：找含 found / element 键的对象
      const unwrapped = deepFind<Record<string, unknown>>(parsed, (v) => {
        if (typeof v !== "object" || v === null) return false;
        const o = v as Record<string, unknown>;
        return "found" in o || "element" in o;
      });
      forensics = unwrapped.found ? unwrapped.value : (parsed as Record<string, unknown> | null);
    } catch (error) {
      const message = `eval 取证失败: ${describeError(error)}`;
      logWarn(message);
      failures.push(message);
    }

    logStep("⑥ errors（consoleErrors）");
    const consoleErrors = await collectConsoleErrors(session);
    logStep(`consoleErrors 共 ${consoleErrors.length} 条`);

    logStep(`⑦ screenshot before: ${beforePng}`);
    try {
      await runAgent(session, ["screenshot", beforePng], { timeoutMs: args.timeoutMs });
    } catch (error) {
      const message = `screenshot before 失败（§4 硬性前置，必须成功）: ${describeError(error)}`;
      logWarn(message);
      failures.push(message);
    }

    /* ---------- 组装 §4 Schema JSON ---------- */
    const forensicsElement = (forensics?.element ?? {}) as Record<string, unknown>;
    report.element = { uid: latestRef, selector, ...forensicsElement };
    report.computedStyle = { ...computedStyleCli, ...((forensics?.computedStyle ?? {}) as Record<string, unknown>) };
    report.boxModel = forensics?.boxModel ?? {};
    report.consoleErrors = consoleErrors;
    report.screenshots = { before: toPosixRelative(beforePng) };
    if (forensics && forensics.found === false) {
      failures.push(`页面中未找到选择器 ${selector}`);
    }
  } catch (error) {
    const message = `取证链中断: ${describeError(error)}`;
    logWarn(message);
    failures.push(message);
  } finally {
    // 收口：always close，失败不掩盖主结果
    await tryCloseSession(session);
  }

  if (failures.length > 0) report.error = failures.join("; ");
  writeJsonAtomic(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  logStep(`证据链完成，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，报告: ${reportPath}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();