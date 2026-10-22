import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (name) => {
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  });
  return exports;
}
const { dailyWorkRows, actualWorkDuration } = load("../src/lib/daily-work.ts", { "@/lib/task-time-sessions": load("../src/lib/task-time-sessions.ts") });
const hour = 3_600_000;
const record = (id, type, at, actorId = "other", detailId = "initial") => ({ id, type, at: `${at}+07:00`, actorId, detailId });
const task = (records, extras = {}, id = "task-1") => ({ id, title: id, records, assigneeIds: ["alice"], ...extras });
const summarize = (tasks, start = "2026-10-17", end = "2026-10-18", now = Date.parse("2026-10-19T00:00:00+07:00")) => dailyWorkRows(tasks, start, end, { alice: "Alice", bob: "Bob" }, now);

test("actual hours merge parallel tasks and nested detail sessions, respecting task filters", () => {
  const [row] = summarize([
    task([
      record("1", "start", "2026-10-18T08:00:00"), record("2", "end", "2026-10-18T10:00:00"),
      record("3", "start", "2026-10-18T08:30:00", "other", "second"), record("4", "end", "2026-10-18T09:00:00", "other", "second"),
    ]),
    task([record("5", "start", "2026-10-18T09:00:00"), record("6", "end", "2026-10-18T11:00:00")], {}, "task-2"),
  ]);
  assert.equal(row.duration, 4.5 * hour);
  assert.equal(row.actualDuration, 3 * hour);
  assert.equal(actualWorkDuration(row.tasks.filter((t) => t.id === "task-1")), 2 * hour);
  assert.equal(actualWorkDuration([]), 0);
});

test("marks only details whose latest event is start as running", () => {
  const [row] = summarize([task([
    record("1", "start", "2026-10-18T08:00:00"),
    record("2", "start", "2026-10-18T09:00:00", "other", "paused"),
    record("3", "pause", "2026-10-18T10:00:00", "other", "paused"),
    record("4", "start", "2026-10-18T09:00:00", "other", "ended"),
    record("5", "end", "2026-10-18T10:00:00", "other", "ended"),
  ])]);
  assert.deepEqual(row.tasks[0].details.map((d) => [d.id, d.isRunning]), [
    ["initial", true], ["paused", false], ["ended", false],
  ]);
});

test("actual hours preserve gaps, split midnight and count shared elapsed time for each employee", () => {
  const rows = summarize([task([
    record("1", "start", "2026-10-17T23:00:00"), record("2", "pause", "2026-10-18T01:00:00"),
    record("3", "start", "2026-10-18T02:00:00"),
  ], { assigneeIds: ["alice", "bob"] })], "2026-10-17", "2026-10-18", Date.parse("2026-10-18T03:00:00+07:00"));
  assert.deepEqual(rows.map((r) => r.actualDuration), [2 * hour, 2 * hour, hour, hour]);
  assert.deepEqual(rows.map((r) => r.duration), [hour, hour, hour / 2, hour / 2]);
});

test("sums detail sessions and tasks per assignee, excluding paused time", () => {
  const rows = summarize([
    task([record("1", "start", "2026-10-18T08:00:00"), record("2", "pause", "2026-10-18T09:00:00"), record("3", "start", "2026-10-18T10:00:00"), record("4", "end", "2026-10-18T11:00:00"), record("5", "start", "2026-10-18T11:00:00", "other", "second"), record("6", "end", "2026-10-18T12:00:00", "other", "second")]),
    task([record("7", "start", "2026-10-18T13:00:00"), record("8", "end", "2026-10-18T14:00:00")], {}, "task-2"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employeeName, "Alice");
  assert.equal(rows[0].duration, 4 * hour);
  assert.deepEqual(rows[0].tasks.map((t) => t.duration), [3 * hour, hour]);
  assert.deepEqual(rows[0].tasks[0].details.map((d) => [d.id, d.duration]), [["initial", 2 * hour], ["second", hour]]);
});

test("splits overnight work at Vietnam midnight and clips the selected range", () => {
  const tasks = [task([record("1", "start", "2026-10-17T23:00:00"), record("2", "end", "2026-10-18T02:00:00")])];
  assert.deepEqual(summarize(tasks).map((r) => [r.date, r.duration]), [["2026-10-18", 2 * hour], ["2026-10-17", hour]]);
  assert.equal(summarize(tasks, "2026-10-18", "2026-10-18")[0].duration, 2 * hour);
  assert.deepEqual(summarize(tasks).map((r) => r.tasks[0].details[0].duration), [2 * hour, hour]);
});

test("credits detail assignees over task assignees; ignores starter", () => {
  const rows = summarize([task(
    [
      record("1", "start", "2026-10-18T08:00:00"),
      record("2", "end", "2026-10-18T09:00:00"),
      record("3", "start", "2026-10-18T08:00:00", "other", "second"),
      record("4", "end", "2026-10-18T10:00:00", "other", "second"),
    ],
    { assigneeIds: ["bob"], detailAssignees: { second: ["alice"] } },
  )]);
  assert.deepEqual(rows.map((r) => [r.employeeName, r.duration]), [["Alice", 2 * hour], ["Bob", hour]]);
});

test("splits hours evenly when a detail has multiple assignees", () => {
  const rows = summarize([task(
    [record("1", "start", "2026-10-18T08:00:00"), record("2", "end", "2026-10-18T10:00:00")],
    { assigneeIds: ["alice", "bob"] },
  )]);
  assert.deepEqual(rows.map((r) => [r.employeeName, r.duration]), [["Alice", hour], ["Bob", hour]]);
});

test("active sessions stop at snapshot time; invalid timestamps and empty data are ignored", () => {
  const rows = summarize([task([record("bad", "start", "invalid"), record("1", "start", "2026-10-18T08:00:00")])], "2026-10-18", "2026-10-18", Date.parse("2026-10-18T08:30:00+07:00"));
  assert.equal(rows[0].duration, hour / 2);
  assert.deepEqual(summarize([task([])]), []);
});

test("sessions without assignees stay unassigned; actorId alone does not credit anyone", () => {
  const records = [record("1", "start", "2026-10-18T08:00:00"), record("2", "end", "2026-10-18T09:00:00")];
  assert.equal(summarize([task(records, { assigneeIds: [] })])[0].employeeName, "Chưa xác định nhân sự");
  assert.equal(summarize([task(records.map(({ actorId, ...rest }) => rest), { assigneeIds: ["alice"] })])[0].employeeName, "Alice");
});
