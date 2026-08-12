/**
 * AML/CTF Compliance admin controller
 */

const AmlMatter = require("../../models/AmlMatter");
const AmlSmr = require("../../models/AmlSmr");
const AmlTraining = require("../../models/AmlTraining");
const AmlFirmSettings = require("../../models/AmlFirmSettings");
const {
  SEAMLSS,
  OFFICER_DEFAULT,
  EVIDENCE_REQUIRED,
  DS,
  CHECKS,
  REVIEW_DAYS,
  checklistFor,
  cddState,
} = require("../../services/aml-compliance.constants");

function mapToObj(m) {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  if (typeof m.toObject === "function") return m.toObject();
  if (typeof m === "object") return { ...m };
  return {};
}

function serializeMatter(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  o.done = mapToObj(o.done);
  o.evidence = mapToObj(o.evidence);
  o.cdd = cddState({ ...o, done: o.done });
  o.checklist = checklistFor(o);
  return o;
}

function reviewDueFor(risk) {
  const days = REVIEW_DAYS[risk] || REVIEW_DAYS.medium;
  return new Date(Date.now() + days * 86400000);
}

function urlOk(v) {
  return /^https?:\/\/.+\..+/.test(String(v || "").trim());
}

// ── Meta ──

exports.getMeta = async (_req, res) => {
  return res.json({
    success: true,
    data: {
      seamlss: SEAMLSS,
      officerDefault: OFFICER_DEFAULT,
      evidenceRequired: EVIDENCE_REQUIRED,
      services: DS,
      checks: CHECKS,
      reviewDays: REVIEW_DAYS,
    },
  });
};

// ── Dashboard ──

