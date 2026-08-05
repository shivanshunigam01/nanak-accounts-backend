/**
 * Firm Library smoke test — constants + Mongo CRUD + audited stream path.
 * Usage: node scripts/smoke-firm-library.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const FirmLibraryDoc = require("../src/models/FirmLibraryDoc");
const FirmLibraryAudit = require("../src/models/FirmLibraryAudit");
const ctrl = require("../src/controllers/admin/firm-library.controller");
const { UPLOAD_DIR } = require("../src/services/firm-library.storage");
const { CATS } = require("../src/services/firm-library.constants");

const PREFIX = "__FL_SMOKE__";
let failed = 0;
let passed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log("  ✓", msg);
  } else {
    failed += 1;
    console.error("  ✗", msg);
  }
}

function mockRes() {
  const r = {
    statusCode: 200,
    body: null,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    sendFile(p) {
      this.body = { sentFile: p };
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
  return r;
}

async function call(fn, req = {}) {
  const res = mockRes();
  await fn(req, res);
  return res;
}

(async () => {
  try {
    console.log("\n== Unit ==");
    assert(Object.keys(CATS).length === 5, "5 categories");
    assert(fs.existsSync(UPLOAD_DIR), "upload dir exists");

    await mongoose.connect(process.env.MONGODB_URI);
    await FirmLibraryDoc.deleteMany({ name: new RegExp(`^${PREFIX}`) });
    await FirmLibraryAudit.deleteMany({ docName: new RegExp(PREFIX) });

    const admin = {
      user: { _id: new mongoose.Types.ObjectId(), name: "Smoke Owner", role: "owner" },
    };
    const staff = {
      user: { _id: new mongoose.Types.ObjectId(), name: "Smoke Staff", role: "staff" },
    };

    console.log("\n== Meta / firm ==");
    let res = await call(ctrl.getMeta, admin);
    assert(res.body?.success && res.body.data.canManage === true, "owner canManage");
    res = await call(ctrl.getMeta, staff);
    assert(res.body?.data?.canManage === false, "staff cannot manage");

    const tmpName = `${Date.now()}-smoke.txt`;
    const tmpPath = path.join(UPLOAD_DIR, tmpName);
    fs.writeFileSync(tmpPath, "Firm Library smoke policy content");

    const fakeFile = {
      originalname: "smoke-policy.txt",
      size: 32,
      mimetype: "text/plain",
      filename: tmpName,
    };

    console.log("\n== CRUD ==");
    res = await call(ctrl.createDoc, {
      ...admin,
      body: { name: `${PREFIX} CDD Policy`, cat: "pol", desc: "Smoke test policy" },
      file: fakeFile,
    });
    assert(res.statusCode === 201 && res.body?.data?._id, "create doc");
    const id = String(res.body.data._id);

    res = await call(ctrl.listDocs, { ...staff, query: {} });
    assert(res.body.data.some((d) => String(d._id) === id), "staff can list");

    res = await call(ctrl.acknowledge, { ...staff, params: { id } });
    assert(res.body.data.acknowledged === true, "staff ack");

    res = await call(ctrl.suggest, {
      ...staff,
      params: { id },
      body: { text: "Please update rates for FY26" },
    });
    assert(res.statusCode === 200, "suggest update");

    res = await call(ctrl.streamFile, {
      ...staff,
      params: { id },
      query: { action: "open" },
    });
    assert(res.body?.sentFile && fs.existsSync(res.body.sentFile), "audited open streams file");

    const audits = await FirmLibraryAudit.find({ docId: id }).lean();
    assert(
      audits.some((a) => a.action === "opened") && audits.some((a) => a.action === "acknowledged"),
      "audit rows written"
    );

    res = await call(ctrl.updateDoc, {
      ...admin,
      params: { id },
      body: { status: "archived" },
    });
    assert(res.body.data.status === "archived", "archive");

    res = await call(ctrl.listDocs, { ...staff, query: {} });
    assert(!res.body.data.some((d) => String(d._id) === id), "staff hide archived");

    res = await call(ctrl.deleteDoc, { ...admin, params: { id } });
    assert(res.statusCode === 200, "permanent delete");

    await FirmLibraryDoc.deleteMany({ name: new RegExp(`^${PREFIX}`) });
    await FirmLibraryAudit.deleteMany({ docName: new RegExp(PREFIX) });
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

    await mongoose.disconnect();
  } catch (err) {
    console.error("\nFATAL:", err);
    failed += 1;
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
  console.log(`\n== Result: ${passed} passed, ${failed} failed ==`);
  process.exit(failed ? 1 : 0);
})();
