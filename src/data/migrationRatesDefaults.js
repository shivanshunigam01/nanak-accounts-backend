/** Seed rates for Nanak Migration calculators (govt year schedules). */

function defaultYearY2627() {
  return {
    label: "2026-27",
    effectiveDate: "2026-07-01",
    visaFees: [
      { id: "820", name: "Partner (onshore)", sc: "820 / 801", base: 11710, adult: 5860, kid: 2935, verified: true },
      { id: "309", name: "Partner (offshore)", sc: "309 / 100", base: 11710, adult: 5860, kid: 2935, verified: true },
      { id: "300", name: "Prospective Marriage", sc: "300", base: 11710, adult: 5860, kid: 2935, verified: true },
      {
        id: "500",
        name: "Student",
        sc: "500",
        base: 2500,
        adult: 1530,
        kid: 500,
        verified: true,
        note: "Lower charges apply to some student streams and eligible applicants — confirmed for your case before lodgement.",
      },
      { id: "485", name: "Temporary Graduate", sc: "485", base: 5750, adult: 2875, kid: 1450, verified: true },
      { id: "482", name: "Skills in Demand", sc: "482", base: 4015, adult: 4015, kid: 1005, verified: true, employer: true },
      { id: "186", name: "Employer Nomination", sc: "186", base: 6140, adult: 3070, kid: 1535, verified: true, english2nd: true },
      { id: "189", name: "Skilled Independent", sc: "189", base: 6135, adult: 3070, kid: 1540, verified: true, english2nd: true },
      { id: "190", name: "Skilled Nominated", sc: "190", base: 6140, adult: 3070, kid: 1535, verified: true, english2nd: true },
      { id: "491", name: "Skilled Work Regional", sc: "491", base: 6140, adult: 3070, kid: 1535, verified: true, english2nd: true },
      { id: "600", name: "Visitor", sc: "600", base: null, adult: null, kid: null, verified: false },
      {
        id: "143",
        name: "Contributory Parent",
        sc: "143",
        base: null,
        adult: null,
        kid: null,
        verified: false,
        second: "A substantial second visa application charge may apply before grant.",
      },
    ],
    employer: {
      nomination: 330,
      sbsOptions: [
        { label: "Already approved", value: 0 },
        { label: "New / renew SBS", value: 420 },
      ],
      safRates: [
        { label: "Small business", value: 1200 },
        { label: "Large business", value: 1800 },
      ],
    },
    prPoints: {
      threshold: 65,
      employmentCap: 20,
      age: [
        { label: "18–24", value: 25 },
        { label: "25–32", value: 30 },
        { label: "33–39", value: 25 },
        { label: "40–44", value: 15 },
        { label: "45+", value: "x" },
      ],
      english: [
        { label: "Competent", value: 0, key: "competent" },
        { label: "Proficient", value: 10, key: "proficient" },
        { label: "Superior", value: 20, key: "superior" },
      ],
      overseasExp: [
        { label: "Under 3 years", value: 0 },
        { label: "3–4 years", value: 5 },
        { label: "5–7 years", value: 10 },
        { label: "8+ years", value: 15 },
      ],
      ausExp: [
        { label: "Under 1 year", value: 0 },
        { label: "1–2 years", value: 5 },
        { label: "3–4 years", value: 10 },
        { label: "5–7 years", value: 15 },
        { label: "8+ years", value: 20 },
      ],
      education: [
        { label: "Doctorate", value: 20 },
        { label: "Bachelor / Masters", value: 15 },
        { label: "Diploma / Trade", value: 10 },
        { label: "Other / None", value: 0 },
      ],
      bonus: [
        { label: "Australian study requirement", value: 5, key: "ausstudy" },
        { label: "Regional study", value: 5, key: "regional" },
        { label: "Professional Year", value: 5, key: "py" },
        { label: "NAATI / community language", value: 5, key: "naati" },
        { label: "Specialist education (STEM research)", value: 10, key: "stem" },
      ],
      partner: [
        { label: "Single, or partner is an Australian citizen or PR", value: 10, key: "pr" },
        { label: "Partner has skills assessment + Competent English", value: 10, key: "skilled" },
        { label: "Partner has Competent English", value: 5, key: "eng" },
        { label: "None of the above", value: 0, key: "none" },
      ],
      nomination: { "189": 0, "190": 5, "491": 15 },
    },
  };
}

function defaultMigrationRatesConfig() {
  return {
    key: "default",
    activeYearKey: "y2627",
    years: {
      y2627: defaultYearY2627(),
    },
  };
}

module.exports = {
  defaultYearY2627,
  defaultMigrationRatesConfig,
};
