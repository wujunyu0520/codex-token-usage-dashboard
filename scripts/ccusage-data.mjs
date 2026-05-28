import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEZONE = process.env.CCUSAGE_TIMEZONE || "Asia/Shanghai";

async function runCcusage(command, timezone = DEFAULT_TIMEZONE) {
  const args = [
    "ccusage@latest",
    "codex",
    command,
    "--json",
    "--timezone",
    timezone,
  ];

  const { stdout } = await execFileAsync("npx", args, {
    maxBuffer: 1024 * 1024 * 64,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });

  return JSON.parse(stdout);
}

export async function collectUsage(timezone = DEFAULT_TIMEZONE) {
  const [daily, sessions] = await Promise.all([
    runCcusage("daily", timezone),
    runCcusage("session", timezone),
  ]);

  return {
    timezone,
    generatedAt: new Date().toISOString(),
    daily: daily.daily ?? [],
    dailyTotals: daily.totals ?? {},
    sessions: sessions.sessions ?? [],
    sessionTotals: sessions.totals ?? {},
  };
}

export function formatCompact(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) return `${trim(number / 1_000_000_000)}B`;
  if (number >= 1_000_000) return `${trim(number / 1_000_000)}M`;
  if (number >= 1_000) return `${trim(number / 1_000)}K`;
  return Math.round(number).toLocaleString("en-US");
}

function trim(value) {
  return Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)).toString();
}

export function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function localDateString(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildDailyReport(data) {
  const timezone = data.timezone || DEFAULT_TIMEZONE;
  const today = localDateString(new Date(), timezone);
  const days = [...(data.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
  const todayRow = days.find((day) => day.date === today) ?? {
    date: today,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    models: {},
  };
  const previousRows = days.filter((day) => day.date < today).slice(-7);
  const sevenDayAverage = previousRows.length
    ? previousRows.reduce((sum, day) => sum + Number(day.totalTokens || 0), 0) / previousRows.length
    : 0;
  const delta = sevenDayAverage
    ? (Number(todayRow.totalTokens || 0) - sevenDayAverage) / sevenDayAverage
    : 0;
  const model = Object.entries(todayRow.models || {})
    .sort((a, b) => Number(b[1].totalTokens || 0) - Number(a[1].totalTokens || 0))[0]?.[0] ?? "无";

  const deltaText = sevenDayAverage
    ? `${delta >= 0 ? "高于" : "低于"}近 7 个有使用日均值 ${Math.abs(delta * 100).toFixed(1)}%`
    : "暂无近 7 个有使用日均值";

  return [
    `Codex Token 日报（${today}，${timezone}）`,
    `今日总量：${formatCompact(todayRow.totalTokens)} tokens，估算费用 ${formatCurrency(todayRow.costUSD)}`,
    `输入：${formatCompact(todayRow.inputTokens)}，缓存输入：${formatCompact(todayRow.cachedInputTokens)}，输出：${formatCompact(todayRow.outputTokens)}，推理输出：${formatCompact(todayRow.reasoningOutputTokens)}`,
    `主要模型：${model}`,
    `对比：${deltaText}`,
  ].join("\n");
}
