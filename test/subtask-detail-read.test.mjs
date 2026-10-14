import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
const constants = source.slice(source.indexOf("const SUBTASK_SELECT ="), source.indexOf("/** Danh sách cần chi tiết"));
const functions = source.slice(source.indexOf("export async function getSubtask("), source.indexOf("export async function updateSubtaskPromptItems("));
const compiled = ts.transpileModule(`${constants}\n${functions}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

for (const name of ["getSubtask", "getSubtaskDetailPageData"]) {
  test(`${name} retains saved detail titles when the issues column is missing`, async () => {
    const exports = {};
    new Function("exports", "ACCOUNT_SELECT", "WORK_TASK_DIRECTORY_SELECT", "throwDatabaseError", "hydrateSubtasks", "mapWorkTaskDirectoryItem", compiled)(
      exports, "id", "id", (error) => { if (error) throw error; }, (rows) => rows, (row) => row,
    );
    const saved = JSON.stringify({ v: 2, titles: { initial: "Edited title" }, rows: { initial: { status: "accepted" } } });
    const supabase = { from() {
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        eq() { return query; },
        async maybeSingle() {
          if (columns.includes("van_de_giai_phap")) return { data: null, error: { code: "42703" } };
          return { data: { id: "task", ...(columns.includes("ban_giao_noi_dung") ? { ban_giao_noi_dung: saved, ban_giao_link_anh: "" } : {}) }, error: null };
        },
      };
      return query;
    } };
    const result = await exports[name](supabase, "task");
    const subtask = name === "getSubtask" ? result : result.subtask;
    assert.equal(subtask.ban_giao_noi_dung, saved);
    assert.equal(subtask.ban_giao_link_anh, "");
  });
}
