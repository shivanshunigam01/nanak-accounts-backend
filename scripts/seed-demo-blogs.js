/**
 * Seed demo published blogs with cover images for list/card iframe QA.
 * Usage: node scripts/seed-demo-blogs.js
 * Idempotent: upserts by slug (demo-*).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Blog = require("../src/models/blog.model");

const DEMOS = [
  {
    title: "How to Set Up Payroll — A Step-by-Step Australian Guide",
    slug: "demo-payroll-setup-guide",
    category: "Payroll",
    tags: ["payroll", "stp", "compliance"],
    excerpt: "From the first pay cycle to STP lodgement — what you must get right so payroll stays compliant.",
    img: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=500&fit=crop",
  },
  {
    title: "Company Tax Returns: What Directors Forget Every Year",
    slug: "demo-company-tax-returns",
    category: "Business Tax",
    tags: ["company", "tax return", "directors"],
    excerpt: "Division 7A, loans, and franking — the three traps that show up after lodgement.",
    img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=500&fit=crop",
  },
  {
    title: "Trust Distributions Before 30 June — A Practical Checklist",
    slug: "demo-trust-distributions-checklist",
    category: "Trusts",
    tags: ["trust", "distributions", "eofy"],
    excerpt: "Resolutions, streaming, and who actually gets what — without the jargon.",
    img: "https://images.unsplash.com/photo-1554224311-beee4ece0c2a?w=800&h=500&fit=crop",
  },
  {
    title: "SMSF Contribution Caps Explained for Busy Trustees",
    slug: "demo-smsf-contribution-caps",
    category: "SMSF",
    tags: ["smsf", "super", "contributions"],
    excerpt: "Concessional vs non-concessional, catch-up, and what happens if you go over.",
    img: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&h=500&fit=crop",
  },
  {
    title: "Rental Property Deductions You May Be Missing",
    slug: "demo-rental-property-deductions",
    category: "Property",
    tags: ["rental", "deductions", "depreciation"],
    excerpt: "Interest, depreciation schedules, and travel — what still stacks in the current rules.",
    img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=500&fit=crop",
  },
  {
    title: "BAS Lodgement Rhythm for Growing Businesses",
    slug: "demo-bas-lodgement-rhythm",
    category: "BAS",
    tags: ["bas", "gst", "cashflow"],
    excerpt: "A simple monthly cadence so GST, PAYG and cashflow stop colliding at quarter-end.",
    img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=500&fit=crop",
  },
  {
    title: "Sole Trader vs Company — When the Switch Makes Sense",
    slug: "demo-sole-trader-vs-company",
    category: "Structure",
    tags: ["sole trader", "company", "structure"],
    excerpt: "Turnover, risk, and tax — a clear framework for when incorporation is worth the cost.",
    img: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&h=500&fit=crop",
  },
  {
    title: "CGT on Your Investment Property — Main Residence Myths",
    slug: "demo-cgt-main-residence-myths",
    category: "Property",
    tags: ["cgt", "main residence", "investing"],
    excerpt: "Six-year rule, market value resets, and when the exemption actually applies.",
    img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80&h=500&fit=crop&sat=-20",
  },
  {
    title: "Work-From-Home Deductions After the Fixed Rate Change",
    slug: "demo-work-from-home-deductions",
    category: "Individual Tax",
    tags: ["wfh", "deductions", "individuals"],
    excerpt: "What records you need now, and when the fixed rate still beats actual costs.",
    img: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=500&fit=crop",
  },
  {
    title: "EOFY Tax Planning Moves That Still Work",
    slug: "demo-eofy-tax-planning",
    category: "Tax Planning",
    tags: ["eofy", "planning", "deductions"],
    excerpt: "Prepay, contribute, and defer — ten moves we run with clients every May–June.",
    img: "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&h=500&fit=crop",
  },
  {
    title: "Bookkeeping Habits That Save You Hours at Tax Time",
    slug: "demo-bookkeeping-habits",
    category: "Bookkeeping",
    tags: ["bookkeeping", "xero", "systems"],
    excerpt: "Bank feeds, receipt capture, and a weekly 20-minute close that keeps your accountant cheap.",
    img: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=800&h=500&fit=crop",
  },
  {
    title: "GST Registration Thresholds — Are You Under or Over?",
    slug: "demo-gst-registration-thresholds",
    category: "GST",
    tags: ["gst", "registration", "turnover"],
    excerpt: "Projected turnover, voluntary registration, and how to avoid the surprise ATO letter.",
    img: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&h=500&fit=crop",
  },
  {
    title: "Family Trusts for Property Investors — Pros and Cons",
    slug: "demo-family-trusts-property",
    category: "Trusts",
    tags: ["family trust", "property", "investing"],
    excerpt: "Control, asset protection, and tax streaming — when a discretionary trust fits a portfolio.",
    img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=450&fit=crop&crop=entropy",
  },
  {
    title: "Motor Vehicle Claims for Tradies and Consultants",
    slug: "demo-motor-vehicle-claims",
    category: "Individual Tax",
    tags: ["car", "logbook", "claims"],
    excerpt: "Cents-per-km vs logbook — which method wins, and the evidence the ATO expects.",
    img: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&h=500&fit=crop",
  },
  {
    title: "Hiring Your First Employee — Payroll and Super Checklist",
    slug: "demo-first-employee-checklist",
    category: "Payroll",
    tags: ["hiring", "super", "payroll"],
    excerpt: "TFN declarations, super choice, STP, and the day-one setup that avoids back-pay headaches.",
    img: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&h=500&fit=crop",
  },
  {
    title: "What Changed in the TPB Code — And Why Your Engagement Letter Matters",
    slug: "demo-tpb-code-engagement",
    category: "Compliance",
    tags: ["tpb", "engagement", "ethics"],
    excerpt: "NOCLAR, identity verification, and how a clear engagement letter protects both sides.",
    img: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=500&fit=crop",
  },
];

function bodyFor(d) {
  return [
    `<p>${d.excerpt}</p>`,
    `<p>This is a <strong>demo blog post</strong> seeded so you can preview the Operations Hub blog list, cover images, and the public blog-card iframe.</p>`,
    `<h2>Key takeaways</h2>`,
    `<ul>`,
    ...d.tags.map((t) => `<li>Focus area: ${t}</li>`),
    `</ul>`,
    `<p>When you are ready, replace this with a real article from <em>Admin → Blogs</em>. Leads from the free 15-minute call card still post to Lead CRM against this slug.</p>`,
    `<p>Written for Nanak Accountants — demo content only.</p>`,
  ].join("\n");
}

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  let upserted = 0;
  for (let i = 0; i < DEMOS.length; i++) {
    const d = DEMOS[i];
    const publishedAt = new Date(Date.now() - (i + 1) * 36 * 3600 * 1000);
    await Blog.findOneAndUpdate(
      { slug: d.slug },
      {
        $set: {
          title: d.title,
          slug: d.slug,
          excerpt: d.excerpt,
          content: bodyFor(d),
          coverImage: d.img,
          category: d.category,
          tags: d.tags,
          status: "published",
          authorName: "Puneet Singh",
          seoTitle: d.title,
          seoDescription: d.excerpt,
          publishedAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
    console.log("  ✓", d.slug);
  }
  const published = await Blog.countDocuments({ status: "published" });
  console.log(`\nDone: ${upserted} demo blogs upserted. Total published: ${published}`);
  console.log("List iframe: https://api.connect.cavaluer.com/embeds/blog-list.html");
  console.log("Admin blogs: http://admin.nanakaccountants.com.au/admin/blogs");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
