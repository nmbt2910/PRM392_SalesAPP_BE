const { poolPromise, sql } = require('../config/db');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
    const { paymentMethod, billingAddress } = req.body;
    const userID = req.user.userID;

    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        // Find the user's active cart
        const cartResult = await request
            .input('userID', sql.Int, userID)
            .query('SELECT CartID, TotalPrice FROM Carts WHERE UserID = @userID AND Status = \'active\'');

        if (cartResult.recordset.length === 0 || cartResult.recordset[0].TotalPrice <= 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'No items in cart to order' });
        }
        
        const { CartID, TotalPrice } = cartResult.recordset[0];

        // Create the order
        const orderResult = await request
            .input('cartID', sql.Int, CartID)
            .input('paymentMethod', sql.NVarChar, paymentMethod)
            .input('billingAddress', sql.NVarChar, billingAddress)
            .input('orderStatus', sql.NVarChar, 'Pending') // Initial status
            .query(`INSERT INTO Orders (CartID, UserID, PaymentMethod, BillingAddress, OrderStatus)
                    OUTPUT INSERTED.OrderID
                    VALUES (@cartID, @userID, @paymentMethod, @billingAddress, @orderStatus)`);
        
        const orderID = orderResult.recordset[0].OrderID;

        // Create a payment record
        await request
            .input('orderID', sql.Int, orderID)
            .input('amount', sql.Decimal, TotalPrice)
            .input('paymentStatus', sql.NVarChar, 'Pending') // Payment status from gateway
            .query('INSERT INTO Payments (OrderID, Amount, PaymentStatus) VALUES (@orderID, @amount, @paymentStatus)');

        // Mark the cart as processed
        await request
            .query('UPDATE Carts SET Status = \'processed\' WHERE CartID = @cartID');

        await transaction.commit();

        res.status(201).json({ message: 'Order created successfully', orderId: orderID });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getAllOrders = async (req, res) => {
    const userID = req.user.userID;

    try {
        const pool = await poolPromise;
        const request = new sql.Request(pool);

        // Query all orders for the user
        const ordersResult = await request
            .input('userID', sql.Int, userID)
            .query(`
                SELECT 
                    OrderID, CartID, PaymentMethod, BillingAddress, OrderStatus, OrderDate
                FROM Orders
                WHERE UserID = @userID
                ORDER BY OrderDate DESC
            `);

        res.status(200).json(ordersResult.recordset);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get details of a specific order
// @route   GET /api/orders/:orderID
// @access  Private
const getOrderDetails = async (req, res) => {
    // prefer param first, fallback to query for backward-compat
    const orderID = req.params.orderID || req.query.orderID;
    const userID = req.user && req.user.userID;

    if (!orderID) {
        console.warn('getOrderDetails: missing orderID, req.params=', req.params, 'req.query=', req.query);
        return res.status(400).json({ message: 'orderID is required' });
    }

    const orderIdNum = parseInt(orderID, 10);
    if (isNaN(orderIdNum)) {
        return res.status(400).json({ message: 'orderID must be a number' });
    }

    try {
        const pool = await poolPromise;

        // Query order details
        const request = new sql.Request(pool);
        const orderResult = await request
            .input('orderID', sql.Int, orderIdNum)
            .input('userID', sql.Int, userID)
            .query(`
                SELECT 
                    o.OrderID, 
                    o.CartID, 
                    o.PaymentMethod, 
                    o.BillingAddress, 
                    o.OrderStatus, 
                    o.OrderDate,
                    p.Amount AS PaymentAmount, 
                    p.PaymentStatus
                FROM Orders o
                LEFT JOIN Payments p ON o.OrderID = p.OrderID
                WHERE o.OrderID = @orderID AND o.UserID = @userID
            `);

        if (!orderResult.recordset || orderResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const orderDetails = orderResult.recordset[0];

        // If CartID missing, skip cart items query
        if (orderDetails.CartID) {
            const cartRequest = new sql.Request(pool);
            const cartItemsResult = await cartRequest
                .input('cartID', sql.Int, orderDetails.CartID)
                .query(`
                    SELECT 
                        ProductID, Quantity, Price
                    FROM CartItems
                    WHERE CartID = @cartID
                `);
            orderDetails.cartItems = cartItemsResult.recordset || [];
        } else {
            orderDetails.cartItems = [];
        }

        res.status(200).json(orderDetails);

    } catch (error) {
        console.error('getOrderDetails error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
module.exports = { createOrder, getAllOrders, getOrderDetails };