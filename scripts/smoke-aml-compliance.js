/**
 * AML/CTF Compliance smoke test — unit helpers + Mongo CRUD + controller flows.
 * Usage: node scripts/smoke-aml-compliance.js
 * Cleans up docs tagged with client prefix __AML_SMOKE__
 */
require("dotenv").config();
const mongoose = require("mongoose");
const {
  checklistFor,
  cddState,
  DS,
  CHECKS,
  REVIEW_DAYS,
  EVIDENCE_REQUIRED,
} = require("../src/services/aml-compliance.constants");
const AmlMatter = require("../src/models/AmlMatter");
const AmlSmr = require("../src/models/AmlSmr");
const AmlTraining = require("../src/models/AmlTraining");
const AmlFirmSettings = require("../src/models/AmlFirmSettings");
const ctrl = require("../src/controllers/admin/aml-compliance.controller");

const PREFIX = "__AML_SMOKE__";
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

function unitTests() {
  console.log("\n== Unit: CDD helpers ==");
  const med = { risk: "medium", pep: false, done: {} };
  assert(checklistFor(med).length === CHECKS.base.length + CHECKS.post.length, "medium checklist = base+post");
  const high = { risk: "high", pep: false, done: {} };
  assert(
    checklistFor(high).length === CHECKS.base.length + CHECKS.edd.length + CHECKS.post.length,
    "high checklist includes EDD"
  );
  const pep = { risk: "low", pep: true, done: {} };
  assert(checklistFor(pep).some((c) => c.id === "sof"), "PEP adds sof");
  assert(cddState(med).s === "not_started", "empty = not_started");
  const partial = {
    risk: "medium",
    pep: false,
    done: { id_ind: true, id_ent: true },
  };
  assert(cddState(partial).s === "in_progress", "partial = in_progress");
  const allIds = checklistFor(med).map((c) => c.id);
  const doneAll = Object.fromEntries(allIds.map((id) => [id, true]));
  assert(cddState({ ...med, done: doneAll }).s === "verified", "all done = verified");
  assert(Object.keys(DS).length === 6, "6 designated services");
  assert(REVIEW_DAYS.high === 90 && REVIEW_DAYS.medium === 365 && REVIEW_DAYS.low === 730, "review days");
  assert(EVIDENCE_REQUIRED.includes("sof"), "sof needs evidence");
}

