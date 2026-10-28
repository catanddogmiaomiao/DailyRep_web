import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
test("private API: login, records, protected photo, XLSX export, delete, logout", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dailyrep-test-"));
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "0",
      DATA_DIR: dir,
      OWNER_EMAIL: "test@example.com",
      OWNER_PASSWORD: "test-only-password-123",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (b) => (output += b));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("startup timeout " + output)),
      15000,
    );
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("server exited " + code + " " + output));
    });
    child.stdout.on("data", (b) => {
      const m = String(b).match(/listening (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
  const url = "http://127.0.0.1:" + port + "/api";
  let token = "";
  const call = (p, init = {}) =>
    fetch(url + p, {
      ...init,
      headers: {
        ...init.headers,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
  try {
    assert.equal((await call("/records")).status, 401);
    assert.equal((await call("/export")).status, 401);
    assert.equal((await call("/photos/" + "a".repeat(32))).status, 401);
    assert.equal(
      (
        await call("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            password: "wrong",
          }),
        })
      ).status,
      401,
    );
    const login = await call("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "test-only-password-123",
      }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    token = (await login.json()).token;
    const form = new FormData();
    for (const [k, v] of Object.entries({
      sport: "running",
      value: "7.25",
      duration: "2520",
      occurredAt: "2025-10-22T07:30:00+08:00",
    }))
      form.set(k, v);
    form.set(
      "photo",
      new Blob(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        { type: "image/png" },
      ),
      "test.png",
    );
    const created = await call("/records", { method: "POST", body: form });
    assert.equal(created.status, 201);
    const record = await created.json();
    assert.equal(record.value, 7.25);
    assert.equal((await (await call("/records")).json()).length, 1);
    assert.equal(
      (await call("/photos/" + record.photo)).headers.get("content-type"),
      "image/png",
    );
    const exported = await call("/export?sport=running");
    assert.equal(exported.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));
    assert.equal(book.worksheets[0].getCell("C2").value, 7.25);
    for (const [sport, subtype, label] of [["swimming", "freestyle", "自由泳"], ["abs", "abwheel", "腹肌轮"]]) {
      const typed = new FormData();
      for (const [key, value] of Object.entries({sport, subtype, value: "10", duration: "120", occurredAt: "2026-10-01"})) typed.set(key, value);
      const response = await call("/records", {method: "POST", body: typed});
      assert.equal(response.status, 201);
      const saved = await response.json();
      assert.equal(saved.subtype, subtype);
      const exportedType = await call(`/export?sport=${sport}&subtype=${subtype}`);
      const typeBook = new ExcelJS.Workbook();
      await typeBook.xlsx.load(Buffer.from(await exportedType.arrayBuffer()));
      assert.equal(typeBook.worksheets[0].rowCount, 2);
      assert.equal(typeBook.worksheets[0].getCell("F2").value, label);
      assert.equal((await call("/records/" + saved.id, {method: "DELETE"})).status, 204);
    }
    const mixedForm = new FormData();
    const details = [{subtype:'breaststroke',value:400,duration:240},{subtype:'butterfly',value:100,duration:60},{subtype:'freestyle',value:1000,duration:600}];
    for (const [key,value] of Object.entries({sport:'swimming',details:JSON.stringify(details),occurredAt:'2026-10-20'})) mixedForm.set(key,value);
    const mixedResponse = await call('/records',{method:'POST',body:mixedForm});
    assert.equal(mixedResponse.status,201);
    const mixed = await mixedResponse.json(); assert.equal(mixed.value,1500); assert.equal(mixed.duration,900);
    const mixedRows = await (await call('/records')).json();
    assert.equal(mixedRows.filter(r=>r.sport==='swimming').length,1); assert.deepEqual(mixedRows.find(r=>r.id===mixed.id).details,details);
    const mixedBook = new ExcelJS.Workbook(); await mixedBook.xlsx.load(Buffer.from(await (await call('/export?sport=swimming&subtype=freestyle')).arrayBuffer()));
    assert.equal(mixedBook.worksheets[0].rowCount,2);assert.equal(mixedBook.worksheets[0].getCell('C2').value,1000);assert.equal(mixedBook.worksheets[0].getCell('G2').value,mixed.id);
    assert.equal((await call('/records/'+mixed.id,{method:'DELETE'})).status,204);
    const bad = new FormData();
    bad.set("sport", "running");
    bad.set("value", "0");
    bad.set("duration", "1");
    bad.set("occurredAt", "2025-01-01");
    assert.equal(
      (await call("/records", { method: "POST", body: bad })).status,
      400,
    );
    assert.equal(
      (await call("/records/" + record.id, { method: "DELETE" })).status,
      204,
    );
    assert.equal((await call("/photos/" + record.photo)).status, 404);
    assert.equal((await (await call("/records")).json()).length, 0);
    assert.equal((await call("/logout", { method: "POST" })).status, 204);
    assert.equal((await call("/records")).status, 401);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
