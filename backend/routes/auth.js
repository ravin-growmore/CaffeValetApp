const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Driver/Supervisor/Admin Login
router.post('/login',
  [
    body('phone').isMobilePhone().withMessage('Invalid phone number'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone, password, role } = req.body;

      console.log('Login attempt:', { phone, role });

      // Find user by phone first, optionally filter by role if provided
      const query = { phone, isActive: true };
      if (role) {
        query.role = role;
      }
      
      const user = await User.findOne(query);
      if (!user) {
        console.log('User not found:', { phone, role });
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      console.log('User found:', { name: user.name, phone: user.phone, role: user.role });

      const isMatch = await user.comparePassword(password);
      console.log('Password match:', isMatch);
      
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Customer - Request OTP
router.post('/customer/request-otp',
  [
    body('phone').isMobilePhone().withMessage('Invalid phone number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone } = req.body;
      const otp = generateOTP();
      
      // Store OTP with 10 minute expiry
      otpStore.set(phone, {
        otp,
        expiry: Date.now() + 10 * 60 * 1000
      });

      // Send OTP via Email (primary)
      await emailService.sendOTP(phone, otp, 'Customer');

      // Send OTP via SMS (backup)
      await smsService.sendOTP(phone, otp);

      res.json({ message: 'OTP sent successfully', mock: !smsService.msg91Enabled });
    } catch (error) {
      console.error('OTP request error:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  }
);

// Customer - Verify OTP and Login
router.post('/customer/verify-otp',
  [
    body('phone').isMobilePhone().withMessage('Invalid phone number'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('Invalid OTP'),
    body('name').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone, otp, name } = req.body;

      // Verify OTP
      const storedOTP = otpStore.get(phone);
      if (!storedOTP || storedOTP.expiry < Date.now()) {
        return res.status(401).json({ message: 'OTP expired or invalid' });
      }

      if (storedOTP.otp !== otp) {
        return res.status(401).json({ message: 'Invalid OTP' });
      }

      // Clear OTP
      otpStore.delete(phone);

      // Find or create customer
      let user = await User.findOne({ phone, role: 'customer' });
      if (!user) {
        user = new User({
          phone,
          name: name || 'Customer',
          role: 'customer'
        });
        await user.save();
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role
        }
      });
    } catch (error) {
      console.error('OTP verification error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Customer - Token-based Auto Login
router.get('/customer/access/:token', async (req, res) => {
  try {
    const { token: accessToken } = req.params;
    const Booking = require('../models/Booking');

    // Find booking by access token
    const booking = await Booking.findOne({ accessToken });
    
    if (!booking) {
      return res.status(404).json({ message: 'Invalid or expired link' });
    }

    // Find or create customer user
    let user = await User.findOne({ 
      phone: booking.customer.phone, 
      role: 'customer' 
    });

    if (!user) {
      user = new User({
        name: booking.customer.name,
        phone: booking.customer.phone,
        role: 'customer',
        isActive: true
      });
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role
      },
      bookingId: booking._id
    });
  } catch (error) {
    console.error('Token login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').auth, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      phone: req.user.phone,
      role: req.user.role
    }
  });
});

module.exports = router;
