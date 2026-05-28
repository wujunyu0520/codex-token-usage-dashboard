import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectUsage, formatCompact, formatCurrency } from "./ccusage-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "usage-data.js");
const data = await collectUsage();

await mkdir(root, { recursive: true });
await writeFile(
  outputPath,
  `window.__CCUSAGE_DATA__ = ${JSON.stringify(data, null, 2)};\n`,
  "utf8",
);

console.log(`已更新 ${outputPath}`);
console.log(
  `累计：${formatCompact(data.dailyTotals.totalTokens)} tokens，估算费用 ${formatCurrency(
    data.dailyTotals.costUSD,
  )}`,
);
