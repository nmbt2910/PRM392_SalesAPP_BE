const express = require("express");
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrderDetails,
  updatePaymentStatus,
} = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");

router.route("/").post(protect, createOrder);
router.route("/getAllOrders").get(protect, getAllOrders);
router.route("/getOrdersById/:orderID").get(protect, getOrderDetails);
router.route("/updatePaymentStatus/:orderID").put(protect, updatePaymentStatus);

module.exports = router;
