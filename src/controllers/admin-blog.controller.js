/**
 * Admin Blog Controller — CRUD, assign, status, quiz submissions
 */

const fs = require("fs");
const uploadDir = "uploads/blogs";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const Blog = require("../models/blog.model");
const BlogQuizSubmission = require("../models/blog-quiz-submission.model");
const User = require("../models/User");

function canAssign(user) {
  return user && (user.role === "admin" || user.role === "owner" || user.role === "manager");
}

function canDelete(user) {
  return canAssign(user);
}

function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      /* comma-separated */
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildBlogData(body, files) {
  const data = { ...body };
  if (data.tags !== undefined) data.tags = parseTags(data.tags);
  if (data.assignedTo === "" || data.assignedTo === "null" || data.assignedTo === "undefined") {
    data.assignedTo = null;
  }
  if (files?.coverImage?.[0]) {
    data.coverImage = `/uploads/blogs/${files.coverImage[0].filename}`;
  }
  if (data.slug) data.slug = Blog.slugify(data.slug);
  return data;
}

async function ensureUniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug || "post";
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await Blog.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).lean();
    if (!existing) return candidate;
    n += 1;
  }
}

// ── List blogs ──

exports.getAll = async (req, res) => {
  try {
    const { status, search, assignedTo, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status && status !== "all") filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    // Staff without assign powers: only their assigned posts (or unassigned they created — keep assigned only)
    if (!canAssign(req.user) && req.user?.role === "staff") {
      filter.assignedTo = req.user._id;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, blogs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
        .populate("assignedTo", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
    ]);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Get one ──

exports.getById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate("assignedTo", "name email role");
    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    if (
      !canAssign(req.user) &&
      req.user?.role === "staff" &&
      String(blog.assignedTo?._id || blog.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    res.json({ success: true, data: blog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Create ──

exports.create = async (req, res) => {
  try {
    const data = buildBlogData(req.body, req.files);
    if (!data.title || !data.content) {
      return res.status(400).json({ success: false, error: "title and content are required" });
    }
    const baseSlug = data.slug || Blog.slugify(data.title);
    data.slug = await ensureUniqueSlug(baseSlug);

    if (data.assignedTo && canAssign(req.user)) {
      const staff = await User.findById(data.assignedTo);
      if (!staff || !staff.active) {
        return res.status(400).json({ success: false, error: "Invalid assignee" });
      }
    } else if (!canAssign(req.user)) {
      data.assignedTo = req.user._id;
    }

    if (!data.authorName && req.user?.name) data.authorName = req.user.name;

    const blog = await Blog.create(data);
    const populated = await Blog.findById(blog._id).populate("assignedTo", "name email role");
    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      data: populated,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ── Update ──

exports.update = async (req, res) => {
  try {
    const existing = await Blog.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    if (
      !canAssign(req.user) &&
      req.user?.role === "staff" &&
      String(existing.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const data = buildBlogData(req.body, req.files);
    // Staff cannot reassign
    if (!canAssign(req.user)) {
      delete data.assignedTo;
    } else if (data.assignedTo) {
      const staff = await User.findById(data.assignedTo);
      if (!staff || !staff.active) {
        return res.status(400).json({ success: false, error: "Invalid assignee" });
      }
    }

    if (data.slug) {
      data.slug = await ensureUniqueSlug(data.slug, existing._id);
    }

    if (data.status === "published" && !existing.publishedAt && !data.publishedAt) {
      data.publishedAt = new Date();
    }

    const blog = await Blog.findByIdAndUpdate(req.params.id, { $set: data }, {
      new: true,
      runValidators: true,
    }).populate("assignedTo", "name email role");

    res.json({ success: true, message: "Blog updated successfully", data: blog });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ── Delete ──

exports.delete = async (req, res) => {
  try {
    if (!canDelete(req.user)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    await BlogQuizSubmission.deleteMany({ blogId: blog._id });
    res.json({ success: true, message: "Blog deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Assign ──

exports.assign = async (req, res) => {
  try {
    if (!canAssign(req.user)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    const staffId = req.body.assignedTo;
    if (!staffId) {
      blog.assignedTo = null;
      await blog.save();
      const populated = await Blog.findById(blog._id).populate("assignedTo", "name email role");
      return res.json({ success: true, data: populated });
    }
    const staff = await User.findById(staffId);
    if (!staff || !staff.active) {
      return res.status(400).json({ success: false, error: "Invalid assignee" });
    }
    blog.assignedTo = staff._id;
    await blog.save();
    const populated = await Blog.findById(blog._id).populate("assignedTo", "name email role");
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Status ──

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    if (
      !canAssign(req.user) &&
      req.user?.role === "staff" &&
      String(blog.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    blog.status = status;
    if (status === "published" && !blog.publishedAt) blog.publishedAt = new Date();
    await blog.save();
    res.json({ success: true, data: blog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Quiz submissions for one blog ──

exports.getQuizSubmissionsForBlog = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const filter = { blogId: req.params.id };

    const [total, data] = await Promise.all([
      BlogQuizSubmission.countDocuments(filter),
      BlogQuizSubmission.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── All quiz submissions ──

exports.getAllQuizSubmissions = async (req, res) => {
  try {
    const { status, search, blogId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (blogId) filter.blogId = blogId;
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { mobile: { $regex: q, $options: "i" } },
        { serviceInterest: { $regex: q, $options: "i" } },
        { "touchpoint.articleTitle": { $regex: q, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const [total, data] = await Promise.all([
      BlogQuizSubmission.countDocuments(filter),
      BlogQuizSubmission.find(filter)
        .populate("blogId", "title slug")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Patch quiz submission status ──

exports.updateQuizSubmission = async (req, res) => {
  try {
    const doc = await BlogQuizSubmission.findById(req.params.submissionId);
    if (!doc) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }
    const { status, adminNotes } = req.body;
    if (status) {
      if (!["new", "contacted", "closed"].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status" });
      }
      doc.status = status;
    }
    if (adminNotes !== undefined) doc.adminNotes = String(adminNotes);
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
