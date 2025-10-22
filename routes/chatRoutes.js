const express = require('express');
const router = express.Router();
const { 
    getAllThreads,
    getCustomerThread,
    getThreadMessages,
    sendMessage 
} = require('../controllers/chatController');
const { protect, admin } = require('../middleware/authMiddleware');

// All routes are protected
router.use(protect);

// Admin routes
router.get('/threads', admin, getAllThreads);
router.get('/threads/:threadId', admin, getThreadMessages);

// Customer routes
router.get('/thread', getCustomerThread);
router.post('/messages', sendMessage);

module.exports = router;