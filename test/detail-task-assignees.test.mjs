import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/handover.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const handover = {};
new Function("exports", compiled)(handover);

test("multiple personnel survive saving and reloading each Task detail independently", () => {
  const original = {
    text: "", statuses: {}, rows: {
      initial: { imageUrl: "", status: "pending", note: "", assigneeIds: ["a", "b"] },
      second: { imageUrl: "", status: "accepted", note: "Done", assigneeIds: ["c"] },
    },
  };
  const decoded = handover.decodeHandoverContent(handover.encodeHandoverContent(original));
  assert.deepEqual(decoded.rows, original.rows);
});

test("personnel can be unchecked and legacy details still load", () => {
  const rows = handover.normalizeAcceptanceRows({
    initial: { status: "pending", assigneeIds: [] },
    legacy: { status: "accepted" },
    invalid: { assigneeIds: ["a", "a", null, 42, ""] },
  });
  assert.deepEqual(rows.initial.assigneeIds, []);
  assert.equal(rows.legacy.assigneeIds, undefined);
  assert.deepEqual(rows.invalid.assigneeIds, ["a"]);
});
