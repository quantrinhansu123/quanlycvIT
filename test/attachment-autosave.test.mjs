import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/tasks/InlineTaskAttachmentEditor.tsx", import.meta.url), "utf8");
const start = source.indexOf("  const persist = useCallback(");
const end = source.indexOf("  const hasIncompleteLink", start);
const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup() {
  let finish;
  const state = { saving: false, filesDirty: true, linksDirty: true, saved: false, links: [{ url: "https://example.com", description: "up2024mail" }] };
  const revision = { current: 1 };
  const save = new Function("useCallback", "draftRevisionRef", "onSave", "setSaving", "setDraftFiles", "setDraftLinks", "setFilesDirty", "setLinksDirty", "showSaved", `${compiled}; return persist;`)(
    (callback) => callback, revision, () => new Promise((resolve) => { finish = resolve; }),
    (value) => { state.saving = value; },
    () => assert.fail("Saving must not replace the live file draft"),
    () => assert.fail("Saving must not replace the live link draft"),
    (value) => { state.filesDirty = value; },
    (value) => { state.linksDirty = value; },
    () => { state.saved = true; },
  );
  return { state, revision, save, finish: () => finish() };
}

test("a delayed response preserves newer typing and leaves it pending for the next autosave", async () => {
  const { state, revision, save, finish } = setup();
  const first = save({ files: [], links: state.links, images: [] });
  state.links = [{ ...state.links[0], description: "up2024mail nội dung mới " }];
  revision.current += 1;
  finish();
  await first;
  assert.equal(state.links[0].description, "up2024mail nội dung mới ");
  assert.equal(state.linksDirty, true);
  assert.equal(state.filesDirty, true);
  assert.equal(state.saved, false);
  assert.equal(state.saving, false);
  const second = save({ files: [], links: state.links, images: [] });
  finish();
  await second;
  assert.equal(state.linksDirty, false);
  assert.equal(state.filesDirty, false);
  assert.equal(state.saved, true);
});

test("acknowledging an unchanged draft does not trim the active input", async () => {
  const { state, save, finish } = setup();
  state.links[0].description = "Nội dung đang gõ ";
  const pending = save({ files: [], links: [{ ...state.links[0], description: "Nội dung đang gõ" }], images: [] });
  finish();
  await pending;
  assert.equal(state.links[0].description, "Nội dung đang gõ ");
  assert.equal(state.linksDirty, false);
  assert.equal(state.saved, true);
});
