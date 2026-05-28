import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

export async function readUsageDataFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return parseUsageData(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function parseUsageData(content) {
  const json = content
    .replace(/^\s*window\.__CCUSAGE_DATA__\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(json);
}

export function stableMergeUsage(previous, current) {
  if (!previous) return current;

  const previousDays = new Map((previous.daily || []).map((day) => [day.date, day]));
  const currentDays = new Map((current.daily || []).map((day) => [day.date, day]));
  const mergedDays = [...new Set([...previousDays.keys(), ...currentDays.keys()])]
    .sort()
    .map((date) => {
      const previousDay = previousDays.get(date);
      const currentDay = currentDays.get(date);
      if (!previousDay) return currentDay;
      if (!currentDay) return previousDay;
      return highestTokenDay([
        previousDay,
        currentDay,
        manualOffsetDay(previousDay, currentDay),
      ]);
    });

  const mergedSessions = mergeSessions(previous.sessions || [], current.sessions || []);
  const dailyTotals = sumTokenRows(mergedDays);

  return {
    ...current,
    generatedAt: current.generatedAt,
    rawGeneratedAt: current.generatedAt,
    stableMergedAt: new Date().toISOString(),
    stabilization: {
      mode: "max-by-day",
      previousGeneratedAt: previous.generatedAt || null,
      rawTotalTokens: current.dailyTotals?.totalTokens || 0,
      stableTotalTokens: dailyTotals.totalTokens,
      protectedDays: mergedDays
        .filter((day) => {
          const currentDay = currentDays.get(day.date);
          return currentDay && Number(day.totalTokens || 0) > Number(currentDay.totalTokens || 0);
        })
        .map((day) => day.date),
    },
    daily: mergedDays,
    dailyTotals,
    sessions: mergedSessions,
    sessionTotals: sumTokenRows(mergedSessions),
  };
}

function highestTokenDay(days) {
  return days
    .filter(Boolean)
    .sort((a, b) => Number(b.totalTokens || 0) - Number(a.totalTokens || 0))[0];
}

function manualOffsetDay(previousDay, currentDay) {
  const baseline = previousDay.recovered?.manualOffsetBaseline;
  if (!baseline?.rawDay || !baseline?.displayDay) return null;

  const rawBase = baseline.rawDay;
  const displayBase = baseline.displayDay;
  const modelName = Object.keys(previousDay.models || currentDay.models || {})[0] || "gpt-5.5";
  const model = previousDay.models?.[modelName] || currentDay.models?.[modelName] || {};
  const inputTokens = addPositiveDelta(displayBase.inputTokens, currentDay.inputTokens, rawBase.inputTokens);
  const outputTokens = addPositiveDelta(displayBase.outputTokens, currentDay.outputTokens, rawBase.outputTokens);
  const totalTokens = addPositiveDelta(displayBase.totalTokens, currentDay.totalTokens, rawBase.totalTokens);
  const cachedInputTokens = Math.max(0, totalTokens - inputTokens - outputTokens);
  const reasoningOutputTokens = addPositiveDelta(
    displayBase.reasoningOutputTokens,
    currentDay.reasoningOutputTokens,
    rawBase.reasoningOutputTokens,
  );
  const costUSD = addPositiveDelta(displayBase.costUSD, currentDay.costUSD, rawBase.costUSD);

  return {
    ...previousDay,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    costUSD,
    models: {
      ...(previousDay.models || {}),
      [modelName]: {
        ...model,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
      },
    },
    recovered: {
      ...(previousDay.recovered || {}),
      precision: "manual-baseline-plus-raw-delta",
      manualOffsetBaseline: baseline,
      rawDeltaAppliedAt: new Date().toISOString(),
    },
  };
}

function addPositiveDelta(displayValue, currentValue, rawBaseValue) {
  const base = Number(displayValue || 0);
  const delta = Math.max(0, Number(currentValue || 0) - Number(rawBaseValue || 0));
  return Number.isInteger(base) && Number.isInteger(delta)
    ? base + delta
    : Number((base + delta).toFixed(6));
}

function mergeSessions(previousSessions, currentSessions) {
  const sessions = new Map();
  for (const session of [...previousSessions, ...currentSessions]) {
    const key = session.id || [
      session.directory || "",
      session.lastActivity || "",
      session.totalTokens || 0,
    ].join("|");
    const existing = sessions.get(key);
    if (!existing || Number(session.totalTokens || 0) > Number(existing.totalTokens || 0)) {
      sessions.set(key, session);
    }
  }
  return [...sessions.values()].sort((a, b) => {
    const left = a.lastActivity || a.directory || "";
    const right = b.lastActivity || b.directory || "";
    return left.localeCompare(right);
  });
}

function sumTokenRows(rows) {
  return rows.reduce(
    (total, row) => {
      total.inputTokens += Number(row.inputTokens || 0);
      total.cachedInputTokens += Number(row.cachedInputTokens || 0);
      total.outputTokens += Number(row.outputTokens || 0);
      total.reasoningOutputTokens += Number(row.reasoningOutputTokens || 0);
      total.totalTokens += Number(row.totalTokens || 0);
      total.costUSD += Number(row.costUSD || 0);
      return total;
    },
    {
      cachedInputTokens: 0,
      costUSD: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
  );
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