exports.getDashboard = async (_req, res) => {
  try {
    const matters = await AmlMatter.find().sort({ openedAt: -1 }).lean();
    const list = matters.map((m) => {
      const done = mapToObj(m.done);
      const evidence = mapToObj(m.evidence);
      const base = { ...m, done, evidence };
      return {
        ...base,
        cdd: cddState(base),
        checklist: checklistFor(base),
      };
    });

    const open = list.filter((m) => !m.commenced);
    const gated = open.filter((m) => m.cdd.s !== "verified");
    const high = list.filter((m) => m.risk === "high" || m.pep);
    const overdue = list.filter((m) => m.commenced && m.reviewDue && new Date(m.reviewDue) < new Date());
    const withDropbox = list.filter((m) => m.dropbox).length;
    const smrCount = await AmlSmr.countDocuments({
      createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) },
    });
    const firm = await AmlFirmSettings.getOrCreate();
    const firmReady = ["enrolled", "officer", "program", "trainingCur", "evaluation"].every(
      (k) => firm[k]?.on
    );

    return res.json({
      success: true,
      data: {
        gated: gated.length,
        high: high.length,
        overdue: overdue.length,
        smrs: smrCount,
        evidenceVault: { linked: withDropbox, total: list.length },
        firmReady,
        gatedQueue: gated.slice(0, 40),
      },
    });
  } catch (err) {
    console.error("[aml] dashboard:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Matters ──

exports.listMatters = async (req, res) => {
  try {
    const { q, svc, risk, st } = req.query;
    let list = await AmlMatter.find().sort({ openedAt: -1 }).lean();
    list = list.map((m) => {
      const done = mapToObj(m.done);
      const evidence = mapToObj(m.evidence);
      const base = { ...m, done, evidence };
      return { ...base, cdd: cddState(base), checklist: checklistFor(base) };
    });

    if (q) {
      const qq = String(q).toLowerCase();
      list = list.filter((m) => m.client.toLowerCase().includes(qq));
    }
    if (svc) list = list.filter((m) => m.svc === svc);
    if (risk === "high") list = list.filter((m) => m.risk === "high" || m.pep);
    else if (risk) list = list.filter((m) => m.risk === risk);
    if (st === "gated") list = list.filter((m) => !m.commenced && m.cdd.s !== "verified");
    if (st === "commenced") list = list.filter((m) => m.commenced);
    if (st === "overdue")
      list = list.filter((m) => m.commenced && m.reviewDue && new Date(m.reviewDue) < new Date());

    return res.json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMatter = async (req, res) => {
  try {
    const m = await AmlMatter.findById(req.params.id).lean();
    if (!m) return res.status(404).json({ success: false, message: "Matter not found" });
    const done = mapToObj(m.done);
    const evidence = mapToObj(m.evidence);
    const base = { ...m, done, evidence };
    return res.json({
      success: true,
      data: { ...base, cdd: cddState(base), checklist: checklistFor(base) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createMatter = async (req, res) => {
  try {
    const { client, svc, risk, pep, owners } = req.body || {};
    if (!client || !String(client).trim()) {
      return res.status(400).json({ success: false, message: "Client name required" });
    }
    const r = risk && REVIEW_DAYS[risk] ? risk : "medium";
    const matter = await AmlMatter.create({
      client: String(client).trim(),
      svc: DS[svc] ? svc : "company_formation",
      risk: r,
      pep: !!pep,
      owners: Array.isArray(owners) ? owners : [],
      reviewDue: reviewDueFor(r),
      openedAt: new Date(),
      log: [
        {
          t: `Matter opened - ${DS[svc]?.label || DS.company_formation.label}`,
          at: new Date(),
        },
      ],
    });
    return res.status(201).json({ success: true, data: serializeMatter(matter) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMatter = async (req, res) => {
  try {
    const matter = await AmlMatter.findById(req.params.id);
    if (!matter) return res.status(404).json({ success: false, message: "Matter not found" });

    const body = req.body || {};
    const by = req.user?.name || OFFICER_DEFAULT;

    if (body.client !== undefined) {
      const next = String(body.client).trim();
      if (!next) return res.status(400).json({ success: false, message: "Client name required" });
      if (next !== matter.client) {
        matter.log.push({ t: `Renamed from ${matter.client} to ${next}`, at: new Date() });
        matter.client = next;
      }
    }

    if (body.svc && DS[body.svc]) matter.svc = body.svc;

    if (body.risk && REVIEW_DAYS[body.risk] && body.risk !== matter.risk) {
      matter.risk = body.risk;
      matter.reviewDue = reviewDueFor(body.risk);
      matter.log.push({
        t: `Risk re-rated to ${matter.risk} - review cycle now ${REVIEW_DAYS[matter.risk]} days`,
        at: new Date(),
      });
      const st = cddState({
        risk: matter.risk,
        pep: matter.pep,
        done: mapToObj(matter.done),
      });
      if (matter.commenced && st.s !== "verified") {
        matter.commenced = false;
        matter.log.push({
          t: "Gate re-closed - enhanced DD now required",
          at: new Date(),
        });
      }
    }

    if (body.pep !== undefined && !!body.pep !== matter.pep) {
      matter.pep = !!body.pep;
      matter.log.push({
        t: matter.pep ? "PEP flagged - enhanced DD applies" : "PEP flag removed",
        at: new Date(),
      });
      const st = cddState({
        risk: matter.risk,
        pep: matter.pep,
        done: mapToObj(matter.done),
      });
      if (matter.commenced && st.s !== "verified") {
        matter.commenced = false;
        matter.log.push({ t: "Gate re-closed", at: new Date() });
      }
    }

    if (body.reviewDue) {
      const d = new Date(body.reviewDue);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid review date" });
      }
      matter.reviewDue = d;
      matter.log.push({
        t: `Review rescheduled to ${d.toLocaleDateString("en-AU")}`,
        at: new Date(),
      });
    }

    if (body.dropbox !== undefined) {
      const link = String(body.dropbox || "").trim();
      if (link && !urlOk(link)) {
        return res.status(400).json({ success: false, message: "Enter a valid https link" });
      }
      matter.dropbox = link;
      matter.log.push({
        t: link ? "Dropbox client folder linked" : "Dropbox folder link removed",
        at: new Date(),
      });
    }

    if (Array.isArray(body.owners)) {
      matter.owners = body.owners;
    }

    // Toggle a checklist item: { toggleCheck: 'id_ind' }
    if (body.toggleCheck) {
      const cid = body.toggleCheck;
      const list = checklistFor(matter);
      if (!list.find((c) => c.id === cid)) {
        return res.status(400).json({ success: false, message: "Unknown check" });
      }
      const done = mapToObj(matter.done);
      const evidence = mapToObj(matter.evidence);
      if (!done[cid] && EVIDENCE_REQUIRED.includes(cid) && !evidence[cid]) {
        return res.status(400).json({
          success: false,
          message: "Evidence link required before ticking this check",
          code: "EVIDENCE_REQUIRED",
        });
      }
      done[cid] = !done[cid];
      matter.done = done;
      matter.markModified("done");
      if (!done[cid] && matter.commenced) matter.commenced = false;
      const label = list.find((c) => c.id === cid)?.t || cid;
      matter.log.push({
        t: `${done[cid] ? "Completed" : "Reopened"}: ${label}`,
        at: new Date(),
      });
    }

    // Set evidence: { setEvidence: { id, url } }
    if (body.setEvidence?.id) {
      const cid = body.setEvidence.id;
      const url = String(body.setEvidence.url || "").trim();
      if (!urlOk(url)) {
        return res.status(400).json({ success: false, message: "Enter a valid https link" });
      }
      const evidence = mapToObj(matter.evidence);
      const existed = !!evidence[cid];
      evidence[cid] = { url, at: new Date(), by };
      matter.evidence = evidence;
      matter.markModified("evidence");
      const list = checklistFor(matter);
      const label = list.find((c) => c.id === cid)?.t || cid;
      matter.log.push({
        t: `${existed ? "Evidence link updated" : "Evidence filed"} for: ${label}`,
        at: new Date(),
      });
    }

    if (body.removeEvidence) {
      const cid = body.removeEvidence;
      const evidence = mapToObj(matter.evidence);
      delete evidence[cid];
      matter.evidence = evidence;
      matter.markModified("evidence");
      const done = mapToObj(matter.done);
      if (done[cid]) {
        done[cid] = false;
        matter.done = done;
        matter.markModified("done");
        if (matter.commenced) matter.commenced = false;
      }
      matter.log.push({ t: "Evidence link removed - check reopened", at: new Date() });
    }

    if (body.commence === true) {
      const st = cddState({
        risk: matter.risk,
        pep: matter.pep,
        done: mapToObj(matter.done),
      });
      if (st.s !== "verified") {
        return res.status(400).json({
          success: false,
          message: "CDD incomplete — cannot commence",
        });
      }
      if (!matter.commenced) {
        matter.commenced = true;
        matter.log.push({
          t: "CDD complete - service commenced, pack filed (7yr retention)",
          at: new Date(),
        });
      }
    }

    if (body.addNote) {
      matter.notes.push({ t: String(body.addNote).trim(), at: new Date() });
    }

    // Owner helpers
    if (body.addOwner?.n) {
      matter.owners.push({
        n: String(body.addOwner.n).trim(),
        verified: false,
        screened: false,
        link: "",
      });
      const done = mapToObj(matter.done);
      done.ubo = false;
      done.screen = false;
      matter.done = done;
      matter.markModified("done");
      if (matter.commenced) {
        matter.commenced = false;
        matter.log.push({
          t: "Gate re-closed - beneficial owners changed",
          at: new Date(),
        });
      }
      matter.log.push({
        t: `Beneficial owner added: ${body.addOwner.n} - UBO and screening checks reopened`,
        at: new Date(),
      });
    }

    if (body.verifyOwner != null) {
      const i = Number(body.verifyOwner.index);
      const o = matter.owners[i];
      if (!o) return res.status(400).json({ success: false, message: "Owner not found" });
      const link = String(body.verifyOwner.link || "").trim();
      if (!urlOk(link)) {
        return res.status(400).json({ success: false, message: "A valid report link is required" });
      }
      o.verified = true;
      o.screened = true;
      o.link = link;
      matter.log.push({
        t: `${o.n} verified and screened - report linked`,
        at: new Date(),
      });
      if (matter.owners.every((x) => x.verified && x.screened)) {
        const done = mapToObj(matter.done);
        const evidence = mapToObj(matter.evidence);
        done.ubo = true;
        done.screen = true;
        matter.done = done;
        matter.markModified("done");
        if (!evidence.ubo) evidence.ubo = { url: link, at: new Date(), by };
        if (!evidence.screen) evidence.screen = { url: link, at: new Date(), by };
        matter.evidence = evidence;
        matter.markModified("evidence");
      }
    }

    if (body.updateOwner != null) {
      const i = Number(body.updateOwner.index);
      const o = matter.owners[i];
      if (!o) return res.status(400).json({ success: false, message: "Owner not found" });
      if (body.updateOwner.n) o.n = String(body.updateOwner.n).trim();
      if (body.updateOwner.link !== undefined) {
        const link = String(body.updateOwner.link || "").trim();
        if (link && !urlOk(link)) {
          return res.status(400).json({ success: false, message: "Invalid link" });
        }
        o.link = link;
      }
    }

    if (body.removeOwner != null) {
      const i = Number(body.removeOwner);
      if (matter.owners[i]) {
        matter.log.push({ t: `Owner removed: ${matter.owners[i].n}`, at: new Date() });
        matter.owners.splice(i, 1);
        const done = mapToObj(matter.done);
        done.ubo = false;
        done.screen = false;
        matter.done = done;
        matter.markModified("done");
        if (matter.commenced) {
          matter.commenced = false;
          matter.log.push({
            t: "Gate re-closed - beneficial owners changed",
            at: new Date(),
          });
        }
      }
    }

    await matter.save();
    return res.json({ success: true, data: serializeMatter(matter) });
  } catch (err) {
    console.error("[aml] updateMatter:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportMatters = async (req, res) => {
  try {
    const list = await AmlMatter.find().sort({ openedAt: -1 }).lean();
    const rows = [
      ["client", "service", "risk", "pep", "cdd_done", "cdd_total", "status", "dropbox", "next_review"],
    ];
    for (const m of list) {
      const done = mapToObj(m.done);
      const st = cddState({ ...m, done });
      rows.push([
        m.client,
        DS[m.svc]?.label || m.svc,
        m.risk,
        m.pep ? "yes" : "no",
        st.done,
        st.total,
        m.commenced ? "commenced" : "gated",
        m.dropbox || "",
        m.reviewDue ? new Date(m.reviewDue).toLocaleDateString("en-AU") : "",
      ]);
    }
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aml-matter-register-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportCddPack = async (req, res) => {
  try {
    const m = await AmlMatter.findById(req.params.id).lean();
    if (!m) return res.status(404).json({ success: false, message: "Not found" });
    const done = mapToObj(m.done);
    const evidence = mapToObj(m.evidence);
    const list = checklistFor({ ...m, done });
    const rows = [
      [
        "client",
        "service",
        "risk",
        "pep",
        "check",
        "status",
        "evidence_link",
        "filed_by",
        "dropbox_folder",
      ],
    ];
    for (const c of list) {
      rows.push([
        m.client,
        DS[m.svc]?.label || m.svc,
        m.risk,
        m.pep ? "yes" : "no",
        c.t,
        done[c.id] ? "done" : "outstanding",
        evidence[c.id]?.url || "",
        evidence[c.id]?.by || "",
        m.dropbox || "",
      ]);
    }
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const slug = m.client.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cdd-pack-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── SMRs ──

exports.listSmrs = async (req, res) => {
  try {
    const isFull =
      ["admin", "owner"].includes(req.user?.role) || !!req.user?.amlOfficer;
    const list = await AmlSmr.find().sort({ createdAt: -1 }).lean();
    const data = list.map((s) => ({
      _id: s._id,
      seq: s.seq,
      reason: s.reason,
      lodged: s.lodged,
      createdAt: s.createdAt,
      clientRef: isFull ? s.clientRef || "" : "(restricted)",
    }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createSmr = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10) {
      return res.status(400).json({ success: false, message: "Describe the facts" });
    }
    const last = await AmlSmr.findOne().sort({ seq: -1 }).select("seq").lean();
    const seq = (last?.seq || 0) + 1;
    const doc = await AmlSmr.create({
      reason,
      lodged: false,
      clientRef: req.body?.clientRef || "",
      matterId: req.body?.matterId || null,
      createdBy: req.user?._id || null,
      seq,
    });
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSmr = async (req, res) => {
  try {
    const doc = await AmlSmr.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    if (req.body?.lodged === true) doc.lodged = true;
    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Training ──

exports.listTraining = async (_req, res) => {
  try {
    const data = await AmlTraining.find().sort({ at: -1 }).lean();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createTraining = async (req, res) => {
  try {
    const who = String(req.body?.who || "").trim();
    const moduleName = String(req.body?.module || "").trim();
    if (!who || !moduleName) {
      return res.status(400).json({ success: false, message: "Who and module are required" });
    }
    const status = req.body?.status === "done" ? "done" : "scheduled";
    const doc = await AmlTraining.create({ who, module: moduleName, status, at: new Date() });
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateTraining = async (req, res) => {
  try {
    const doc = await AmlTraining.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    if (req.body?.status === "done" || req.body?.status === "scheduled") {
      doc.status = req.body.status;
      doc.at = new Date();
    }
    if (req.body?.who) doc.who = String(req.body.who).trim();
    if (req.body?.module) doc.module = String(req.body.module).trim(); // field name on schema
    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Firm ──

exports.getFirm = async (_req, res) => {
  try {
    const firm = await AmlFirmSettings.getOrCreate();
    return res.json({ success: true, data: firm });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateFirm = async (req, res) => {
  try {
    const firm = await AmlFirmSettings.getOrCreate();
    const key = req.body?.key;
    const keys = ["enrolled", "officer", "program", "trainingCur", "evaluation"];
    if (!keys.includes(key)) {
      return res.status(400).json({ success: false, message: "Invalid firm key" });
    }
    const item = firm[key];
    if (req.body?.on !== undefined) {
      item.on = !!req.body.on;
      item.at = item.on ? new Date() : null;
    }
    if (req.body?.d) item.d = String(req.body.d);
    firm.markModified(key);
    await firm.save();
    return res.json({ success: true, data: firm });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
