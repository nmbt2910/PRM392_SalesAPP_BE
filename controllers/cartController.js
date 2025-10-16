const { poolPromise, sql } = require('../config/db');

// Helper function to get or create a cart for a user
const getOrCreateCart = async (userID, pool) => {
    let cartResult = await pool.request()
        .input('userID', sql.Int, userID)
        .query('SELECT CartID FROM Carts WHERE UserID = @userID AND Status = \'active\'');

    if (cartResult.recordset.length > 0) {
        return cartResult.recordset[0].CartID;
    } else {
        const newCart = await pool.request()
            .input('userID', sql.Int, userID)
            .input('initialPrice', sql.Decimal(18, 2), 0.00)
            .input('status', sql.NVarChar(50), 'active')
            .query('INSERT INTO Carts (UserID, TotalPrice, Status) OUTPUT INSERTED.CartID VALUES (@userID, @initialPrice, @status)');
        
        return newCart.recordset[0].CartID;
    }
};

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
    try {
        const pool = await poolPromise;
        const cartID = await getOrCreateCart(req.user.userID, pool);

        const cartItems = await pool.request()
            .input('cartID', sql.Int, cartID)
            .query(`SELECT ci.CartItemID, p.ProductID, p.ProductName, p.ImageURL, ci.Quantity, ci.Price
                    FROM CartItems ci
                    JOIN Products p ON ci.ProductID = p.ProductID
                    WHERE ci.CartID = @cartID`);
        
        const cartTotalResult = await pool.request()
            .input('cartID', sql.Int, cartID)
            .query('SELECT TotalPrice FROM Carts WHERE CartID = @cartID');

        res.json({
            items: cartItems.recordset,
            totalPrice: cartTotalResult.recordset[0]?.TotalPrice || 0,
            itemCount: cartItems.recordset.reduce((acc, item) => acc + item.Quantity, 0)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Add item to cart
// @route   POST /api/cart/items
// @access  Private
const addItemToCart = async (req, res) => {
    const { productID, quantity } = req.body;
    
    try {
        const pool = await poolPromise;
        const cartID = await getOrCreateCart(req.user.userID, pool);
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('productID', sql.Int, productID);
        request.input('cartID', sql.Int, cartID);

        const productResult = await request
            .query('SELECT Price FROM Products WHERE ProductID = @productID');
        
        if(productResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Product not found' });
        }
        const productPrice = productResult.recordset[0].Price;

        const existingItem = await request
            .query('SELECT CartItemID, Quantity FROM CartItems WHERE CartID = @cartID AND ProductID = @productID');

        if (existingItem.recordset.length > 0) {
            const newQuantity = existingItem.recordset[0].Quantity + quantity;
            await request
                .input('newQuantity', sql.Int, newQuantity)
                .input('cartItemID', sql.Int, existingItem.recordset[0].CartItemID)
                .query('UPDATE CartItems SET Quantity = @newQuantity WHERE CartItemID = @cartItemID');
        } else {
            await request
                .input('quantity', sql.Int, quantity)
                .input('price', sql.Decimal, productPrice)
                .query('INSERT INTO CartItems (CartID, ProductID, Quantity, Price) VALUES (@cartID, @productID, @quantity, @price)');
        }

        await request
            .query(`UPDATE Carts SET TotalPrice = (SELECT SUM(Quantity * Price) FROM CartItems WHERE CartID = @cartID) WHERE CartID = @cartID`);
        
        await transaction.commit();

        res.status(201).json({ message: 'Item added to cart' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update item quantity in cart
// @route   PUT /api/cart/items/:itemId
// @access  Private
const updateCartItem = async (req, res) => {
    const { itemId } = req.params;
    const { quantity } = req.body;

    // Check for valid quantity
    if (quantity === undefined || quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    try {
        const pool = await poolPromise;
        const cartID = await getOrCreateCart(req.user.userID, pool);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('cartItemID', sql.Int, itemId);
        request.input('cartID', sql.Int, cartID);

        // Verify the item belongs to the user's active cart
        const itemResult = await request
            .query('SELECT CartItemID FROM CartItems WHERE CartItemID = @cartItemID AND CartID = @cartID');
        
        if (itemResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Cart item not found' });
        }

        await request
            .input('newQuantity', sql.Int, quantity)
            .query('UPDATE CartItems SET Quantity = @newQuantity WHERE CartItemID = @cartItemID');
        
        await request
            .query(`UPDATE Carts SET TotalPrice = (SELECT SUM(Quantity * Price) FROM CartItems WHERE CartID = @cartID) WHERE CartID = @cartID`);
        
        await transaction.commit();

        res.json({ message: 'Cart item updated' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:itemId
// @access  Private
const removeCartItem = async (req, res) => {
    const { itemId } = req.params;

    try {
        const pool = await poolPromise;
        const cartID = await getOrCreateCart(req.user.userID, pool);
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('cartItemID', sql.Int, itemId);
        request.input('cartID', sql.Int, cartID);

        // Verify the item belongs to the user's active cart
        const itemResult = await request
            .query('SELECT CartItemID FROM CartItems WHERE CartItemID = @cartItemID AND CartID = @cartID');
        
        if (itemResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Cart item not found' });
        }

        await request
            .query('DELETE FROM CartItems WHERE CartItemID = @cartItemID');
        
        await request
            .query(`UPDATE Carts SET TotalPrice = (SELECT ISNULL(SUM(Quantity * Price), 0) FROM CartItems WHERE CartID = @cartID) WHERE CartID = @cartID`);
        
        await transaction.commit();

        res.json({ message: 'Cart item removed' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getCart, addItemToCart, updateCartItem, removeCartItem };