import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function setup() {
  const slots = [];
  let cursor = 0;
  const writes = [];
  const react = {
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
  };
  const jsx = (type, props) => ({ type, props });
  const source = readFileSync(new URL("../src/components/subtasks/SubtaskPromptPanel.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
    if (name.endsWith("FeedbackProvider")) return { useFeedback: () => ({ notify() {} }) };
    if (name.endsWith("ImagePreviewDialog")) return { ImagePreviewDialog: "preview" };
    if (name.endsWith("utils")) return { cn: (...parts) => parts.filter(Boolean).join(" ") };
    if (name.endsWith("errors")) return { getErrorMessage: String };
    if (name.endsWith("subtask-service")) return { subtaskService: { async updatePromptItems(id, items) { writes.push(items); return items; } } };
    throw Error(name);
  });
  const items = [
    { id: "a", taskTitle: "detail-a", content: "Prompt A", imageUrls: [], status: "unprocessed" },
    { id: "b", taskTitle: "detail-b", content: "Prompt B", imageUrls: [], status: "unprocessed" },
  ];
  const render = () => {
    cursor = 0;
    return exports.SubtaskPromptPanel({ subtaskId: "task", initialItems: items, initialDataLoaded: true,
      detailId: "detail-a", taskDetailOptions: [{ value: "detail-a", label: "Detail A" }] });
  };
  return { render, writes };
}

function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test("detail popup shows only matching prompts and adding assigns the same detail", () => {
  const { render } = setup();
  let nodes = elements(render());
  assert.deepEqual(nodes.filter((n) => n.type === "textarea").map((n) => n.props.value), ["Prompt A"]);
  nodes.find((n) => n.type === "button" && n.props.children?.includes("Thêm Prompt")).props.onClick();
  nodes = elements(render());
  assert.deepEqual(nodes.filter((n) => n.type === "select" && n.props["aria-label"]?.startsWith("Chi tiết Task")).map((n) => n.props.value), ["detail-a", "detail-a"]);
});

test("editing a scoped prompt preserves prompts belonging to other details", async () => {
  const { render, writes } = setup();
  const textarea = elements(render()).find((n) => n.type === "textarea");
  textarea.props.onChange({ target: { value: "Edited A" }, currentTarget: { style: {}, scrollHeight: 40 } });
  textarea.props.onBlur();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].map((item) => [item.taskTitle, item.content]), [["detail-a", "Edited A"], ["detail-b", "Prompt B"]]);
});
