const express = require('express');
const router = express.Router();
const pricingController = require('../../controllers/pricing.controller');

router.get('/', pricingController.getAllServices);
router.get('/:key', pricingController.getService);
router.post('/', pricingController.createService);
router.put('/:key', pricingController.updateService);
router.delete('/:key', pricingController.deleteService);
router.post('/reset', pricingController.resetPricing);

module.exports = router;
