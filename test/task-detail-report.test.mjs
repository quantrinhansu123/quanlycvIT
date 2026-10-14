import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/task-detail-report.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
new Function("exports", outputText)(exports);
const task = {
  description: "Initial", assignees: [{ id: "a", name: "An" }],
  updates: [{ id: "test", description: "Test" }, { id: "review", description: "Review" }, { id: "test2", description: "Test 2" }],
  handover: { titles: { review: "Custom title" }, rows: {
    initial: { status: "accepted" }, test: { status: "testing" },
    review: { status: "acceptance", assigneeIds: ["a"], note: "Check" }, test2: { status: "testing" },
  } },
};

test("acceptance is first and matching statuses appear together in original order", () => {
  const groups = exports.groupTaskDetailsForReport(task);
  assert.deepEqual(groups.map((g) => g.value), ["acceptance", "testing", "accepted"]);
  assert.deepEqual(groups[1].entries.map((e) => e.id), ["test", "test2"]);
  assert.equal(groups[0].entries[0].title, "Custom title");
  assert.equal(groups[0].entries[0].personnel, "An");
  assert.equal(groups[0].entries[0].note, "Check");
});

test("deleted initial is excluded and legacy entries default to unfinished", () => {
  const groups = exports.groupTaskDetailsForReport({ ...task, handover: { initialDeleted: true, rows: {} } });
  assert.deepEqual(groups.map((g) => g.value), ["pending"]);
  assert.equal(groups[0].entries.length, 3);
  assert.equal(exports.groupTaskDetailsForReport({ ...task, updates: [], handover: { initialDeleted: true, rows: {} } }).length, 0);
});
