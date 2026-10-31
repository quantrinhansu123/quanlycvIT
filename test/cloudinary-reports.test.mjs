import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/cloudinary-reports.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function setup(respond, env = { CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret" }) {
  const exports = {};
  const calls = [];
  class ApiException extends Error { constructor(message, status) { super(message); this.status = status; } }
  new Function("exports", "require", "fetch", "process", outputText)(exports, (name) => {
    if (name === "node:crypto") return crypto;
    if (name === "@/lib/api/response") return { ApiException };
    throw new Error(`Unexpected import: ${name}`);
  }, async (url, options) => {
    calls.push({ url, form: options.body });
    return respond(url, options.body);
  }, { env });
  return { ...exports, calls };
}

for (const [name, type, resource] of [["photo.png", "image/png", "image"], ["report.PDF", "application/pdf", "raw"], ["archive.zip", "application/zip", "raw"]]) {
  test(`uploads ${name} to Cloudinary with a signed ${resource} request`, async () => {
    const api = setup((url, form) => {
      assert.ok(url.endsWith(`/${resource}/upload`));
      const publicId = form.get("public_id");
      assert.ok(publicId.startsWith("quan-ly-nhan-su/reports/task-1/"));
      if (resource === "raw") assert.ok(publicId.endsWith(name.slice(name.lastIndexOf(".")).toLowerCase()));
      const signature = crypto.createHash("sha1").update(`public_id=${publicId}&timestamp=${form.get("timestamp")}test-secret`).digest("hex");
      assert.equal(form.get("signature"), signature);
      assert.equal(form.get("api_secret"), null);
      assert.equal(form.get("file").name, name);
      return Response.json({ public_id: publicId, secure_url: "https://res.cloudinary.com/test-cloud/asset" });
    });
    assert.equal(await api.uploadReportFile("task-1", new File(["content"], name, { type })), "https://res.cloudinary.com/test-cloud/asset");
  });
}

test("missing configuration and upload failures propagate to report rollback", async () => {
  const file = new File(["content"], "photo.png", { type: "image/png" });
  const missing = setup(() => { throw new Error("Must not call network"); }, {});
  await assert.rejects(missing.uploadReportFile("task", file), { status: 503 });
  const failed = setup(() => Response.json({ error: {} }, { status: 500 }));
  await assert.rejects(failed.uploadReportFile("task", file), { status: 502 });
});

test("cleanup removes image extensions but preserves raw extensions and ignores unrelated assets", async () => {
  const api = setup(() => Response.json({ result: "ok" }));
  const base = "https://res.cloudinary.com/test-cloud";
  await api.removeReportFile(`${base}/image/upload/v123/quan-ly-nhan-su/reports/task/photo.png`);
  await api.removeReportFile(`${base}/raw/upload/v123/quan-ly-nhan-su/reports/task/doc.pdf`);
  assert.equal(api.calls[0].form.get("public_id"), "quan-ly-nhan-su/reports/task/photo");
  assert.equal(api.calls[1].form.get("public_id"), "quan-ly-nhan-su/reports/task/doc.pdf");
  assert.ok(api.calls[1].url.endsWith("/raw/destroy"));
  assert.equal(api.calls[0].form.get("invalidate"), "true");
  await api.removeReportFile(`${base}/image/upload/v123/quan-ly-nhan-su/avatars/photo.png`);
  await api.removeReportFile("https://res.cloudinary.com/other-cloud/image/upload/v123/quan-ly-nhan-su/reports/task/photo.png");
  await api.removeReportFile("https://example.com/file.pdf");
  assert.equal(api.calls.length, 2);
});

test("cleanup tolerates missing assets but reports Cloudinary failures", async () => {
  const url = "https://res.cloudinary.com/test-cloud/raw/upload/v123/quan-ly-nhan-su/reports/task/doc.pdf";
  await setup(() => Response.json({ result: "not found" })).removeReportFile(url);
  await assert.rejects(setup(() => Response.json({ error: {} }, { status: 500 })).removeReportFile(url), { status: 502 });
});
