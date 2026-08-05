/**
 * Lead CRM smoke — load modules + capture/list round-trip.
 * Usage: node scripts/smoke-lead-crm.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const PREFIX = "__LEAD_SMOKE__";
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

(async () => {
  try {
    console.log("\n== Load ==");
    const modules = require("../src/config/modules");
    assert(modules.MODULE_KEYS.includes("lead-crm"), "lead-crm in MODULE_KEYS");
    assert(modules.ROLE_DEFAULT_MODULES.manager.includes("lead-crm"), "manager default");
    assert(modules.ROLE_DEFAULT_MODULES.staff.includes("lead-crm"), "staff default");

    require("../src/models/Lead");
    require("../src/models/LeadCrmSettings");
    require("../src/models/LeadActivity");
    require("../src/services/lead-crm.service");
    require("../src/services/lead-mailer");
    require("../src/services/lead-crm.worker");
    require("../src/controllers/leads.controller");
    require("../src/routes/leads.routes");
    require("../src/routes/admin/leads.routes");
    assert(true, "models/routes/worker load");

    const leadCrm = require("../src/services/lead-crm.service");
    assert(typeof leadCrm.capture === "function", "capture export");

    console.log("\n== Mongo capture ==");
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing");
    await mongoose.connect(process.env.MONGODB_URI);

    const Lead = require("../src/models/Lead");
    await Lead.deleteMany({ email: new RegExp(PREFIX, "i") });
    await Lead.deleteMany({ name: new RegExp(`^${PREFIX}`) });

    const email = `${PREFIX.toLowerCase()}@smoke.test`;
    const result = await leadCrm.capture({
      lead: {
        name: `${PREFIX} Test Lead`,
        email,
        phone: "0400000000",
        source: "income_tax_calculator",
        message: "Smoke test capture",
      },
      touchpoint: { source: "income_tax_calculator", page: "/smoke" },
    });

    assert(result?.lead?._id, "capture returns lead");
    const found = await Lead.findById(result.lead._id).lean();
    assert(!!found, "lead persisted in Mongo");
    assert(found.email === email.toLowerCase(), "email normalized");

    const ctrl = require("../src/controllers/leads.controller");
    const res = {
      statusCode: 200,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    await ctrl.list(
      {
        user: { role: "admin", _id: new mongoose.Types.ObjectId(), name: "Smoke" },
        query: { search: PREFIX },
      },
      res
    );
    const rows = res.body?.data || [];
    assert(
      Array.isArray(rows) && rows.some((l) => String(l._id) === String(found._id)),
      "admin list finds smoke lead"
    );

    await Lead.deleteMany({ email: email.toLowerCase() });
    await Lead.deleteMany({ name: new RegExp(`^${PREFIX}`) });
    console.log("\n  (cleaned smoke leads)");

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
