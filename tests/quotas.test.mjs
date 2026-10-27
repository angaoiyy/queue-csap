import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/quotas.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { validateQuotaPeriods, quotaStatus, canReserve, availabilityMessage, formatQuotaTime } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const period = (start = "08:00", end = "12:00", capacity = 50) => ({ start, end, capacity });
const window = (capacity, activeCount = 0, nextStart = null) => ({ id: "window-1", name: "Window 1", enabled: capacity !== null, periods: [], capacity, activeCount, nextStart });
const availability = (...windows) => ({ date: "2026-10-27", windows });

test("staff-entered positive integer limits and adjacent periods are accepted", () => {
  assert.equal(validateQuotaPeriods(true, [period("13:00", "17:00", 73), period()]), null);
  assert.equal(validateQuotaPeriods(true, [period(), period("12:00", "16:00", 1)]), null);
  assert.equal(validateQuotaPeriods(false, []), null);
  assert.match(validateQuotaPeriods(true, []), /at least one/);
});

test("invalid or overlapping periods and capacities are rejected", () => {
  for (const capacity of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.match(validateQuotaPeriods(true, [period("08:00", "12:00", capacity)]), /positive whole/);
  }
  for (const [start, end] of [["12:00", "08:00"], ["08:00", "08:00"], ["25:00", "26:00"], ["", "12:00"], ["8:00", "12:00"]]) {
    assert.match(validateQuotaPeriods(true, [period(start, end)]), /valid start/);
  }
  assert.match(validateQuotaPeriods(true, [period(), period("11:59", "15:00")]), /overlap/);
});

test("active backlog, full, closed, and unlimited windows determine eligibility", () => {
  assert.equal(quotaStatus(window(null, 100)), "unlimited");
  assert.equal(quotaStatus(window(0)), "closed");
  assert.equal(quotaStatus(window(50, 49)), "available");
  assert.equal(quotaStatus(window(50, 50)), "full");
  assert.equal(quotaStatus(window(10, 50)), "full");
  assert.equal(canReserve(availability()), false);
  assert.equal(canReserve(availability(window(0), window(5, 5))), false);
  assert.equal(canReserve(availability(window(5, 5), window(null))), true);
  assert.equal(canReserve(availability(window(5, 5), window(3, 2))), true);
});

test("student messages distinguish full windows, closed periods, and no windows", () => {
  assert.equal(availabilityMessage(availability(window(3, 2))), null);
  assert.match(availabilityMessage(availability()), /No service windows/);
  assert.match(availabilityMessage(availability(window(3, 3))), /tickets are completed/);
  assert.match(availabilityMessage(availability(window(0))), /outside today's configured periods/);
  assert.match(availabilityMessage(availability(window(0, 0, "14:00"), window(0, 0, "13:00"))), /1:00 PM \(Philippine time\)/);
  assert.equal(formatQuotaTime("00:00"), "12:00 AM");
  assert.equal(formatQuotaTime("12:00"), "12:00 PM");
});
