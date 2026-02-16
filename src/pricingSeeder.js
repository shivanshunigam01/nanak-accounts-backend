require('dotenv').config();
const mongoose = require('mongoose');
const PricingService = require('./models/PricingService');
const MONGO_URI = process.env.MONGODB_URI;

const pricingData = [
  {
    key: "abn",
    label: "ABN Registration",
    foundation: {
      title: "Foundation Setup",
      price: 99,
      features: [
        "ABN Registration with ATO",
        "Business Name Availability Check",
        "GST Registration Assessment",
        "Tax File Number (TFN) Setup",
        "Business Structure Consultation",
        "ATO Portal Access & Setup",
        "Record Keeping Requirements Guide",
        "Business Banking Setup Advice",
        "Compliance Calendar & Reminders",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Bank Reconciliation",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Tax Return Preparation",
        "GST Reconciliation & Compliance",
      ],
      extraCount: 8,
    },
  },

  {
    key: "business_name",
    label: "Business Name",
    foundation: {
      title: "Foundation Setup",
      price: 149,
      features: [
        "ASIC Business Name Registration",
        "Nationwide Name Availability Check",
        "Trademark Conflict Search",
        "Domain Name Availability Check",
        "ABN & TFN Registration Included",
        "Business Name Certificate",
        "1 or 3 Year Registration Options",
        "ASIC Renewal Reminders",
        "Brand Protection Advice",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Reconciliation",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Tax Return Preparation",
        "GST Registration & Compliance",
      ],
      extraCount: 8,
    },
  },

  {
    key: "family_trust",
    label: "Family Trust",
    foundation: {
      title: "Foundation Setup",
      price: 1199,
      features: [
        "Professional Trust Deed Preparation",
        "Trustee Structure Setup (Individual or Corporate)",
        "ABN & TFN Registration for Trust",
        "Trust Bank Account Setup Guidance",
        "Beneficiary Designation & Documentation",
        "Appointor & Guardian Appointment",
        "TFN Applications for Beneficiaries",
        "Asset Protection Strategy Review",
        "Stamp Duty Advice (State-specific)",
        "Trust Resolutions & Minutes Templates",
        "Compliance Calendar Setup",
        "ATO Registration & Tax Setup",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Trust Reconciliation",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Trust Tax Return Preparation",
        "Trust Distribution Calculations",
      ],
      extraCount: 10,
    },
  },

  {
    key: "gst",
    label: "GST Registration",
    foundation: {
      title: "Foundation Setup",
      price: 129,
      features: [
        "GST Registration with ATO",
        "ABN Validation & Update",
        "GST Reporting Method Setup (Monthly/Quarterly)",
        "BAS Agent Registration",
        "GST Accounting System Setup",
        "Input Tax Credit Advice",
        "GST Compliance Calendar",
        "Record Keeping Requirements Guide",
        "First BAS Lodgement Assistance",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Bank Reconciliation",
        "Quarterly or Monthly BAS Preparation",
        "BAS Lodgement with ATO",
        "GST Reconciliation & Reporting",
      ],
      extraCount: 8,
    },
  },

  {
    key: "charity",
    label: "Charity Setup",
    foundation: {
      title: "Foundation Setup",
      price: 899,
      features: [
        "ACNC Charity Registration",
        "DGR Status Application (if eligible)",
        "Charity Constitution & Governing Documents",
        "ABN & TFN Registration for Charity",
        "Charity Subtype Selection & Classification",
        "Responsible Persons Registration",
        "Public Charity Register Listing",
        "Tax Concession Applications",
        "GST Concession Registration",
        "FBT & Payroll Tax Exemptions",
        "Fundraising Permit Guidance",
        "Compliance Framework Setup",
      ],
    },
    accounting: {
      includes: [
        "Charity Bookkeeping & Fund Accounting",
        "Annual Financial Statement Preparation (ACNC)",
        "ACNC Annual Information Statement",
        "Donor Receipt & Tax Deduction Management",
      ],
      extraCount: 10,
    },
  },

  {
    key: "company",
    label: "Company Registration",
    foundation: {
      title: "Foundation Setup",
      price: 399,
      features: [
        "ASIC Company Registration",
        "ACN & TFN Application",
        "ABN Registration",
        "GST Registration (if required)",
        "Company Constitution",
        "Share Certificates",
        "ASIC Annual Review Setup",
        "Company Compliance Guide",
        "Free Name Availability Check",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Bank Reconciliation",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Financial Statements",
        "Annual Tax Return Lodgement",
      ],
      extraCount: 8,
    },
  },

  {
    key: "smsf",
    label: "SMSF Setup",
    foundation: {
      title: "Foundation Setup",
      price: 799,
      features: [
        "Professional SMSF Trust Deed",
        "Corporate Trustee Company Setup",
        "SMSF ABN & TFN Registration",
        "ATO SMSF Registration & Regulator Notification",
        "Electronic Service Address (ESA) Setup",
        "SMSF Bank Account Setup Guidance",
        "Comprehensive Investment Strategy Document",
        "Rollover Request Documentation",
        "Member Benefit Statements",
        "Trustee Resolution Templates",
        "Compliance Calendar & Checklist",
        "SMSF Accounting System Setup",
      ],
    },
    accounting: {
      includes: [
        "SMSF Bookkeeping & Transaction Recording",
        "Annual SMSF Tax Return Lodgement",
        "Annual SMSF Financial Statements",
        "Independent SMSF Audit Coordination",
      ],
      extraCount: 10,
    },
  },

  {
    key: "partnership",
    label: "Partnership",
    foundation: {
      title: "Foundation Setup",
      price: 299,
      features: [
        "Professional Partnership Agreement",
        "ABN & TFN Registration for Partnership",
        "Partner Capital Account Setup",
        "Profit & Loss Sharing Structure",
        "Partnership Name Registration (ASIC)",
        "Banking Setup Guidance",
        "Tax Registration & ATO Setup",
        "Partner Entry/Exit Provisions",
        "Dispute Resolution Framework",
        "Partnership Dissolution Terms",
        "Partner Roles & Responsibilities Documentation",
        "Compliance Calendar Setup",
      ],
    },
    accounting: {
      includes: [
        "Monthly Partnership Bookkeeping",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Partnership Tax Return",
        "Partner Distribution Statements",
      ],
      extraCount: 10,
    },
  },

  {
    key: "unit_trust",
    label: "Unit Trust",
    foundation: {
      title: "Foundation Setup",
      price: 1199,
      features: [
        "Professional Unit Trust Deed Preparation",
        "Trustee Structure Setup (Individual or Corporate)",
        "ABN & TFN Registration for Trust",
        "Unit Certificates & Register",
        "Unitholder Agreement Documentation",
        "Trust Bank Account Setup Guidance",
        "Stamp Duty Advice (State-specific)",
        "Trust Resolutions & Minutes Templates",
        "ATO Registration & Tax Setup",
        "Compliance Calendar Setup",
      ],
    },
    accounting: {
      includes: [
        "Monthly Bookkeeping & Trust Reconciliation",
        "Quarterly BAS Preparation & Lodgement",
        "Annual Trust Tax Return Preparation",
        "Unit Distribution Calculations",
      ],
      extraCount: 10,
    },
  },

  {
    key: "bare_trust",
    label: "Bare Trust",
    foundation: {
      title: "Foundation Setup",
      price: 2000,
      features: [
        "Bare Trust Deed Preparation",
        "LRBA Documentation & Compliance",
        "Trustee Appointment & Resolutions",
        "ABN Registration (if required)",
        "Property Holding Structure Setup",
        "Loan Agreement Review & Documentation",
        "ATO Compliance Guide",
        "Settlement Coordination Support",
        "Trust Resolutions & Minutes",
        "Ongoing Compliance Checklist",
      ],
    },
    accounting: {
      includes: [
        "Bare Trust Bookkeeping & Reconciliation",
        "Annual Bare Trust Tax Return",
        "LRBA Compliance Monitoring",
        "Property Income & Expense Tracking",
      ],
      extraCount: 8,
    },
  },
];

async function seedPricing() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("Clearing old pricing...");
    await PricingService.deleteMany({});

    console.log("Seeding pricing...");
    await PricingService.insertMany(pricingData);

    console.log("Pricing seeded successfully!");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedPricing();
