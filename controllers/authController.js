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
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

module.exports = {
  signUp,
  login,
};