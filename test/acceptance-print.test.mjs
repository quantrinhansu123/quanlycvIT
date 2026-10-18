import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/task-detail-pdf.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});

function setup(imageUrl = "", failImage = false) {
  let definition;
  let printedWindow;
  const entry = { title: "Nghiệm thu màn hình", description: "Kiểm tra chức năng", status: "Hoàn thành", note: "Đạt", imageUrl };
  const exports = {};
  const require = (name) => name.endsWith("pdf-export") ? {
    loadPdfMake: async () => ({ createPdf(value) { definition = value; return { print(_, target) { printedWindow = target; } }; } }),
  } : { selectedAcceptanceDetails: () => [entry] };
  class MockImage {
    naturalWidth = 1800;
    naturalHeight = 1200;
    set src(value) { if (value) queueMicrotask(() => failImage ? this.onerror() : this.onload()); }
  }
  class MockReader {
    result = "data:image/png;base64,logo";
    readAsDataURL() { this.onload(); }
  }
  const browser = { Image: MockImage, setTimeout, clearTimeout };
  const document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => "data:image/png;base64,evidence" }) };
  new Function("exports", "require", "window", "document", "fetch", "FileReader", outputText)(
    exports, require, browser, document, async () => ({ ok: true, blob: async () => ({}) }), MockReader,
  );
  const target = {};
  return {
    print: () => exports.printAcceptanceMinutes({ id: "12345678", title: "Task", assignees: [] }, ["initial"], target),
    getDefinition: () => definition,
    assertWindow: () => assert.equal(printedWindow, target),
  };
}

test("acceptance PDF embeds evidence in its own column and preserves the print window", async () => {
  const fixture = setup("https://example.com/evidence.webp");
  await fixture.print();
  const table = fixture.getDefinition().content.find((item) => item.table?.headerRows === 1).table;
  assert.equal(table.body[0][2].text, "ẢNH NGHIỆM THU");
  assert.equal(table.body[1][1].stack[1].text, "Kiểm tra chức năng");
  assert.equal(table.body[1][2].image, "data:image/png;base64,evidence");
  assert.deepEqual(table.body[1][2].fit, [190, 260]);
  fixture.assertWindow();
});

test("acceptance PDF explicitly labels details with no image", async () => {
  const fixture = setup();
  await fixture.print();
  const table = fixture.getDefinition().content.find((item) => item.table?.headerRows === 1).table;
  assert.equal(table.body[1][2].text, "Chưa có ảnh nghiệm thu");
});

test("failed evidence loading prevents silently printing an incomplete report", async () => {
  const fixture = setup("https://example.com/missing.png", true);
  await assert.rejects(fixture.print, /Không tải được ảnh nghiệm thu/);
  assert.equal(fixture.getDefinition(), undefined);
});
