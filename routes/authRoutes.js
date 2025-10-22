const express = require('express');
const { signUp, login, getProfile, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/signup', signUp);
router.post('/login', login);
router.route('/profile')
  .get(protect, getProfile)
  .put(protect, updateProfile);

module.exports = router;