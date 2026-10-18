import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/subtask-list-update.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { updateVisibleSubtaskPage } = exports;

test("selecting detail personnel preserves the visible Task despite differing list status", () => {
  const original = { id: "task", status: "todo", title: "Task" };
  const other = { id: "other", status: "todo" };
  const updated = { ...original, status: "inProgress", handover: { rows: { initial: { assigneeIds: ["person"] } } } };
  const result = updateVisibleSubtaskPage({ items: [original, other], total: 12 }, updated, ["todo"], false);
  assert.deepEqual(result.items, [updated, other]);
  assert.equal(result.total, 12);
});

test("explicit acceptance still removes a Task that no longer matches the status filter", () => {
  const result = updateVisibleSubtaskPage({ items: [{ id: "task", status: "todo" }], total: 1 }, { id: "task", status: "inProgress" }, ["todo"], true);
  assert.deepEqual(result, { items: [], total: 0 });
});

test("updating a Task on another page preserves the current page", () => {
  const page = { items: [{ id: "other", status: "todo" }], total: 12 };
  assert.equal(updateVisibleSubtaskPage(page, { id: "task", status: "todo" }, [], false), page);
});
