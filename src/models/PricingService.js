const mongoose = require('mongoose');

const pricingServiceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },

    foundation: {
      title: { type: String, required: true },
      price: { type: Number, required: true },
      features: [{ type: String }],
    },

    accounting: {
      includes: [{ type: String }],
      extraCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingService', pricingServiceSchema);
