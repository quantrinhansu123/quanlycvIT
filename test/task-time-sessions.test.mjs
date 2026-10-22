import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/task-time-sessions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const exports = {};
new Function("exports", outputText)(exports);
const { taskTimeSessions, formatSessionDuration, runningTaskTimeSessions } = exports;
const record = (id, type, seconds, detailId = "initial") => ({ id, type, at: new Date(seconds * 1000).toISOString(), detailId });

test("deleted details cannot keep running or contribute work after reload", () => {
  const records = [record("1", "start", 0), record("2", "start", 1, "deleted"), record("3", "start", 2, "kept")];
  const filtered = exports.existingDetailTimeRecords(records, [{ id: "kept" }], true);
  assert.deepEqual(filtered.map((r) => r.id), ["3"]);
  assert.equal(runningTaskTimeSessions(filtered, 10000)[0].duration, 8000);
  assert.deepEqual(exports.existingDetailTimeRecords(records, [], true), []);
  const legacy = { id: "legacy", type: "end", at: new Date(0).toISOString() };
  assert.deepEqual(exports.existingDetailTimeRecords([legacy], [], true), [legacy]);
});

test("each start creates one session and paused time is excluded", () => {
  const sessions = taskTimeSessions([
    record("1", "start", 0), record("2", "pause", 60),
    record("3", "start", 3600), record("4", "end", 3720),
  ], 9999999);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((s) => s.duration), [60000, 120000]);
  assert.deepEqual(sessions.map((s) => s.status), ["pause", "end"]);
});

test("an active session continues from persisted start after reload", () => {
  assert.equal(taskTimeSessions([record("1", "start", 10)], 25000)[0].duration, 15000);
});

test("ending a legacy paused session does not count the pause", () => {
  const sessions = taskTimeSessions([record("1", "start", 0), record("2", "pause", 5), record("3", "end", 50)], 90000);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].duration, 5000);
});

test("interleaved details remain independent", () => {
  const records = [record("1", "start", 0, "a"), record("2", "start", 10, "b"), record("3", "end", 20, "a")];
  assert.equal(taskTimeSessions(records.filter((r) => r.detailId === "a"), 30000)[0].duration, 20000);
  assert.equal(taskTimeSessions(records.filter((r) => r.detailId === "b"), 30000)[0].duration, 20000);
  assert.equal(taskTimeSessions(records.filter((r) => r.detailId === "b"), 30000)[0].status, "start");
});

test("empty histories and sub-minute durations are displayed correctly", () => {
  assert.deepEqual(taskTimeSessions([], 0), []);
  assert.equal(formatSessionDuration(5000), "0:00:05");
  assert.equal(formatSessionDuration(3661000), "1:01:01");
});

test("tab timer counts only running details and survives reload", () => {
  const records = [
    record("1", "start", 0, "a"), record("2", "start", 10, "b"),
    record("3", "pause", 20, "a"), record("4", "start", 25, "c"),
  ];
  const sessions = runningTaskTimeSessions(records, 30000);
  assert.deepEqual(sessions.map((session) => session.duration), [20000, 5000]);
  assert.equal(runningTaskTimeSessions(records, 35000).reduce((sum, s) => sum + s.duration, 0), 35000);
  assert.deepEqual(runningTaskTimeSessions([
    ...records, record("5", "end", 31, "b"), record("6", "pause", 32, "c"),
  ], 40000), []);
  assert.deepEqual(runningTaskTimeSessions([], 40000), []);
});

test("saving sends the detail ID to the atomic RPC and preserves IDs on readback", async () => {
  const dataSource = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
  const start = dataSource.indexOf("export async function appendSubtaskTimeRecord(");
  const end = dataSource.indexOf("export async function updateSubtaskHandover(", start);
  const compiled = ts.transpileModule(dataSource.slice(start, end).replace("export ", ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const save = new Function("throwDatabaseError", "ApiException", `${compiled}; return appendSubtaskTimeRecord;`)(
    (error) => { if (error) throw error; }, Error,
  );
  const old = { id: "old", type: "end", at: new Date(0).toISOString() };
  const current = record("new", "start", 10, "detail-b");
  const result = await save({ async rpc(name, args) {
    assert.equal(name, "append_task_detail_time_record");
    assert.deepEqual(args, { p_task_id: "task", p_type: "start", p_actor_id: "actor", p_detail_id: "detail-b" });
    return { data: [old, current], error: null };
  } }, "task", "start", "actor", "detail-b");
  assert.deepEqual(result, [old, current]);
});