async function mongoFlow() {
  console.log("\n== Mongo + controller flow ==");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(process.env.MONGODB_URI);

  // cleanup leftovers
  await AmlMatter.deleteMany({ client: new RegExp(`^${PREFIX}`) });
  await AmlSmr.deleteMany({ reason: new RegExp(PREFIX) });
  await AmlTraining.deleteMany({ who: new RegExp(PREFIX) });

  const adminReq = { user: { role: "admin", name: "Smoke Tester", _id: new mongoose.Types.ObjectId() } };
  const staffReq = { user: { role: "staff", name: "Staff User", _id: new mongoose.Types.ObjectId() } };

  // meta
  let res = await call(ctrl.getMeta, {});
  assert(res.body?.success && res.body.data.services.company_formation, "GET /meta");

  // firm
  res = await call(ctrl.getFirm, {});
  assert(res.body?.success && res.body.data.key === "firm", "GET /firm creates singleton");
  const firmBefore = { ...res.body.data.enrolled };
  res = await call(ctrl.updateFirm, { body: { key: "enrolled", on: true } });
  assert(res.body?.data?.enrolled?.on === true, "PATCH firm enrolled on");
  await call(ctrl.updateFirm, { body: { key: "enrolled", on: !!firmBefore.on } });

  // create matter
  res = await call(ctrl.createMatter, {
    ...adminReq,
    body: { client: `${PREFIX} Grewal Group`, svc: "trust_setup", risk: "medium" },
  });
  assert(res.statusCode === 201 && res.body?.data?._id, "POST matter");
  const matterId = String(res.body.data._id);
  assert(res.body.data.cdd.s === "not_started", "new matter CDD not_started");
  assert(res.body.data.commenced === false, "new matter gated");
  assert(typeof res.body.data.done === "object" && !Array.isArray(res.body.data.done), "done is plain object in JSON");

  // validation
  res = await call(ctrl.createMatter, { body: { client: "  " } });
  assert(res.statusCode === 400, "reject empty client");

  // commence blocked
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { commence: true },
  });
  assert(res.statusCode === 400, "cannot commence incomplete CDD");

  // evidence required before tick
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { toggleCheck: "id_ind" },
  });
  assert(res.statusCode === 400 && res.body?.code === "EVIDENCE_REQUIRED", "evidence required for id_ind");

  // set evidence + toggle for all medium checks
  const checks = checklistFor({ risk: "medium", pep: false });
  for (const c of checks) {
    if (EVIDENCE_REQUIRED.includes(c.id)) {
      res = await call(ctrl.updateMatter, {
        ...adminReq,
        params: { id: matterId },
        body: { setEvidence: { id: c.id, url: "https://seamlss.app/report/1" } },
      });
      assert(res.statusCode === 200 && res.body?.data?.evidence?.[c.id]?.url, `evidence ${c.id}`);
    }
    res = await call(ctrl.updateMatter, {
      ...adminReq,
      params: { id: matterId },
      body: { toggleCheck: c.id },
    });
    assert(res.statusCode === 200 && res.body?.data?.done?.[c.id] === true, `toggle ${c.id}`);
  }
  assert(res.body.data.cdd.s === "verified", "CDD verified after all checks");

  // commence
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { commence: true },
  });
  assert(res.statusCode === 200 && res.body.data.commenced === true, "commence after verified");

  // raise to high → gate reopens
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { risk: "high" },
  });
  assert(res.body.data.commenced === false, "high risk re-closes gate");
  assert(res.body.data.checklist.some((c) => c.id === "sof"), "EDD checks appear");

  // complete EDD and recommence
  for (const c of checklistFor({ risk: "high", pep: false })) {
    if (!res.body.data.done?.[c.id]) {
      if (EVIDENCE_REQUIRED.includes(c.id)) {
        await call(ctrl.updateMatter, {
          ...adminReq,
          params: { id: matterId },
          body: { setEvidence: { id: c.id, url: "https://dropbox.com/s/edd" } },
        });
      }
      res = await call(ctrl.updateMatter, {
        ...adminReq,
        params: { id: matterId },
        body: { toggleCheck: c.id },
      });
    }
  }
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { commence: true },
  });
  assert(res.body.data.commenced === true, "recommence after EDD");

  // owners
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { addOwner: { n: "Baljit Grewal" } },
  });
  assert(res.body.data.owners.length >= 1 && res.body.data.done.ubo === false, "add owner reopens ubo");
  assert(res.body.data.commenced === false, "add owner re-closes commence gate");
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { verifyOwner: { index: 0, link: "https://seamlss.app/ubo" } },
  });
  assert(res.body.data.owners[0].verified && res.body.data.done.ubo, "verify owner marks ubo");

  // re-complete ubo/screen evidence path already set; ensure remaining checks + recommence
  for (const c of checklistFor({ risk: "high", pep: false })) {
    if (!res.body.data.done?.[c.id]) {
      if (EVIDENCE_REQUIRED.includes(c.id) && !res.body.data.evidence?.[c.id]) {
        await call(ctrl.updateMatter, {
          ...adminReq,
          params: { id: matterId },
          body: { setEvidence: { id: c.id, url: "https://dropbox.com/s/owner" } },
        });
      }
      res = await call(ctrl.updateMatter, {
        ...adminReq,
        params: { id: matterId },
        body: { toggleCheck: c.id },
      });
    }
  }
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { commence: true },
  });
  assert(res.body.data.commenced === true, "recommence after owner verify");

  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { removeOwner: 0 },
  });
  assert(res.body.data.commenced === false && res.body.data.done.ubo === false, "remove owner re-closes gate");

  // dropbox validation
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { dropbox: "not-a-url" },
  });
  assert(res.statusCode === 400, "reject bad dropbox url");
  res = await call(ctrl.updateMatter, {
    ...adminReq,
    params: { id: matterId },
    body: { dropbox: "https://www.dropbox.com/home/AML" },
  });
  assert(res.body.data.dropbox.includes("dropbox"), "link dropbox");

  // list + filters
  res = await call(ctrl.listMatters, { query: { q: PREFIX, risk: "high" } });
  assert(res.body.data.some((m) => String(m._id) === matterId), "list filter q+risk");

  // dashboard
  res = await call(ctrl.getDashboard, {});
  assert(res.body?.success && typeof res.body.data.gated === "number", "dashboard tiles");

  // export
  res = await call(ctrl.exportMatters, {});
  assert(typeof res.body === "string" && res.body.includes("client"), "CSV register export");
  res = await call(ctrl.exportCddPack, { params: { id: matterId } });
  assert(typeof res.body === "string" && res.body.includes("evidence_link"), "CDD pack CSV");

  // SMR
  res = await call(ctrl.createSmr, {
    ...adminReq,
    body: { reason: `${PREFIX} third party insisting on cash settlement funds`, clientRef: "Grewal", matterId },
  });
  assert(res.statusCode === 201 && res.body.data.seq >= 1, "create SMR");
  const smrId = res.body.data._id;
  res = await call(ctrl.listSmrs, staffReq);
  const staffRow = res.body.data.find((s) => String(s._id) === String(smrId));
  assert(staffRow?.clientRef === "(restricted)", "staff SMR client restricted");
  res = await call(ctrl.listSmrs, adminReq);
  const adminRow = res.body.data.find((s) => String(s._id) === String(smrId));
  assert(adminRow?.clientRef === "Grewal", "admin sees clientRef");
  res = await call(ctrl.updateSmr, { params: { id: smrId }, body: { lodged: true } });
  assert(res.body.data.lodged === true, "lodge SMR");

  // training
  res = await call(ctrl.createTraining, {
    body: { who: `${PREFIX} Geelong staff`, module: "CDD walkthrough", status: "scheduled" },
  });
  assert(res.statusCode === 201, "create training");
  const trainId = res.body.data._id;
  res = await call(ctrl.updateTraining, { params: { id: trainId }, body: { status: "done" } });
  assert(res.body.data.status === "done", "mark training done");
  res = await call(ctrl.listTraining, {});
  assert(res.body.data.some((t) => String(t._id) === String(trainId)), "list training");

  // cleanup
  await AmlMatter.deleteMany({ client: new RegExp(`^${PREFIX}`) });
  await AmlSmr.deleteMany({ reason: new RegExp(PREFIX) });
  await AmlTraining.deleteMany({ who: new RegExp(PREFIX) });
  console.log("\n  (cleaned smoke docs)");

  await mongoose.disconnect();
}

(async () => {
  try {
    unitTests();
    await mongoFlow();
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
