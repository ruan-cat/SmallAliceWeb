/**
 * @file scripts/verify-ui-fix.mts
 *
 * 浏览器 UI 修复验证脚本（Phase 1 工具链标准化 §5 验证闭环，见 docs/toolchain/phase-1-standardization.md）。
 *
 * 用途：修复后复跑取证（open → get styles → is enabled → errors → screenshot after），
 *       与 diagnose-ui.mts 产出的 before 截图做视觉 diff（diff screenshot --baseline），
 *       按 --expect-* 参数断言，输出 PASS/FAIL 结论，并回填病灶 JSON 的
 *       screenshots.after 与 verification 字段（append/update 同一个 <id>-report.json）。
 *
 * 用法：
 *   pnpm exec tsx scripts/verify-ui-fix.mts <url> <css-selector> --baseline <before截图> \
 *     [--bug-id B2] [--expect-enabled true] [--expect-style "backgroundColor=rgb(255, 255, 255)"] \
 *     [--max-diff-ratio 0.05] [--out <json 路径>] [--timeout-ms 60000]
 *
 * 依赖：仅 agent-browser CLI + Node 内置模块（零新装）。
 * 平台：Windows 11（cmd.exe）与 POSIX 兼容，可执行名解析与 diagnose-ui.mts 一致
 *       （AGENT_BROWSER_BIN 可显式指定）。
 *
 * 输出约定：进度日志写 stderr，更新后的病灶 JSON 写 stdout。
 * 退出码：断言全部通过为 0（PASS）；任一断言失败或关键步骤失败为 1（FAIL），报告仍照写。
 * 会话在 finally 中保证 close，close 失败不掩盖主结果。
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";
const CWD = process.cwd();
const MAX_BUFFER = 30 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_BROWSER_TIMEOUT_MS ?? 60000);
const DEFAULT_EVIDENCE_DIR = join(CWD, "docs", "toolchain", "evidence");

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

interface VerifyArgs {
  help: boolean;
  url?: string;
  selector?: string;
  baseline?: string;
  bugId: string;
  /** null = 未指定，不做断言 */
  expectEnabled: boolean | null;
  /** prop -> 期望值 */
  expectStyles: Record<string, string>;
  /** null = 未指定，不做断言 */
  maxDiffRatio: number | null;
  out?: string;
  timeoutMs: number;
}

/* ------------------------------------------------------------------ *
 * 基础工具函数（与 diagnose-ui.mts 同构，保持双脚本自包含）
 * ------------------------------------------------------------------ */

function logStep(message: string): void {
  console.error(`[verify-ui-fix] ${message}`);
}

function logWarn(message: string): void {
  console.error(`[verify-ui-fix][warn] ${message}`);
}

function describeError(error: unknown): string {
  if (error instanceof AgentCliError) return String(error.detail ?? error.message);
  if (error instanceof Error) return error.message;
  return String(error);
}

function shellQuote(arg: string): string {
  if (/["\r\n\u0000]/u.test(arg)) {
    throw new AgentCliError(
      `参数包含 cmd 无法安全转义的字符（双引号/换行/控制字符）: ${arg}`,
      "shellQuote",
    );
  }
  return `"${arg}"`;
}

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
      try {
        return JSON.parse(trimmed.slice(start, end)) as unknown;
      } catch {
        // 尝试下一组切分
      }
    }
  }
  return null;
}

type DeepFindResult<T> =
  | { found: true; value: T }
  | { found: false };

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

