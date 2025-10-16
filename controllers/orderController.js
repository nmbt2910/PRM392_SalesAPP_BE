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

module.exports = { createOrder };