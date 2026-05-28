import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const ZERO_TOKEN_FIELDS = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  costUSD: 0,
};

export function pickDayForLedger(days, date) {
  const day = (days || []).find((row) => row.date === date);
  return normalizeDay(day, date);
}

export function selectLedgerDates(days, currentDate, recentDays = 2) {
  const limit = Math.max(1, Number(recentDays || 1));
  const dates = new Set(
    (days || [])
      .map((day) => day.date)
      .filter((date) => date && date <= currentDate),
  );
  dates.add(currentDate);
  return [...dates].sort().slice(-limit);
}

export function buildDailyLedgerRecord({
  date,
  timezone,
  recordedAt = new Date().toISOString(),
  stableDay,
  rawDay,
  previousHash = null,
  stableGeneratedAt = null,
  rawGeneratedAt = null,
}) {
  const stable = normalizeDay(stableDay, date);
  const raw = normalizeDay(rawDay, date);
  const base = {
    schemaVersion: 1,
    recordType: "codex-token-daily-observation",
    recordedAt,
    date,
    timezone,
    source: "ccusage+stable-dashboard",
    primaryModel: getPrimaryModel(stable),
    stable,
    raw,
    recovered: stableDay?.recovered ?? null,
    stableGeneratedAt,
    rawGeneratedAt,
    previousHash,
  };

  return {
    ...base,
    hash: hashRecord(base),
  };
}

export async function readPreviousLedgerHash(ledgerPath) {
  try {
    const content = await readFile(ledgerPath, "utf8");
    const lastLine = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .at(-1);
    if (!lastLine) return null;
    return JSON.parse(lastLine).hash ?? null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function appendDailyLedgerRecord(ledgerPath, record) {
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
}

function normalizeDay(day, date) {
  return {
    date,
    inputTokens: Number(day?.inputTokens || 0),
    cachedInputTokens: Number(day?.cachedInputTokens || 0),
    outputTokens: Number(day?.outputTokens || 0),
    reasoningOutputTokens: Number(day?.reasoningOutputTokens || 0),
    totalTokens: Number(day?.totalTokens || 0),
    costUSD: Number(day?.costUSD || 0),
    models: day?.models || {},
  };
}

function getPrimaryModel(day) {
  return (
    Object.entries(day.models || {})
      .sort((a, b) => Number(b[1]?.totalTokens || 0) - Number(a[1]?.totalTokens || 0))[0]?.[0] ?? "无"
  );
}

function hashRecord(record) {
  return createHash("sha256").update(stableStringify(record)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