function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function toPosixRelative(absPath: string): string {
  return relative(CWD, absPath).split(sep).join("/");
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    renameSync(tmpPath, filePath);
  } catch (error) {
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
 * agent-browser CLI 调用（与 diagnose-ui.mts 同构）
 * ------------------------------------------------------------------ */

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

async function tryCloseSession(session: string): Promise<void> {
  try {
    await runAgent(session, ["close"], { timeoutMs: 15000 });
  } catch {
    logWarn(`close 会话 ${session} 失败（已忽略，可能无残留会话）`);
  }
}

/* ------------------------------------------------------------------ *
 * 输出解析（styles / enabled / errors / diff）
 * ------------------------------------------------------------------ */

const STYLE_KEYS = new Set<string>([
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
]);

/** 从 get styles --json 输出提取 computedStyle 子集。 */
function extractStyles(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {};
  const node = deepFind<Record<string, unknown>>(value, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return Object.keys(o).some((k) => STYLE_KEYS.has(k) && typeof o[k] === "string");
  });
  const out: Record<string, string> = {};
  if (!node.found) return out;
  for (const [key, val] of Object.entries(node.value)) {
    if (STYLE_KEYS.has(key) && typeof val === "string") out[key] = val;
  }
  return out;
}

/** 解析 is enabled 命令输出为布尔值；解析不出返回 null。 */
function parseBooleanValue(stdout: string): boolean | null {
  const text = stdout.trim().toLowerCase();
  if (/^true\b/u.test(text)) return true;
  if (/^false\b/u.test(text)) return false;
  const parsed = tryJson(stdout);
  if (typeof parsed === "boolean") return parsed;
  if (parsed !== null) {
    const found = deepFind<boolean>(parsed, (v) => typeof v === "boolean");
    if (found.found) return found.value;
  }
  return null;
}

async function readEnabled(session: string, selector: string): Promise<boolean | null> {
  try {
    const out = await runAgent(session, ["is", "enabled", selector, "--json"], { timeoutMs: 30000 });
    return parseBooleanValue(out.stdout);
  } catch (error) {
    logWarn(`is enabled 查询失败: ${describeError(error)}`);
    return null;
  }
}

const LEVEL_KEYS = ["level", "severity", "type", "kind"];
const TEXT_KEYS = ["text", "message", "description", "error", "value"];

function normalizeMessages(value: unknown): Array<{ level: string; text: string }> {
  const out: Array<{ level: string; text: string }> = [];
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

async function collectConsoleErrors(session: string): Promise<Array<{ level: string; text: string }>> {
  let messages: Array<{ level: string; text: string }> = [];
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

const RATIO_KEYS = ["changedRatio", "changeRatio", "diffRatio", "ratio", "percent", "changedPercent", "diffPercent", "changedPct"];
const IMAGE_KEYS = ["diffImage", "diffPath", "outputPath", "output", "image", "path"];

/** 从 diff screenshot --json 输出提取 changed ratio（0-1）。 */
function extractDiffRatio(value: unknown): number | null {
  const found = deepFind<Record<string, unknown>>(value, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return RATIO_KEYS.some((k) => typeof o[k] === "number");
  });
  if (!found.found) return null;
  for (const key of RATIO_KEYS) {
    const val = found.value[key];
    if (typeof val === "number") return val;
  }
  return null;
}

/** 从 diff screenshot 文本输出提取比例：优先百分比（转为 0-1），其次像素数绝对值。 */
function extractDiffRatioFromText(text: string): number | null {
  const percent = text.match(/(\d+(?:\.\d+)?)%/u);
  if (percent) return Number(percent[1]) / 100;
  const pixels = text.match(/(\d+(?:\.\d+)?)\s*pixels?/iu);
  if (pixels) return Number(pixels[1]);
  return null;
}

/** 从 diff screenshot --json 输出提取 diff 输出图路径。 */
function extractDiffImage(value: unknown): string | null {
  const found = deepFind<Record<string, unknown>>(value, (v) => {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return IMAGE_KEYS.some((k) => typeof o[k] === "string" && /\.(png|jpe?g|webp)$/iu.test(o[k] as string));
  });
  if (!found.found) return null;
  for (const key of IMAGE_KEYS) {
    const val = found.value[key];
    if (typeof val === "string" && /\.(png|jpe?g|webp)$/iu.test(val)) return val;
  }
  return null;
}

/** 样式值模糊归一：去空白、转小写（rgb 分量间距差异可对齐）。 */
function normalizeCssValue(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "").replace(/;$/, "");
}

