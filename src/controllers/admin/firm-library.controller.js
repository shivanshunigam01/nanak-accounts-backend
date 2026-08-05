/**
 * Firm Library admin controller
 */

const fs = require("fs");
const FirmLibraryDoc = require("../../models/FirmLibraryDoc");
const FirmLibraryAudit = require("../../models/FirmLibraryAudit");
const User = require("../../models/User");
const { CATS, STATUSES } = require("../../services/firm-library.constants");
const {
  absolutePath,
  deleteFile,
  fileMetaFromMulter,
} = require("../../services/firm-library.storage");

function isOwnerRole(user) {
  return user && ["admin", "owner"].includes(user.role);
}

function who(user) {
  return user?.name || "Unknown";
}

async function writeAudit({ user, action, doc, detail }) {
  await FirmLibraryAudit.create({
    who: who(user),
    userId: user?._id || null,
    action,
    docId: doc?._id || null,
    docName: doc?.name || "-",
    detail: detail || "",
  });
}

function serializeDoc(doc, { staffCount = 0, viewerId = null } = {}) {
  const o = doc.toObject ? doc.toObject() : doc;
  const currentVer = o.currentVersion || o.versions?.[o.versions.length - 1]?.v || "v1";
  const acksForVer = (o.acks || []).filter((a) => a.version === currentVer);
  const acknowledged = viewerId
    ? acksForVer.some((a) => String(a.userId) === String(viewerId))
    : false;
  return {
    ...o,
    ackCount: acksForVer.length,
    staffCount,
    acknowledged,
    versionCount: (o.versions || []).length,
  };
}

async function staffDenominator() {
  return User.countDocuments({ active: { $ne: false } });
}

// ── Meta / stats ──

exports.getMeta = async (req, res) => {
  const staffCount = await staffDenominator();
  return res.json({
    success: true,
    data: {
      categories: CATS,
      statuses: STATUSES,
      staffCount,
      canManage: isOwnerRole(req.user),
    },
  });
};

