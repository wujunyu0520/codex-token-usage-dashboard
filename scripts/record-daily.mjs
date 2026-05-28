import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectUsage,
  formatCompact,
  formatCurrency,
  localDateString,
  readUsageDataFile,
  stableMergeUsage,
} from "./ccusage-data.mjs";
import {
  appendDailyLedgerRecord,
  buildDailyLedgerRecord,
  pickDayForLedger,
  readPreviousLedgerHash,
  selectLedgerDates,
} from "./daily-ledger.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "usage-data.js");
const snapshotDir = resolve(root, "snapshots");
const ledgerPath = resolve(root, "records", "daily-ledger.jsonl");

const previous = await readUsageDataFile(outputPath);
const rawData = await collectUsage();
const data = stableMergeUsage(previous, rawData);
const timezone = data.timezone || rawData.timezone || "Asia/Shanghai";
const today = localDateString(new Date(), timezone);
const recordDates = process.env.RECORD_DATE
  ? [process.env.RECORD_DATE]
  : selectLedgerDates(data.daily, today, process.env.RECORD_RECENT_DAYS || 2);

await mkdir(root, { recursive: true });
await mkdir(snapshotDir, { recursive: true });

if (previous) {
  const previousTimestamp = safeTimestamp(previous.generatedAt || new Date().toISOString());
  await writeFile(
    resolve(snapshotDir, `usage-data-before-${previousTimestamp}.json`),
    `${JSON.stringify(previous, null, 2)}\n`,
    "utf8",
  );
}

const rawTimestamp = safeTimestamp(rawData.generatedAt);
await writeFile(
  resolve(snapshotDir, `ccusage-raw-${rawTimestamp}.json`),
  `${JSON.stringify(rawData, null, 2)}\n`,
  "utf8",
);

await writeFile(
  outputPath,
  `window.__CCUSAGE_DATA__ = ${JSON.stringify(data, null, 2)};\n`,
  "utf8",
);

let previousHash = await readPreviousLedgerHash(ledgerPath);
const records = [];
for (const recordDate of recordDates) {
  const stableDay = pickDayForLedger(data.daily, recordDate);
  const rawDay = pickDayForLedger(rawData.daily, recordDate);
  const record = buildDailyLedgerRecord({
    date: recordDate,
    timezone,
    stableDay,
    rawDay,
    previousHash,
    stableGeneratedAt: data.generatedAt,
    rawGeneratedAt: rawData.generatedAt,
  });

  await appendDailyLedgerRecord(ledgerPath, record);
  previousHash = record.hash;
  records.push({ record, stableDay });
}

console.log(`已刷新 ${outputPath}`);
console.log(`已追加每日账本 ${ledgerPath}`);
for (const { record, stableDay } of records) {
  console.log(`账本哈希：${record.date} ${record.hash}`);
  console.log(
    `${record.date}：${formatCompact(stableDay.totalTokens)} tokens，估算费用 ${formatCurrency(
      stableDay.costUSD,
    )}`,
  );
}

if (data.stabilization?.protectedDays?.length) {
  console.log(`已防止回退日期：${data.stabilization.protectedDays.join("、")}`);
}

function safeTimestamp(value) {
  return new Date(value).toISOString().replace(/[:.]/g, "-");
}