/* ------------------------------------------------------------------ *
 * 报告读写
 * ------------------------------------------------------------------ */

/** 已存在则读取并返回（保留 diagnose 的 element / boxModel / consoleErrors），否则新建骨架。 */
function loadExistingReport(reportPath: string, url: string, bugId: string): Record<string, unknown> {
  if (existsSync(reportPath)) {
    try {
      const parsed = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch (error) {
      logWarn(`已存在报告无法解析，将以新报告覆盖: ${describeError(error)}`);
    }
  }
  return {
    schemaVersion: "1.0",
    url,
    capturedAt: new Date().toISOString(),
    bugId,
    element: {},
    computedStyle: {},
    boxModel: {},
    consoleErrors: [],
    screenshots: {},
  };
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

function printUsage(toStdout: boolean): void {
  const lines = [
    "用法：pnpm exec tsx scripts/verify-ui-fix.mts <url> <css-selector> --baseline <before截图> [options]",
    "",
    "修复后复跑取证（open → get styles → is enabled → errors → screenshot after），与基线截图做视觉 diff，",
    "按 --expect-* 断言输出 PASS/FAIL，并回填病灶 JSON 的 screenshots.after 与 verification 字段。",
    "",
    "必填参数：",
    "  <url>                    修复后页面地址，如 https://drill.ruan-cat.com/",
    "  <css-selector>           目标元素 CSS 选择器，如 button.notice-btn",
    "  --baseline <path>        修复前基线截图（diagnose-ui.mts 产出的 <id小写>-before.png）",
    "",
    "选项：",
    "  --bug-id <id>            病灶编号，默认 B1；决定报告更新路径与产物文件名（小写化）",
    "  --expect-enabled <bool>  断言元素启用状态（true / false），缺省不断言",
    "  --expect-style <kv>      断言 computedStyle 键值，如 \"backgroundColor=rgb(255, 255, 255)\"；",
    "                           可重复传入，或用分号分隔多对（如 \"color=rgb(0,0,0); opacity=1\"）",
    "  --max-diff-ratio <0-1>   断言视觉 diff 的 changed ratio 不高于该值，缺省不断言",
    "  --out <path>             要更新/追加的病灶 JSON 路径，默认 docs/toolchain/evidence/<id小写>-report.json",
    "  --timeout-ms <ms>        单条 agent-browser 命令超时，默认 60000",
    "  -h, --help               打印本帮助",
    "",
    "环境变量：",
    "  AGENT_BROWSER_BIN        自定义 agent-browser 可执行文件路径（Windows 下默认尝试 .cmd / .bat）",
    "  AGENT_BROWSER_TIMEOUT_MS 等价于 --timeout-ms",
    "",
    "输出约定：进度日志写 stderr；更新后的病灶 JSON 写 stdout。",
    "退出码：全部断言通过为 0（PASS），任一断言失败为 1（FAIL），报告仍照写。",
  ];
  (toStdout ? console.log : console.error)(lines.join("\n"));
}

function parseVerifyArgs(argv: string[]): VerifyArgs {
  const args: VerifyArgs = {
    help: false,
    bugId: "B1",
    expectEnabled: null,
    expectStyles: {},
    maxDiffRatio: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const positionals: string[] = [];
  const takeValue = (flag: string, inline: string | null, index: number): string => {
    if (inline !== null) return inline;
    const next = argv[index + 1];
    if (next === undefined) throw new UsageError(`参数 ${flag} 缺少值`);
    return next;
  };
  const pushExpectStyles = (value: string): void => {
    for (const pair of value.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) throw new UsageError(`--expect-style 需为 prop=value 形式，收到: ${trimmed}`);
      args.expectStyles[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const inline = (name: string): string | null => (token.startsWith(`${name}=`) ? token.slice(name.length + 1) : null);
    if (token === "-h" || token === "--help") {
      args.help = true;
    } else if (token === "--bug-id" || inline("--bug-id") !== null) {
      args.bugId = takeValue("--bug-id", inline("--bug-id"), i++);
    } else if (token === "--baseline" || inline("--baseline") !== null) {
      args.baseline = takeValue("--baseline", inline("--baseline"), i++);
    } else if (token === "--expect-enabled" || inline("--expect-enabled") !== null) {
      const value = takeValue("--expect-enabled", inline("--expect-enabled"), i++).toLowerCase();
      if (value !== "true" && value !== "false") {
        throw new UsageError(`--expect-enabled 只支持 true / false，收到: ${value}`);
      }
      args.expectEnabled = value === "true";
    } else if (token === "--expect-style" || inline("--expect-style") !== null) {
      pushExpectStyles(takeValue("--expect-style", inline("--expect-style"), i++));
    } else if (token === "--max-diff-ratio" || inline("--max-diff-ratio") !== null) {
      const value = Number(takeValue("--max-diff-ratio", inline("--max-diff-ratio"), i++));
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new UsageError(`--max-diff-ratio 必须是 0-1 之间的数字，收到: ${value}`);
      }
      args.maxDiffRatio = value;
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
  if (positionals.length < 2 || !args.baseline) {
    throw new UsageError("缺少必填参数 <url> <css-selector> --baseline <before截图>");
  }
  if (positionals.length > 2) throw new UsageError(`多余的位置参数: ${positionals.slice(2).join(" ")}`);
  args.url = positionals[0];
  args.selector = positionals[1];
  return args;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  let args: VerifyArgs;
  try {
    args = parseVerifyArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`[verify-ui-fix] ${error.message}`);
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
  const slug = slugify(args.bugId);
  const session = `diag-${slug}`;
  const reportPath = resolve(args.out ?? join(DEFAULT_EVIDENCE_DIR, `${slug}-report.json`));
  const afterPng = join(DEFAULT_EVIDENCE_DIR, `${slug}-after.png`);
  const diffPng = join(DEFAULT_EVIDENCE_DIR, `${slug}-diff.png`);
  const baselineAbs = resolve(args.baseline!);
  if (!existsSync(baselineAbs)) {
    console.error(`[verify-ui-fix] 基线截图不存在: ${args.baseline}`);
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  mkdirSync(DEFAULT_EVIDENCE_DIR, { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  logStep(`会话 ${session} | URL ${url} | 选择器 ${selector} | 基线 ${baselineAbs}`);
  await tryCloseSession(session);

  const failures: string[] = [];
  /** verification 字段（§5 验证闭环的产出） */
  const verification: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    url,
    selector,
    baseline: toPosixRelative(baselineAbs),
  };

  try {
    logStep("① navigate: open");
    await runAgent(session, ["open", url], { timeoutMs: args.timeoutMs });
    // 页面加载缓冲：SPA（如 Vue）在 app mount 后才会渲染目标元素，等待其挂载完成
    logStep("①.5 settle: wait 1500ms");
    await runAgent(session, ["wait", "1500"], { timeoutMs: 30000 });

    logStep("② get styles");
    let computedStyle: Record<string, string> = {};
    try {
      const stylesOut = await runAgent(session, ["get", "styles", selector, "--json"], { timeoutMs: args.timeoutMs });
      computedStyle = extractStyles(tryJson(stylesOut.stdout));
      verification.computedStyle = computedStyle;
    } catch (error) {
      const message = `get styles 失败: ${describeError(error)}`;
      logWarn(message);
      failures.push(message);
    }

    logStep("③ is enabled");
    const enabled = await readEnabled(session, selector);
    verification.enabled = enabled;

    logStep("④ errors（consoleErrors）");
    const consoleErrors = await collectConsoleErrors(session);
    verification.consoleErrors = consoleErrors;
    logStep(`consoleErrors 共 ${consoleErrors.length} 条`);

    logStep(`⑤ screenshot after: ${afterPng}`);
    try {
      await runAgent(session, ["screenshot", afterPng], { timeoutMs: args.timeoutMs });
      verification.after = toPosixRelative(afterPng);
    } catch (error) {
      const message = `screenshot after 失败: ${describeError(error)}`;
      logWarn(message);
      failures.push(message);
    }

    logStep("⑥ diff screenshot vs baseline");
    const diff: Record<string, unknown> = { baseline: toPosixRelative(baselineAbs) };
    try {
      const out = await runAgent(session, [
        "diff", "screenshot",
        "--baseline", baselineAbs,
        "-o", diffPng,
        "--json",
      ], { timeoutMs: args.timeoutMs });
      const parsed = tryJson(out.stdout);
      const ratio = extractDiffRatio(parsed) ?? extractDiffRatioFromText(out.stdout);
      const image = extractDiffImage(parsed) ?? (existsSync(diffPng) ? diffPng : null);
      diff.changedRatio = ratio;
      diff.diffImage = image ? toPosixRelative(image) : null;
      diff.raw = out.stdout.trim().slice(0, 800);
      logStep(`diff changedRatio=${String(ratio)}，diff 图: ${String(diff.diffImage ?? "无")}`);
    } catch (error) {
      const message = `diff screenshot 失败: ${describeError(error)}`;
      logWarn(message);
      failures.push(message);
    }
    verification.diff = diff;

    /* ---------- 断言 ---------- */
    const assertions: unknown[] = [];
    if (args.expectEnabled !== null) {
      const pass = enabled !== null && enabled === args.expectEnabled;
      assertions.push({ kind: "enabled", expected: args.expectEnabled, actual: enabled, pass });
      if (!pass) failures.push(`enabled 断言失败: 期望 ${args.expectEnabled}，实测 ${String(enabled)}`);
    }
    for (const [prop, expected] of Object.entries(args.expectStyles)) {
      const actual = computedStyle[prop] ?? null;
      const pass = actual !== null && normalizeCssValue(actual) === normalizeCssValue(expected);
      assertions.push({ kind: `style.${prop}`, expected, actual, pass });
      if (!pass) failures.push(`style.${prop} 断言失败: 期望 ${expected}，实测 ${String(actual)}`);
    }
    if (args.maxDiffRatio !== null) {
      const ratio = (diff.changedRatio as number | null) ?? null;
      const pass = ratio !== null && ratio <= args.maxDiffRatio;
      assertions.push({ kind: "diffRatio", expected: `<=${args.maxDiffRatio}`, actual: ratio, pass });
      if (!pass) failures.push(`diff ratio 断言失败: 期望 <= ${args.maxDiffRatio}，实测 ${String(ratio)}`);
    }
    verification.assertions = assertions;
    verification.result = {
      passed: failures.length === 0,
      failures: [...failures],
    };
  } catch (error) {
    failures.push(describeError(error));
    verification.result = { passed: false, failures: [...failures] };
  } finally {
    await tryCloseSession(session);
  }

  /* ---------- 回填病灶 JSON ---------- */
  const report = loadExistingReport(reportPath, url, args.bugId);
  report.url = url;
  report.screenshots = {
    before: toPosixRelative(baselineAbs),
    after: typeof verification.after === "string" ? verification.after : (report.screenshots as Record<string, unknown>).after ?? null,
  };
  report.verification = verification;
  report.updatedAt = new Date().toISOString();
  writeJsonAtomic(reportPath, report);

  console.log(JSON.stringify(report, null, 2));
  const verdict = failures.length === 0 ? "PASS" : "FAIL";
  logStep(`${verdict}：${failures.length === 0 ? "全部断言通过" : failures.join("; ")}`);
  logStep(`报告已更新: ${reportPath}；after 截图: ${String(verification.after ?? "无")}；耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();