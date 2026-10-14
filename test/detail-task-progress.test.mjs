import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/handover.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const exports = {};
new Function("exports", outputText)(exports);
const { detailTaskProgressPercent } = exports;

test("all detail statuses survive persistence without losing personnel or notes", () => {
  for (const status of ["pending", "testing", "tested", "acceptance", "rework", "cancelled", "accepted"]) {
    const row = { status, note: "Keep note", imageUrl: "", assigneeIds: ["person-a", "person-b"] };
    const encoded = exports.encodeHandoverContent({ text: "", rows: { initial: row }, statuses: {} });
    const decoded = exports.decodeHandoverContent(encoded);
    assert.deepEqual(decoded.rows.initial, row);
    assert.equal(detailTaskProgressPercent([], decoded.rows), status === "accepted" ? 100 : 0);
  }
});

test("detail titles persist independently from content and acceptance notes", () => {
  const handover = {
    text: "Acceptance note", statuses: {},
    rows: { initial: { imageUrl: "", status: "pending", note: "Separate note" } },
    titles: { initial: "New title", second: "Second title" },
  };
  const decoded = exports.decodeHandoverContent(exports.encodeHandoverContent(handover));
  assert.deepEqual(decoded.titles, handover.titles);
  assert.equal(decoded.text, "Acceptance note");
  assert.equal(decoded.rows.initial.note, "Separate note");
});

test("existing handover records remain readable without detail titles", () => {
  const decoded = exports.decodeHandoverContent(JSON.stringify({ v: 2, text: "Old note", rows: {}, statuses: {} }));
  assert.deepEqual(decoded.titles, {});
  assert.equal(decoded.text, "Old note");
});

test("unfinished detail is 0 percent; completed detail is 100 percent", () => {
  assert.equal(detailTaskProgressPercent([], {}), 0);
  assert.equal(detailTaskProgressPercent([], { initial: { status: "accepted" } }), 100);
});

test("only completed details count toward progress", () => {
  assert.equal(detailTaskProgressPercent(["second", "third"], {
    initial: { status: "accepted" }, second: { status: "pending" }, third: { status: "accepted" },
  }), 67);
});

test("adding an unfinished detail reduces progress", () => {
  assert.equal(detailTaskProgressPercent(["new"], { initial: { status: "accepted" } }), 50);
});

test("obsolete acceptance rows do not affect progress", () => {
  assert.equal(detailTaskProgressPercent([], { removed: { status: "accepted" } }), 0);
});

test("deleting initial detail removes it from the progress denominator", () => {
  assert.equal(detailTaskProgressPercent(["remaining"], { remaining: { status: "accepted" } }, false), 100);
  assert.equal(detailTaskProgressPercent([], {}, false), 0);
});

test("initial deletion marker survives persistence", () => {
  const encoded = exports.encodeHandoverContent({ text: "", rows: {}, statuses: {}, initialDeleted: true });
  assert.equal(exports.decodeHandoverContent(encoded).initialDeleted, true);
});
