const SERVICE_DISPLAY = {
  abn: 'ABN Registration',
  business_name: 'Business Name Registration',
  gst: 'GST Registration',
  family_trust: 'Family Trust Setup',
  charity: 'Charity Setup',
  charity_clg: 'Company Limited by Guarantee',
  charity_ia: 'Incorporated Association',
  company: 'Company Registration',
  smsf: 'SMSF Setup',
  unit_trust: 'Unit Trust Setup',
  bare_trust: 'Bare Trust Setup',
  partnership: 'Partnership Registration',
  tfn: 'TFN Registration',
  ndis: 'NDIS Business Setup',
  dgr: 'DGR Registration',
};

function getServiceName(serviceKey) {
  return SERVICE_DISPLAY[serviceKey] || serviceKey;
}

module.exports = { SERVICE_DISPLAY, getServiceName };
