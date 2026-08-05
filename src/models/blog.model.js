/**
 * Blog Model — marketing blog posts managed from Operations Hub.
 */

const mongoose = require("mongoose");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, trim: true, default: "" },
    content: { type: String, required: true, trim: true },
    coverImage: { type: String, default: "" },
    category: { type: String, trim: true, default: "General" },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    authorName: { type: String, trim: true, default: "" },
    seoTitle: { type: String, trim: true, default: "" },
    seoDescription: { type: String, trim: true, default: "" },
    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "blogs",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

blogSchema.index({ status: 1, publishedAt: -1 });

blogSchema.pre("validate", function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  } else if (this.slug) {
    this.slug = slugify(this.slug);
  }
  if (this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

blogSchema.statics.slugify = slugify;

module.exports = mongoose.model("Blog", blogSchema);
