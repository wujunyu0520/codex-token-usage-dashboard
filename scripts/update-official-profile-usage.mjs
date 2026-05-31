import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const endpoint = "https://chatgpt.com/backend-api/wham/profiles/me";
const projectRoot = path.resolve(import.meta.dirname, "..");
const authPath = path.join(os.homedir(), ".codex", "auth.json");
const timezone = "Asia/Shanghai";

function readAuth() {
  const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
  const token = auth.tokens?.access_token;
  if (!token) {
    throw new Error(`Missing access_token in ${authPath}`);
  }

  let chatgptAccountId = auth.tokens?.account_id ?? null;
  try {
    const [, payload] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    chatgptAccountId =
      claims?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
      chatgptAccountId;
  } catch {
    // The stored account id is sufficient when the JWT payload is unavailable.
  }

  return { token, chatgptAccountId };
}

function weekday(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    timeZone: timezone,
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function toYi(tokens) {
  return Number((tokens / 100000000).toFixed(3));
}

function durationText(seconds) {
  if (seconds == null) return null;
  const minutes = Math.round(Number(seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} 小时 ${rest} 分`;
  if (hours > 0) return `${hours} 小时`;
  return `${minutes} 分`;
}

function normalize(raw) {
  const daily = (raw.stats?.daily_usage_buckets ?? [])
    .map((bucket) => ({
      date: bucket.start_date,
      weekday: weekday(bucket.start_date),
      totalTokens: Number(bucket.tokens) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let cumulative = 0;
  for (const day of daily) {
    cumulative += day.totalTokens;
    day.cumulativeTokens = cumulative;
    day.totalTokensYi = toYi(day.totalTokens);
    day.cumulativeTokensYi = toYi(cumulative);
  }

  const peakDay = daily.reduce(
    (best, day) => (day.totalTokens > (best?.totalTokens ?? -1) ? day : best),
    null,
  );
  const lifetimeTokens = Number(raw.stats?.lifetime_tokens) || cumulative;
  const activeDays = daily.filter((day) => day.totalTokens > 0).length;

  const monthly = new Map();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    const item = monthly.get(month) ?? { month, totalTokens: 0, activeDays: 0 };
    item.totalTokens += day.totalTokens;
    item.activeDays += day.totalTokens > 0 ? 1 : 0;
    monthly.set(month, item);
  }

  return {
    timezone,
    generatedAt: new Date().toISOString(),
    profile: {
      displayName: raw.profile?.display_name?.trim() || null,
      username: raw.profile?.username?.trim() || null,
    },
    source: {
      name: "Codex App Profile",
      endpoint,
      appBundle: "/Applications/Codex.app",
      profileAsset: "webview/assets/profile-queries-Bw1Ekbag.js",
      fields: {
        daily: "stats.daily_usage_buckets[].tokens",
        total: "stats.lifetime_tokens",
        peak: "stats.peak_daily_tokens",
        longestTask: "stats.longest_running_turn_sec",
        currentStreak: "stats.current_streak_days",
        longestStreak: "stats.longest_streak_days",
      },
    },
    summary: {
      lifetimeTokens,
      lifetimeTokensYi: toYi(lifetimeTokens),
      peakDailyTokens: Number(raw.stats?.peak_daily_tokens) || peakDay?.totalTokens || 0,
      peakDailyTokensYi: toYi(Number(raw.stats?.peak_daily_tokens) || peakDay?.totalTokens || 0),
      peakDate: peakDay?.date ?? null,
      longestTaskSeconds: raw.stats?.longest_running_turn_sec ?? null,
      longestTaskText: durationText(raw.stats?.longest_running_turn_sec),
      currentStreakDays: raw.stats?.current_streak_days ?? null,
      longestStreakDays: raw.stats?.longest_streak_days ?? null,
      firstDate: daily[0]?.date ?? null,
      lastDate: daily.at(-1)?.date ?? null,
      activeDays,
      averageActiveTokens: activeDays > 0 ? Math.round(lifetimeTokens / activeDays) : 0,
    },
    daily,
    monthly: [...monthly.values()].map((item) => ({
      ...item,
      totalTokensYi: toYi(item.totalTokens),
    })),
  };
}

async function fetchProfileUsage() {
  const { token, chatgptAccountId } = readAuth();
  const headers = {
    Authorization: `Bearer ${token}`,
    "OAI-Language": "zh-CN",
    originator: "Codex Desktop",
    "User-Agent": "Codex Desktop (Macintosh; Intel Mac OS X; arm64)",
  };
  if (chatgptAccountId) headers["ChatGPT-Account-Id"] = chatgptAccountId;

  const response = await fetch(endpoint, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Official profile request failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return JSON.parse(text);
}

function writeUsageData(usage, raw) {
  const usagePath = path.join(projectRoot, "usage-data.js");
  const jsonPath = path.join(projectRoot, "official-profile-usage.json");
  const stamp = usage.generatedAt.replaceAll(/[:.]/g, "-");
  const snapshotPath = path.join(projectRoot, "snapshots", `profile-usage-raw-${stamp}.json`);

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  fs.writeFileSync(jsonPath, `${JSON.stringify(usage, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    usagePath,
    `window.__CODEX_PROFILE_USAGE__ = ${JSON.stringify(usage, null, 2)};\n`,
    "utf8",
  );

  return { usagePath, jsonPath, snapshotPath };
}

const raw = await fetchProfileUsage();
const usage = normalize(raw);
const outputs = writeUsageData(usage, raw);

console.log(
  JSON.stringify(
    {
      generatedAt: usage.generatedAt,
      firstDate: usage.summary.firstDate,
      lastDate: usage.summary.lastDate,
      lifetimeTokens: usage.summary.lifetimeTokens,
      peakDate: usage.summary.peakDate,
      peakDailyTokens: usage.summary.peakDailyTokens,
      currentStreakDays: usage.summary.currentStreakDays,
      longestStreakDays: usage.summary.longestStreakDays,
      outputs,
    },
    null,
    2,
  ),
);
