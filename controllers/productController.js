const { poolPromise, sql } = require('../config/db');

// @desc    Fetch all products with filtering and sorting
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
    try {
        const { category, sortBy, priceMin, priceMax } = req.query;
        const pool = await poolPromise;

        let query = 'SELECT p.*, c.CategoryName FROM Products p LEFT JOIN Categories c ON p.CategoryID = c.CategoryID';
        let conditions = [];
        const request = pool.request();

        if (category) {
            conditions.push('c.CategoryName = @category');
            request.input('category', sql.NVarChar, category);
        }
        if (priceMin) {
            conditions.push('p.Price >= @priceMin');
            request.input('priceMin', sql.Decimal, priceMin);
        }
        if (priceMax) {
            conditions.push('p.Price <= @priceMax');
            request.input('priceMax', sql.Decimal, priceMax);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        if (sortBy === 'price_asc') {
            query += ' ORDER BY p.Price ASC';
        } else if (sortBy === 'price_desc') {
            query += ' ORDER BY p.Price DESC';
        } // Add more sorting options as needed

        const result = await request.query(query);
        res.json(result.recordset);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Fetch a single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('productID', sql.Int, req.params.id)
            .query('SELECT p.*, c.CategoryName FROM Products p LEFT JOIN Categories c ON p.CategoryID = c.CategoryID WHERE p.ProductID = @productID');

        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
    const {
        productName,
        briefDescription,
        fullDescription,
        technicalSpecifications,
        price,
        imageURL,
        categoryID
    } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('productName', sql.NVarChar, productName)
            .input('briefDescription', sql.NVarChar, briefDescription)
            .input('fullDescription', sql.NVarChar, fullDescription)
            .input('technicalSpecifications', sql.NVarChar, technicalSpecifications)
            .input('price', sql.Decimal(18, 2), price)
            .input('imageURL', sql.NVarChar, imageURL)
            .input('categoryID', sql.Int, categoryID)
            .query(`INSERT INTO Products (ProductName, BriefDescription, FullDescription, TechnicalSpecifications, Price, ImageURL, CategoryID)
                    OUTPUT INSERTED.*
                    VALUES (@productName, @briefDescription, @fullDescription, @technicalSpecifications, @price, @imageURL, @categoryID)`);

        res.status(201).json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
};