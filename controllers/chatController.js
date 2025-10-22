const { poolPromise, sql } = require('../config/db');

// @desc    Get all message threads (for admin)
// @route   GET /api/chat/threads
// @access  Private/Admin
const getAllThreads = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT 
                    t.ThreadID,
                    t.CustomerID,
                    u.Username as CustomerName,
                    t.LastMessageAt,
                    t.IsUnread,
                    (SELECT TOP 1 MessageContent 
                     FROM Messages m 
                     WHERE m.ThreadID = t.ThreadID 
                     ORDER BY m.CreatedAt DESC) as LastMessage
                FROM MessageThreads t
                JOIN Users u ON t.CustomerID = u.UserID
                ORDER BY t.LastMessageAt DESC
            `);
        
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get customer's thread
// @route   GET /api/chat/thread
// @access  Private
const getCustomerThread = async (req, res) => {
    const userID = req.user.userID;
    
    try {
        const pool = await poolPromise;
        
        // Check if thread exists for customer
        let threadResult = await pool.request()
            .input('customerID', sql.Int, userID)
            .query('SELECT ThreadID FROM MessageThreads WHERE CustomerID = @customerID');
        
        // If no thread exists, return a specific response
        if (threadResult.recordset.length === 0) {
            return res.json({
                isNewUser: true,
                message: "No chat thread exists. Send your first message to start a conversation.",
                threadID: null,
                messages: []
            });
        }
        
        const threadID = threadResult.recordset[0].ThreadID;
        
        // Get messages for this thread
        const messages = await pool.request()
            .input('threadID', sql.Int, threadID)
            .query(`
                SELECT 
                    m.MessageID,
                    m.SenderID,
                    u.Username as SenderName,
                    m.MessageContent,
                    m.CreatedAt,
                    m.IsRead
                FROM Messages m
                JOIN Users u ON m.SenderID = u.UserID
                WHERE m.ThreadID = @threadID
                ORDER BY m.CreatedAt ASC
            `);
        
        res.json({
            isNewUser: false,
            threadID,
            messages: messages.recordset
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get messages for a specific thread (admin)
// @route   GET /api/chat/threads/:threadId
// @access  Private/Admin
const getThreadMessages = async (req, res) => {
    const { threadId } = req.params;
    
    try {
        const pool = await poolPromise;
        
        // Mark all messages as read
        await pool.request()
            .input('threadID', sql.Int, threadId)
            .query(`
                UPDATE Messages 
                SET IsRead = 1 
                WHERE ThreadID = @threadID AND IsRead = 0;
                
                UPDATE MessageThreads
                SET IsUnread = 0
                WHERE ThreadID = @threadID;
            `);
        
        // Get messages
        const messages = await pool.request()
            .input('threadID', sql.Int, threadId)
            .query(`
                SELECT 
                    m.MessageID,
                    m.SenderID,
                    u.Username as SenderName,
                    m.MessageContent,
                    m.CreatedAt,
                    m.IsRead
                FROM Messages m
                JOIN Users u ON m.SenderID = u.UserID
                WHERE m.ThreadID = @threadID
                ORDER BY m.CreatedAt ASC
            `);
        
        res.json(messages.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Send a message
// @route   POST /api/chat/messages
// @access  Private
const sendMessage = async (req, res) => {
    const { threadId, content } = req.body;
    const senderID = req.user.userID;
    const isAdmin = req.user.role === 'admin';
    
    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            let messageThreadId = threadId;
            const checkRequest = new sql.Request(transaction);

            // Handle first message from customer (no threadId)
            if (!isAdmin && !threadId) {
                // Create new thread for customer
                const newThread = await checkRequest
                    .input('customerID', sql.Int, senderID)
                    .input('lastMessageAt', sql.DateTime, new Date())
                    .input('isUnread', sql.Bit, 1)
                    .query(`
                        INSERT INTO MessageThreads (CustomerID, LastMessageAt, IsUnread) 
                        OUTPUT INSERTED.ThreadID
                        VALUES (@customerID, @lastMessageAt, @isUnread)
                    `);
                messageThreadId = newThread.recordset[0].ThreadID;
            }
            // Verify thread ownership/existence for non-first messages
            else if (threadId) {
                if (!isAdmin) {
                    // Customer sending to existing thread - verify ownership
                    const threadCheck = await checkRequest
                        .input('threadID', sql.Int, threadId)
                        .input('customerID', sql.Int, senderID)
                        .query('SELECT ThreadID FROM MessageThreads WHERE ThreadID = @threadID AND CustomerID = @customerID');

                    if (threadCheck.recordset.length === 0) {
                        throw new Error('Not authorized to send message to this thread');
                    }
                }
            } else if (isAdmin) {
                // Admin trying to create new thread
                throw new Error('Admins cannot create new threads');
            }

            // Prepare values
            const createdAt = new Date();

            // Insert message using its own Request instance
            const insertRequest = new sql.Request(transaction);
            const insertResult = await insertRequest
                .input('threadID', sql.Int, messageThreadId)
                .input('senderID', sql.Int, senderID)
                .input('content', sql.NVarChar, content)
                .input('createdAt', sql.DateTime, createdAt)
                .input('isRead', sql.Bit, 0)
                .query(`
                    DECLARE @InsertedMessage TABLE (
                        MessageID INT,
                        ThreadID INT,
                        SenderID INT,
                        MessageContent NVARCHAR(MAX),
                        CreatedAt DATETIME,
                        IsRead BIT
                    );

                    INSERT INTO Messages (ThreadID, SenderID, MessageContent, CreatedAt, IsRead)
                    OUTPUT INSERTED.MessageID, INSERTED.ThreadID, INSERTED.SenderID, 
                           INSERTED.MessageContent, INSERTED.CreatedAt, INSERTED.IsRead
                    INTO @InsertedMessage
                    VALUES (@threadID, @senderID, @content, @createdAt, @isRead);

                    SELECT * FROM @InsertedMessage;
                `);

            // Update thread using a fresh Request instance
            const updateRequest = new sql.Request(transaction);
            await updateRequest
                .input('createdAt', sql.DateTime, createdAt)
                .input('isUnread', sql.Bit, 1)
                .input('threadID', sql.Int, messageThreadId)
                .query(`
                    UPDATE MessageThreads 
                    SET LastMessageAt = @createdAt, IsUnread = @isUnread
                    WHERE ThreadID = @threadID
                `);
            
            await transaction.commit();
            
            res.status(201).json({
                message: 'Message sent successfully',
                threadId: messageThreadId,
                messageId: insertResult.recordset[0].MessageID,
                content: insertResult.recordset[0].MessageContent,
                createdAt: insertResult.recordset[0].CreatedAt
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error(error);
        if (error.message === 'Not authorized to send message to this thread') {
            res.status(403).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Server Error' });
        }
    }
};

module.exports = {
    getAllThreads,
    getCustomerThread,
    getThreadMessages,
    sendMessage
};