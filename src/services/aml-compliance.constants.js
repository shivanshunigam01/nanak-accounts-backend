/**
 * AML/CTF Compliance — shared constants (served via GET /meta)
 */

const SEAMLSS = "https://seamlss.app/Dashboard";
const OFFICER_DEFAULT = "Puneet Singh";
const EVIDENCE_REQUIRED = ["id_ind", "id_ent", "ubo", "screen", "sof"];

const DS = {
  company_formation: { label: "Company formation" },
  trust_setup: { label: "Trust establishment" },
  smsf_setup: { label: "SMSF establishment" },
  nominee_director: { label: "Nominee director / shareholder" },
  registered_office: { label: "Registered office address" },
  restructure: { label: "Restructure with property transfer" },
};

const CHECKS = {
  base: [
    {
      id: "id_ind",
      t: "Identify and verify each individual",
      d: "Name, DOB and residential address verified - Seamlss electronic verification or certified documents.",
      req: true,
    },
    {
      id: "id_ent",
      t: "Verify any existing entity customer",
      d: "ASIC / ABN lookup, registration details match instructions.",
      req: true,
    },
    {
      id: "ubo",
      t: "Identify beneficial owners (25%+ or control)",
      d: "Every 25%+ owner or controller identified and verified. Trusts: settlor, trustees, appointor, named beneficiaries.",
      req: true,
    },
    {
      id: "screen",
      t: "PEP and sanctions screening",
      d: "Every individual and entity screened. Record the result even when clear.",
      req: true,
    },
    {
      id: "risk",
      t: "Rate the ML/TF risk of this matter",
      d: "Customer type, structure complexity, geography, channel. Record rating and reasoning.",
      req: true,
    },
    {
      id: "purpose",
      t: "Record purpose and nature of the relationship",
      d: "Why this structure, what it will do, expected activity. Written down.",
      req: true,
    },
  ],
  edd: [
    {
      id: "sof",
      t: "Source of funds and wealth",
      d: "Where the money settling or capitalising this structure comes from, with evidence.",
      edd: true,
    },
    {
      id: "approve",
      t: "Senior approval to proceed",
      d: "Compliance officer signs off on a high-risk or PEP customer before the service is provided.",
      edd: true,
    },
  ],
  post: [
    {
      id: "records",
      t: "File the CDD pack - 7 year retention",
      d: "All records stored against the client. Retained 7 years after the relationship ends.",
      req: true,
    },
  ],
};

const REVIEW_DAYS = { high: 90, medium: 365, low: 730 };

function checklistFor(matter) {
  let list = CHECKS.base.slice();
  if (matter.risk === "high" || matter.pep) list = list.concat(CHECKS.edd);
  return list.concat(CHECKS.post);
}

function cddState(matter) {
  const list = checklistFor(matter);
  const doneMap = matter.done || {};
  const done = list.filter((c) => doneMap[c.id]).length;
  if (done === 0) return { s: "not_started", done, total: list.length };
  if (done < list.length) return { s: "in_progress", done, total: list.length };
  return { s: "verified", done, total: list.length };
}

module.exports = {
  SEAMLSS,
  OFFICER_DEFAULT,
  EVIDENCE_REQUIRED,
  DS,
  CHECKS,
  REVIEW_DAYS,
  checklistFor,
  cddState,
};
