const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, getOrderDetails } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, createOrder);
router.route('/getAllOrders').get(protect, getAllOrders);
router.route('/getOrdersById/:orderID').get(protect, getOrderDetails);

module.exports = router;