const { poolPromise, sql } = require('../config/db');

// @desc    Get chat history for a user
// @route   GET /api/chat/messages
// @access  Private
const getMessages = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userID', sql.Int, req.user.userID)
            .query('SELECT * FROM ChatMessages WHERE UserID = @userID ORDER BY SentAt ASC');
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Send a message
// @route   POST /api/chat/messages
// @access  Private
const sendMessage = async (req, res) => {
    const { message } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('userID', sql.Int, req.user.userID)
            .input('message', sql.NVarChar, message)
            .query('INSERT INTO ChatMessages (UserID, Message) VALUES (@userID, @message)');
        res.status(201).json({ message: 'Message sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getMessages, sendMessage };