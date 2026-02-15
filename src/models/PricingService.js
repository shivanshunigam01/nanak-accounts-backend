const mongoose = require('mongoose');

const pricingServiceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    foundation: {
      title: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      features: {
        type: [String],
        default: [],
      },
    },
    accounting: {
      includes: {
        type: [String],
        default: [],
      },
      extraCount: {
        type: Number,
        default: 0,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingService', pricingServiceSchema);
