import { collectUsage, buildDailyReport } from "./ccusage-data.mjs";

const data = await collectUsage();

console.log(buildDailyReport(data));
