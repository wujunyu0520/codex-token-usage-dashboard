import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyLedgerRecord,
  pickDayForLedger,
  readPreviousLedgerHash,
  selectLedgerDates,
} from "./daily-ledger.mjs";

test("buildDailyLedgerRecord creates a chained, tamper-evident daily observation", () => {
  const stableDay = {
    date: "2026-05-28",
    inputTokens: 10,
    cachedInputTokens: 20,
    outputTokens: 3,
    reasoningOutputTokens: 2,
    totalTokens: 33,
    costUSD: 0.12,
    models: {
      "gpt-5.5": { totalTokens: 33 },
    },
  };
  const rawDay = {
    ...stableDay,
    totalTokens: 28,
    costUSD: 0.1,
  };

  const record = buildDailyLedgerRecord({
    date: "2026-05-28",
    timezone: "Asia/Shanghai",
    recordedAt: "2026-05-28T12:00:00.000Z",
    stableDay,
    rawDay,
    previousHash: "abc123",
    stableGeneratedAt: "2026-05-28T11:59:00.000Z",
    rawGeneratedAt: "2026-05-28T11:58:00.000Z",
  });

  assert.equal(record.recordType, "codex-token-daily-observation");
  assert.equal(record.previousHash, "abc123");
  assert.equal(record.stable.totalTokens, 33);
  assert.equal(record.raw.totalTokens, 28);
  assert.equal(record.primaryModel, "gpt-5.5");
  assert.match(record.hash, /^[a-f0-9]{64}$/);

  const changed = {
    ...record,
    stable: {
      ...record.stable,
      totalTokens: 34,
    },
  };
  assert.notEqual(record.hash, buildDailyLedgerRecord({
    date: changed.date,
    timezone: changed.timezone,
    recordedAt: changed.recordedAt,
    stableDay: changed.stable,
    rawDay: changed.raw,
    previousHash: changed.previousHash,
    stableGeneratedAt: changed.stableGeneratedAt,
    rawGeneratedAt: changed.rawGeneratedAt,
  }).hash);
});

test("pickDayForLedger returns a zero day when the date is absent", () => {
  assert.deepEqual(pickDayForLedger([], "2026-05-28"), {
    date: "2026-05-28",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    models: {},
  });
});

test("readPreviousLedgerHash reads the final hash without modifying the ledger", async () => {
  const dir = await mkdtemp(join(tmpdir(), "daily-ledger-"));
  const ledgerPath = join(dir, "daily-ledger.jsonl");
  try {
    await writeFile(
      ledgerPath,
      `${JSON.stringify({ hash: "first" })}\n${JSON.stringify({ hash: "second" })}\n`,
      "utf8",
    );
    assert.equal(await readPreviousLedgerHash(ledgerPath), "second");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("selectLedgerDates records today and the most recent prior day by default", () => {
  assert.deepEqual(
    selectLedgerDates(
      [
        { date: "2026-05-26" },
        { date: "2026-05-27" },
        { date: "2026-05-28" },
      ],
      "2026-05-28",
      2,
    ),
    ["2026-05-27", "2026-05-28"],
  );

  assert.deepEqual(selectLedgerDates([], "2026-05-28", 2), ["2026-05-28"]);
});
