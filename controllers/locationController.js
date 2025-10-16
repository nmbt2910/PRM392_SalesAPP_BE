const { poolPromise, sql } = require('../config/db');

// @desc    Get all store locations
// @route   GET /api/locations
// @access  Private
const getLocations = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM StoreLocations');
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Add a new store location
// @route   POST /api/locations
// @access  Private
const addLocation = async (req, res) => {
    const { Latitude, Longitude, Address } = req.body;

    // Validation
    if (!Latitude || !Longitude || !Address) {
        return res.status(400).json({ message: 'Please provide Latitude, Longitude, and Address.' });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('latitude', sql.Decimal(9, 6), Latitude)
            .input('longitude', sql.Decimal(9, 6), Longitude)
            .input('address', sql.NVarChar(255), Address)
            .query('INSERT INTO StoreLocations (Latitude, Longitude, Address) VALUES (@latitude, @longitude, @address)');
        
        res.status(201).json({ message: 'Location added successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update a store location
// @route   PUT /api/locations/:id
// @access  Private
const updateLocation = async (req, res) => {
    const { id } = req.params;
    const { Latitude, Longitude, Address } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('latitude', sql.Decimal(9, 6), Latitude)
            .input('longitude', sql.Decimal(9, 6), Longitude)
            .input('address', sql.NVarChar(255), Address)
            .query('UPDATE StoreLocations SET Latitude = @latitude, Longitude = @longitude, Address = @address WHERE LocationID = @id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Location not found' });
        }
        
        res.status(200).json({ message: 'Location updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a store location
// @route   DELETE /api/locations/:id
// @access  Private
const deleteLocation = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM StoreLocations WHERE LocationID = @id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Location not found' });
        }

        res.status(200).json({ message: 'Location deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getLocations, addLocation, updateLocation, deleteLocation };