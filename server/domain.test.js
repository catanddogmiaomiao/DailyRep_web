import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "./domain.js";
import { report, movePeriod } from "../src/stats.js";
test("valid backdated running record and fractional distance", () => {
  const r = validateRecord({
    sport: "running",
    value: "7.25",
    duration: "2520",
    occurredAt: "2025-10-22T07:30:00+08:00",
  });
  assert.equal(r.value, 7.25);
  assert.equal(r.occurredAt, "2025-10-21T23:30:00.000Z");
});
test("reject invalid, future, fractional repetitions, and zero duration", () => {
  const good = {
    sport: "pushups",
    value: 20,
    duration: 60,
    occurredAt: "2025-01-01",
  };
  for (const patch of [
    { sport: "other" },
    { value: -1 },
    { value: "NaN" },
    { value: 1.5 },
    { duration: 0 },
    { duration: 1.2 },
    { occurredAt: "invalid" },
    { occurredAt: "2999-01-01" },
  ])
    assert.throws(() => validateRecord({ ...good, ...patch }));
});
test("week starts Monday and includes only selected sport and period", () => {
  const rows = [
    {
      sport: "running",
      value: 5,
      duration: 60,
      occurredAt: new Date(2026, 9, 19, 7).toISOString(),
    },
    {
      sport: "running",
      value: 7,
      duration: 90,
      occurredAt: new Date(2026, 9, 25, 23).toISOString(),
    },
    {
      sport: "running",
      value: 99,
      duration: 60,
      occurredAt: new Date(2026, 9, 26, 0).toISOString(),
    },
    {
      sport: "swimming",
      value: 1000,
      duration: 60,
      occurredAt: new Date(2026, 9, 20).toISOString(),
    },
  ];
  const r = report(rows, "running", "week", new Date(2026, 9, 22));
  assert.equal(r.start.getDay(), 1);
  assert.equal(r.total, 12);
  assert.equal(r.duration, 150);
  assert.equal(r.bars[0].value, 5);
  assert.equal(r.bars[6].value, 7);
});
test("leap month, empty states and year aggregation", () => {
  assert.equal(
    report([], "abs", "month", new Date(2024, 1, 10)).bars.length,
    29,
  );
  const record = {
    sport: "abs",
    value: 30,
    duration: 1800,
    occurredAt: new Date(2026, 11, 31, 15).toISOString(),
  };
  const year = report([record], "abs", "year", new Date(2026, 5, 1));
  assert.equal(year.bars.length, 12);
  assert.equal(year.bars[11].value, 30);
  assert.equal(report([], "running", "week").total, 0);
});
test("month navigation does not skip February from January 31", () => {
  assert.equal(movePeriod(new Date(2026, 0, 31), "month", 1).getMonth(), 1);
});
