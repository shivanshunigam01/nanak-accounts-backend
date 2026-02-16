const PricingService = require("../models/PricingService");

// GET ALL
exports.getAllServices = async (req, res) => {
  try {
    const services = await PricingService.find().sort({ createdAt: -1 });
    res.json({ services });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch services',
      error: err.message,
    });
  }
};

// GET SINGLE
exports.getService = async (req, res) => {
  try {
    const service = await PricingService.findOne({ key: req.params.key });

    if (!service)
      return res.status(404).json({ message: 'Service not found' });

    res.json(service);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch service',
      error: err.message,
    });
  }
};

// CREATE
exports.createService = async (req, res) => {
  try {
    const { key, label, foundation, accounting } = req.body;

    if (!key || !label || !foundation?.title || foundation?.price === undefined)
      return res.status(400).json({
        message: 'Missing required fields',
      });

    const exists = await PricingService.findOne({ key });
    if (exists)
      return res.status(409).json({
        message: 'Service key already exists',
      });

    const service = await PricingService.create({
      key,
      label,
      foundation,
      accounting,
    });

    res.status(201).json({
      message: 'Service created successfully',
      service,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to create service',
      error: err.message,
    });
  }
};

// UPDATE
exports.updateService = async (req, res) => {
  try {
    const { label, foundation, accounting } = req.body;

    const service = await PricingService.findOneAndUpdate(
      { key: req.params.key },
      {
        $set: {
          ...(label && { label }),
          ...(foundation && { foundation }),
          ...(accounting && { accounting }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json({
      message: 'Service updated successfully',
      service,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update service',
      error: err.message,
    });
  }
};


// DELETE
exports.deleteService = async (req, res) => {
  try {
    const service = await PricingService.findOneAndDelete({
      key: req.params.key,
    });

    if (!service)
      return res.status(404).json({ message: 'Service not found' });

    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete service',
      error: err.message,
    });
  }
};

// RESET TO DEFAULT
exports.resetPricing = async (req, res) => {
  try {
    await PricingService.deleteMany();

    const defaults = [
      {
        key: 'abn',
        label: 'ABN Registration',
        foundation: {
          title: 'Foundation Setup',
          price: 99,
          features: [
            'ABN Registration with ATO',
            'Business Name Availability Check',
          ],
        },
        accounting: {
          includes: [
            'Monthly Bookkeeping & Bank Reconciliation',
            'Quarterly BAS Preparation & Lodgement',
          ],
          extraCount: 8,
        },
      },
    ];

    const services = await PricingService.insertMany(defaults);

    res.json({
      message: 'Pricing reset to defaults',
      services,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to reset pricing',
      error: err.message,
    });
  }
};
