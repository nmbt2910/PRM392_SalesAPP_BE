const express = require('express');
const router = express.Router();
const { getLocations, addLocation, updateLocation, deleteLocation } = require('../controllers/locationController');
const { protect } = require('../middleware/authMiddleware');

// All location routes are protected
router.use(protect); 

router.route('/')
    .get(getLocations)
    .post(addLocation);

router.route('/:id')
    .put(updateLocation)
    .delete(deleteLocation);

module.exports = router;