exports.getStats = async (req, res) => {
  try {
    const filter = isOwnerRole(req.user) ? {} : { status: { $ne: "archived" } };
    const docs = await FirmLibraryDoc.find(filter).select("opens downloads versions status").lean();
    const current = docs.filter((d) => d.status !== "archived").length;
    const opens = docs.reduce((s, d) => s + (d.opens || 0), 0);
    const downloads = docs.reduce((s, d) => s + (d.downloads || 0), 0);
    const versions = docs.reduce((s, d) => s + (d.versions?.length || 0), 0);
    return res.json({
      success: true,
      data: { current, opens, downloads, versions },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Docs ──

exports.listDocs = async (req, res) => {
  try {
    const { q, cat, status } = req.query;
    const filter = {};
    if (!isOwnerRole(req.user)) {
      filter.status = { $ne: "archived" };
    } else if (status === "archived") {
      filter.status = "archived";
    } else if (status && STATUSES.includes(status)) {
      filter.status = status;
    } else if (status !== "all") {
      filter.status = { $ne: "archived" };
    }
    if (cat && CATS[cat]) filter.cat = cat;
    if (q) {
      const qq = String(q).trim();
      filter.$or = [
        { name: new RegExp(qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { desc: new RegExp(qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      ];
    }

    const list = await FirmLibraryDoc.find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();
    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: list.map((d) => serializeDoc(d, { staffCount, viewerId: req.user._id })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDoc = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (doc.status === "archived" && !isOwnerRole(req.user)) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: req.user._id }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createDoc = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Name required" });
    const file = fileMetaFromMulter(req.file);
    if (!file) return res.status(400).json({ success: false, message: "File required" });

    const cat = CATS[req.body?.cat] ? req.body.cat : "sop";
    const desc = String(req.body?.desc || "").trim();
    const by = who(req.user);

    const doc = await FirmLibraryDoc.create({
      name,
      cat,
      desc,
      pinned: req.body?.pinned === "true" || req.body?.pinned === true,
      status: "current",
      ownerName: by,
      file,
      currentVersion: "v1",
      versions: [{ v: "v1", note: "Initial upload", at: new Date(), by, file }],
      suggestions: [{ t: "Uploaded to library", at: new Date(), by }],
    });

    await writeAudit({ user: req.user, action: "uploaded", doc, detail: file.fname });
    const staffCount = await staffDenominator();
    return res.status(201).json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: req.user._id }),
    });
  } catch (err) {
    if (req.file?.filename) deleteFile(req.file.filename);
    console.error("[firm-library] createDoc:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateDoc = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const body = req.body || {};
    if (body.name !== undefined) {
      const next = String(body.name).trim();
      if (!next) return res.status(400).json({ success: false, message: "Name required" });
      doc.name = next;
    }
    if (body.desc !== undefined) doc.desc = String(body.desc).trim();
    if (body.cat && CATS[body.cat]) doc.cat = body.cat;
    if (body.pinned !== undefined) doc.pinned = !!body.pinned;
    if (body.status && STATUSES.includes(body.status)) {
      const prev = doc.status;
      doc.status = body.status;
      if (body.status === "archived" && prev !== "archived") {
        await writeAudit({
          user: req.user,
          action: "deleted",
          doc,
          detail: "archived (retained)",
        });
      }
    }

    await doc.save();
    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: req.user._id }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addVersion = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    const file = fileMetaFromMulter(req.file);
    if (!file) return res.status(400).json({ success: false, message: "File required" });

    const note = String(req.body?.note || "").trim() || "Updated version";
    const by = who(req.user);
    const n = (doc.versions?.length || 0) + 1;
    const v = `v${n}`;

    doc.versions.push({ v, note, at: new Date(), by, file });
    doc.file = file;
    doc.currentVersion = v;
    doc.acks = [];
    doc.status = "current";
    doc.suggestions.push({ t: `New version ${v}: ${note}`, at: new Date(), by });
    await doc.save();

    await writeAudit({
      user: req.user,
      action: "versioned",
      doc,
      detail: `${v} — ${file.fname}`,
    });

    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: req.user._id }),
    });
  } catch (err) {
    if (req.file?.filename) deleteFile(req.file.filename);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteDoc = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const keys = new Set();
    if (doc.file?.storageKey) keys.add(doc.file.storageKey);
    for (const ver of doc.versions || []) {
      if (ver.file?.storageKey) keys.add(ver.file.storageKey);
    }

    await writeAudit({
      user: req.user,
      action: "deleted",
      doc,
      detail: "permanently deleted",
    });

    await doc.deleteOne();
    for (const k of keys) deleteFile(k);

    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.acknowledge = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (doc.status === "archived") {
      return res.status(400).json({ success: false, message: "Cannot acknowledge archived document" });
    }

    const ver = doc.currentVersion || "v1";
    const uid = req.user._id;
    const already = doc.acks.some(
      (a) => String(a.userId) === String(uid) && a.version === ver
    );
    if (!already) {
      doc.acks.push({
        userId: uid,
        name: who(req.user),
        at: new Date(),
        version: ver,
      });
      await doc.save();
      await writeAudit({ user: req.user, action: "acknowledged", doc, detail: ver });
    }

    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: uid }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.suggest = async (req, res) => {
  try {
    const text = String(req.body?.text || req.body?.t || "").trim();
    if (text.length < 5) {
      return res.status(400).json({ success: false, message: "Describe the suggested update" });
    }
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const by = who(req.user);
    doc.suggestions.push({ t: text, at: new Date(), by, userId: req.user._id });
    await doc.save();
    await writeAudit({ user: req.user, action: "suggested", doc, detail: text.slice(0, 200) });

    const staffCount = await staffDenominator();
    return res.json({
      success: true,
      data: serializeDoc(doc, { staffCount, viewerId: req.user._id }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.streamFile = async (req, res) => {
  try {
    const doc = await FirmLibraryDoc.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (doc.status === "archived" && !isOwnerRole(req.user)) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const action = req.query.action === "download" ? "download" : "open";
    let fileMeta = doc.file;
    const verQ = req.query.version ? String(req.query.version) : null;
    if (verQ) {
      const ver = (doc.versions || []).find((v) => v.v === verQ);
      if (!ver?.file) {
        return res.status(404).json({ success: false, message: "Version not found" });
      }
      fileMeta = ver.file;
    }

    const abs = absolutePath(fileMeta.storageKey);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, message: "File missing on server" });
    }

    if (action === "download") {
      doc.downloads += 1;
      await writeAudit({
        user: req.user,
        action: "downloaded",
        doc,
        detail: fileMeta.fname + (verQ ? ` (${verQ})` : ""),
      });
    } else {
      doc.opens += 1;
      await writeAudit({
        user: req.user,
        action: "opened",
        doc,
        detail: fileMeta.fname + (verQ ? ` (${verQ})` : ""),
      });
    }
    await doc.save();

    res.setHeader("Content-Type", fileMeta.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${action === "download" ? "attachment" : "inline"}; filename="${encodeURIComponent(fileMeta.fname)}"`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(abs);
  } catch (err) {
    console.error("[firm-library] streamFile:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Audit ──

exports.listAudit = async (req, res) => {
  try {
    const { who: whoQ, action, doc: docQ } = req.query;
    const filter = {};
    if (whoQ) filter.who = new RegExp(String(whoQ).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (action) filter.action = action;
    if (docQ) {
      filter.docName = new RegExp(String(docQ).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    const list = await FirmLibraryAudit.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportAudit = async (req, res) => {
  try {
    const list = await FirmLibraryAudit.find().sort({ createdAt: -1 }).limit(5000).lean();
    const rows = [["when", "who", "action", "document", "detail"]];
    for (const a of list) {
      rows.push([
        a.createdAt ? new Date(a.createdAt).toLocaleString("en-AU") : "",
        a.who,
        a.action,
        a.docName,
        a.detail || "",
      ]);
    }
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="firm-library-audit-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
