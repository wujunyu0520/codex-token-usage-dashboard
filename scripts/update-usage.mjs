import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectUsage,
  formatCompact,
  formatCurrency,
  readUsageDataFile,
  stableMergeUsage,
} from "./ccusage-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "usage-data.js");
const snapshotDir = resolve(root, "snapshots");
const rawMode = process.argv.includes("--raw") || process.env.CCUSAGE_RAW === "1";

const previous = await readUsageDataFile(outputPath);
const rawData = await collectUsage();
const data = rawMode ? rawData : stableMergeUsage(previous, rawData);

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

console.log(`已更新 ${outputPath}`);
console.log(rawMode ? "模式：ccusage 原始覆盖" : "模式：稳定历史合并（按日期保留较高历史值）");
if (!rawMode && data.stabilization?.protectedDays?.length) {
  console.log(`已防止回退日期：${data.stabilization.protectedDays.join("、")}`);
}
console.log(
  `累计：${formatCompact(data.dailyTotals.totalTokens)} tokens，估算费用 ${formatCurrency(
    data.dailyTotals.costUSD,
  )}`,
);

function safeTimestamp(value) {
  return new Date(value).toISOString().replace(/[:.]/g, "-");
}
