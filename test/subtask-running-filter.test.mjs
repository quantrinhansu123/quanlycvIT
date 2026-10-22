import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const timerExports = {};
new Function("exports", compile(readFileSync(new URL("../src/lib/task-time-sessions.ts", import.meta.url), "utf8")))(timerExports);
const source = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("export async function listSubtasksPage("), source.indexOf("export async function getSubtask("));
const exports = {};
new Function("exports", "runningTaskTimeSessions", "normalizeSubtaskTimeRecords", "throwDatabaseError", "pageRange", "hydrateSubtasks", "SUBTASK_LIST_SELECT", "existingDetailTimeRecords", "decodeHandover", compile(functions))(
  exports, timerExports.runningTaskTimeSessions, (value) => value ?? [],
  (error) => { if (error) throw error; },
  (page, size) => ({ from: (page - 1) * size, to: page * size - 1 }),
  (rows) => rows, "full", timerExports.existingDetailTimeRecords, (value) => value ?? {},
);
const event = (type, detailId) => ({ id: crypto.randomUUID(), type, detailId, at: new Date(0).toISOString() });

function database(rows) {
  return { from() {
    let result = rows.map((row) => ({ cap_nhat_bo_sung: [{ id: "a" }, { id: "b" }], ...row }));
    const query = {
      select() { return query; }, order() { return query; },
      in(key, ids) { result = result.filter((row) => ids.includes(row[key])); return query; },
      range(from, to) { return Promise.resolve({ data: result.slice(from, to + 1), error: null }); },
      then(resolve) { return Promise.resolve({ data: result, error: null }).then(resolve); },
    };
    return query;
  } };
}

test("running filter scans past a full batch and paginates only running tasks", async () => {
  const rows = Array.from({ length: 500 }, (_, id) => ({ id: String(id), time_records: [event("start", "a"), event("pause", "a")] }));
  rows.push(
    { id: "running-a", time_records: [event("start", "a")] },
    { id: "stopped", time_records: [event("start", "a"), event("end", "a")] },
    { id: "running-b", time_records: [event("start", "a"), event("start", "b"), event("end", "b")] },
  );
  const result = await exports.listSubtasksPage(database(rows), { runningOnly: true, page: 2, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((row) => row.id), ["running-b"]);
});

test("running filter handles empty results and pages beyond the total", async () => {
  const rows = [{ id: "running", time_records: [event("start", "a")] }];
  assert.deepEqual(await exports.listSubtasksPage(database(rows), { runningOnly: true, page: 2, pageSize: 5 }), { items: [], total: 1 });
  assert.deepEqual(await exports.listSubtasksPage(database([]), { runningOnly: true, page: 1, pageSize: 5 }), { items: [], total: 0 });
});

test("running filter excludes previously deleted details and initial detail", async () => {
  const rows = [
    { id: "deleted", cap_nhat_bo_sung: [], time_records: [event("start", "a")] },
    { id: "initial-deleted", ban_giao_noi_dung: { initialDeleted: true }, time_records: [event("start", "initial")] },
    { id: "kept", time_records: [event("start", "a")] },
  ];
  const result = await exports.listSubtasksPage(database(rows), { runningOnly: true, page: 1, pageSize: 10 });
  assert.equal(result.total, 1);
  assert.deepEqual(result.items.map((row) => row.id), ["kept"]);
});
