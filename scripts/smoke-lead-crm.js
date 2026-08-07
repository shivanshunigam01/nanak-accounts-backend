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
    assert(leadCrm.mapSource({ source: "newsletter_signup" }) === "newsletter", "map newsletter");
    assert(leadCrm.mapSource({ channel: "website_popup", source: "free_15min_call" }) === "popup", "map popup");
    assert(leadCrm.mapSource({ source: "tax_check_quiz" }) === "tax_check", "map tax_check");
    assert(leadCrm.mapSource({ channel: "blog", source: "free_15min_call" }) === "blog_card", "map blog_card");
    assert(leadCrm.mapSource({ explicit: "income_tax_calculator", source: "x" }) === "income_tax_calculator", "map calculator");
    assert(leadCrm.mapSource({ source: "pay-calculator" }) === "pay_calculator", "map pay calculator");

    console.log("\n== Mongo capture ==");
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing");
    await mongoose.connect(process.env.MONGODB_URI);

    const Lead = require("../src/models/Lead");
    await Lead.deleteMany({ email: new RegExp(PREFIX, "i") });
    await Lead.deleteMany({ name: new RegExp(`^${PREFIX}`) });

    const channels = [
      {
        email: `${PREFIX.toLowerCase()}-nl@smoke.test`,
        body: {
          lead: { email: `${PREFIX.toLowerCase()}-nl@smoke.test`, lead_score: 20 },
          touchpoint: { channel: "website_footer", source: "newsletter_signup", page: "/newsletter" },
          source: "newsletter",
        },
        expect: "newsletter",
      },
      {
        email: `${PREFIX.toLowerCase()}-pop@smoke.test`,
        body: {
          lead: {
            email: `${PREFIX.toLowerCase()}-pop@smoke.test`,
            mobile: "0411111111",
            callback_requested: true,
            service_interest: "individual_tax",
          },
          touchpoint: { channel: "website_popup", source: "free_15min_call", page: "/" },
        },
        expect: "popup",
      },
      {
        email: `${PREFIX.toLowerCase()}-tc@smoke.test`,
        body: {
          lead: {
            email: `${PREFIX.toLowerCase()}-tc@smoke.test`,
            service_interest: "business_tax",
            quiz_answers: { profile: "sole_trader" },
          },
          touchpoint: { channel: "website_footer", source: "tax_check_quiz", page: "/footer" },
        },
        expect: "tax_check",
      },
      {
        email: `${PREFIX.toLowerCase()}-blog@smoke.test`,
        body: {
          lead: { email: `${PREFIX.toLowerCase()}-blog@smoke.test`, service_interest: "individual_tax" },
          touchpoint: { channel: "blog", source: "free_15min_call", page: "/blog/x", article_title: "Smoke" },
          source: "blog_card",
        },
        expect: "blog_card",
      },
      {
        email: `${PREFIX.toLowerCase()}-calc@smoke.test`,
        body: {
          lead: {
            name: `${PREFIX} Calc`,
            email: `${PREFIX.toLowerCase()}-calc@smoke.test`,
            source: "income_tax_calculator",
          },
          touchpoint: { source: "income_tax_calculator", page: "/income-tax-calculator" },
        },
        expect: "income_tax_calculator",
      },
      {
        email: `${PREFIX.toLowerCase()}-pay@smoke.test`,
        body: {
          lead: {
            name: `${PREFIX} Pay`,
            email: `${PREFIX.toLowerCase()}-pay@smoke.test`,
            source: "pay_calculator",
            calculator_snapshot: { gross: 95000, take_home: 70000 },
          },
          touchpoint: { channel: "calculator", source: "pay_calculator", page: "/pay-calculator" },
          source: "pay_calculator",
        },
        expect: "pay_calculator",
      },
    ];

    for (const ch of channels) {
      const result = await leadCrm.capture(ch.body);
      assert(result?.lead?._id, `capture ${ch.expect}`);
      assert(result.lead.source === ch.expect, `${ch.expect} source stored`);
    }

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
        query: { tab: "everything", search: PREFIX.toLowerCase(), limit: 50 },
      },
      res
    );
    const rows = res.body?.data || [];
    assert(rows.length >= channels.length, `admin list finds all channel leads (${rows.length})`);

    await Lead.deleteMany({ email: new RegExp(PREFIX, "i") });
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
