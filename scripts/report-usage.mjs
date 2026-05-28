import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectUsage,
  buildDailyReport,
  readUsageDataFile,
  stableMergeUsage,
} from "./ccusage-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "usage-data.js");
const rawMode = process.argv.includes("--raw") || process.env.CCUSAGE_RAW === "1";
const previous = await readUsageDataFile(outputPath);
const rawData = await collectUsage();
const data = rawMode ? rawData : stableMergeUsage(previous, rawData);

console.log(buildDailyReport(data));
