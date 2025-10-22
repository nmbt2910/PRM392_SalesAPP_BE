const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const signUp = async (req, res) => {
  const { username, password, email, phoneNumber, address, role } = req.body;

  if (!username || !password || !email || !role) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }

  try {
    const pool = await poolPromise;
    const userExists = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .query('SELECT UserID FROM Users WHERE Username = @username OR Email = @email');

    if (userExists.recordset.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('email', sql.NVarChar, email)
      .input('phoneNumber', sql.NVarChar, phoneNumber)
      .input('address', sql.NVarChar, address)
      .input('role', sql.NVarChar, role)
      .query(`INSERT INTO Users (Username, PasswordHash, Email, PhoneNumber, Address, Role)
              OUTPUT INSERTED.UserID, INSERTED.Username, INSERTED.PasswordHash, INSERTED.Email, INSERTED.PhoneNumber, INSERTED.Address, INSERTED.Role
              VALUES (@username, @passwordHash, @email, @phoneNumber, @address, @role)`);

    const newUser = result.recordset[0];

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        userID: newUser.UserID,
        username: newUser.Username,
        password: newUser.PasswordHash, // As per your Postman export
        email: newUser.Email,
        phoneNumber: newUser.PhoneNumber,
        address: newUser.Address,
        role: newUser.Role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during sign up' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT UserID, Username, PasswordHash, Role FROM Users WHERE Username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.recordset[0];
    const isMatch = await bcrypt.compare(password, user.PasswordHash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userID: user.UserID, username: user.Username, role: user.Role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      role: user.Role,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userID', sql.Int, req.user.userID)
      .query(`
        SELECT UserID, Username, Email, PhoneNumber, Address, Role, CreatedAt, UpdatedAt
        FROM Users 
        WHERE UserID = @userID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userProfile = result.recordset[0];
    res.json(userProfile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  const { email, phoneNumber, address, currentPassword, newPassword } = req.body;
  const userID = req.user.userID;

  try {
    const pool = await poolPromise;
    
    // First get the current user data
    const userResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query('SELECT PasswordHash FROM Users WHERE UserID = @userID');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Start building the update query
    let updateFields = [];
    let queryParams = {};

    if (email) {
      // Check if email is already taken by another user
      const emailCheck = await pool.request()
        .input('email', sql.NVarChar, email)
        .input('userID', sql.Int, userID)
        .query('SELECT UserID FROM Users WHERE Email = @email AND UserID != @userID');
      
      if (emailCheck.recordset.length > 0) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updateFields.push('Email = @email');
      queryParams.email = email;
    }

    if (phoneNumber) {
      updateFields.push('PhoneNumber = @phoneNumber');
      queryParams.phoneNumber = phoneNumber;
    }

    if (address) {
      updateFields.push('Address = @address');
      queryParams.address = address;
    }

    // Handle password update if provided
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, userResult.recordset[0].PasswordHash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      const newPasswordHash = await bcrypt.hash(newPassword, salt);
      updateFields.push('PasswordHash = @newPasswordHash');
      queryParams.newPasswordHash = newPasswordHash;
    } else if ((currentPassword && !newPassword) || (!currentPassword && newPassword)) {
      return res.status(400).json({ message: 'Both current and new password are required to update password' });
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Build and execute the update query
    const request = pool.request();
    request.input('userID', sql.Int, userID);
    
    // Add all parameters to the request
    for (const [key, value] of Object.entries(queryParams)) {
      request.input(key, sql.NVarChar, value);
    }

    const updateQuery = `
      UPDATE Users 
      SET ${updateFields.join(', ')}, UpdatedAt = GETDATE()
      OUTPUT 
        INSERTED.UserID,
        INSERTED.Username,
        INSERTED.Email,
        INSERTED.PhoneNumber,
        INSERTED.Address,
        INSERTED.Role,
        INSERTED.CreatedAt,
        INSERTED.UpdatedAt
      WHERE UserID = @userID
    `;

    const result = await request.query(updateQuery);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.recordset[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

module.exports = {
  signUp,
  login,
  getProfile,
  updateProfile,
};