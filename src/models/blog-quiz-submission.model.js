/**
 * Blog lead submission — free 15-min call (and legacy quiz) from blog posts.
 */

const mongoose = require("mongoose");

const blogQuizSubmissionSchema = new mongoose.Schema(
  {
    blogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
      default: null,
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, trim: true, default: null },
    callbackRequested: { type: Boolean, default: false },
    marketingOptin: { type: Boolean, default: false },
    recordType: { type: String, trim: true, default: "lead" },
    consent: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    serviceInterest: { type: String, trim: true, default: "" },
    leadScore: { type: Number, min: 0, max: 100, default: 0 },
    quizAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    touchpoint: {
      channel: { type: String, trim: true, default: "blog" },
      source: { type: String, trim: true, default: "free_15min_call" },
      page: { type: String, trim: true, default: "/" },
      articleTitle: { type: String, trim: true, default: null },
      category: { type: String, trim: true, default: null },
      capturedAt: { type: Date, default: Date.now },
    },
    status: {
      type: String,
      enum: ["new", "contacted", "closed"],
      default: "new",
      index: true,
    },
    adminNotes: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    collection: "blog_quiz_submissions",
  }
);

blogQuizSubmissionSchema.index({ email: 1, blogId: 1, createdAt: -1 });
blogQuizSubmissionSchema.index({ status: 1, createdAt: -1 });
blogQuizSubmissionSchema.index({ callbackRequested: 1 });
blogQuizSubmissionSchema.index({ "touchpoint.source": 1, createdAt: -1 });

module.exports = mongoose.model("BlogQuizSubmission", blogQuizSubmissionSchema);
