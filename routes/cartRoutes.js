const express = require('express');
const router = express.Router();
const { getCart, addItemToCart, updateCartItem, removeCartItem } = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

// All cart routes are protected
router.use(protect);

router.route('/').get(getCart);
router.route('/items').post(addItemToCart);

// New and updated routes
router.route('/items/:itemId')
    .put(updateCartItem)
    .delete(removeCartItem);

module.exports = router;