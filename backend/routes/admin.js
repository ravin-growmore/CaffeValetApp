const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');
const { auth, authorize } = require('../middleware/auth');

// Get all supervisors (Admin only)
router.get('/supervisors', auth, authorize('admin'), async (req, res) => {
  try {
    const supervisors = await User.find({ role: 'supervisor' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ supervisors });
  } catch (error) {
    console.error('Get supervisors error:', error);
    res.status(500).json({ message: 'Failed to fetch supervisors' });
  }
});

// Get all drivers (Admin only)
router.get('/drivers', auth, authorize('admin'), async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' })
      .populate('supervisor', 'name phone')
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ drivers });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ message: 'Failed to fetch drivers' });
  }
});

// Create supervisor (Admin only)
router.post('/supervisors',
  auth,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').isMobilePhone().withMessage('Invalid phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, password } = req.body;

      // Check if supervisor already exists
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: 'User with this phone number already exists' });
      }

      const supervisor = new User({
        name,
        phone,
        password,
        role: 'supervisor'
      });

      await supervisor.save();

      res.status(201).json({
        message: 'Supervisor created successfully',
        supervisor: {
          _id: supervisor._id,
          name: supervisor.name,
          phone: supervisor.phone,
          role: supervisor.role
        }
      });
    } catch (error) {
      console.error('Create supervisor error:', error);
      res.status(500).json({ message: 'Failed to create supervisor' });
    }
  }
);

// Create driver (Admin only)
router.post('/drivers',
  auth,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').isMobilePhone().withMessage('Invalid phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('supervisorId').notEmpty().withMessage('Supervisor is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, password, supervisorId } = req.body;

      // Check if driver already exists
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: 'User with this phone number already exists' });
      }

      // Verify supervisor exists
      const supervisor = await User.findById(supervisorId);
      if (!supervisor || supervisor.role !== 'supervisor') {
        return res.status(400).json({ message: 'Invalid supervisor' });
      }

      const driver = new User({
        name,
        phone,
        password,
        role: 'driver',
        supervisor: supervisorId
      });

      await driver.save();
      await driver.populate('supervisor', 'name phone');

      res.status(201).json({
        message: 'Driver created successfully',
        driver: {
          _id: driver._id,
          name: driver.name,
          phone: driver.phone,
          role: driver.role,
          supervisor: driver.supervisor
        }
      });
    } catch (error) {
      console.error('Create driver error:', error);
      res.status(500).json({ message: 'Failed to create driver' });
    }
  }
);

// Update supervisor (Admin only)
router.put('/supervisors/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, phone, password, isActive } = req.body;
    const supervisor = await User.findById(req.params.id);

    if (!supervisor || supervisor.role !== 'supervisor') {
      return res.status(404).json({ message: 'Supervisor not found' });
    }

    if (name) supervisor.name = name;
    if (phone) supervisor.phone = phone;
    if (password) supervisor.password = password;
    if (typeof isActive !== 'undefined') supervisor.isActive = isActive;

    await supervisor.save();

    res.json({
      message: 'Supervisor updated successfully',
      supervisor: {
        _id: supervisor._id,
        name: supervisor.name,
        phone: supervisor.phone,
        role: supervisor.role,
        isActive: supervisor.isActive
      }
    });
  } catch (error) {
    console.error('Update supervisor error:', error);
    res.status(500).json({ message: 'Failed to update supervisor' });
  }
});

// Update driver (Admin only)
router.put('/drivers/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, phone, password, supervisorId, isActive } = req.body;
    const driver = await User.findById(req.params.id);

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (name) driver.name = name;
    if (phone) driver.phone = phone;
    if (password) driver.password = password;
    if (supervisorId) {
      const supervisor = await User.findById(supervisorId);
      if (!supervisor || supervisor.role !== 'supervisor') {
        return res.status(400).json({ message: 'Invalid supervisor' });
      }
      driver.supervisor = supervisorId;
    }
    if (typeof isActive !== 'undefined') driver.isActive = isActive;

    await driver.save();
    await driver.populate('supervisor', 'name phone');

    res.json({
      message: 'Driver updated successfully',
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        role: driver.role,
        supervisor: driver.supervisor,
        isActive: driver.isActive
      }
    });
  } catch (error) {
    console.error('Update driver error:', error);
    res.status(500).json({ message: 'Failed to update driver' });
  }
});
// Delete booking (Admin only)
router.delete('/bookings/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    await Booking.findByIdAndDelete(req.params.id);

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ message: 'Failed to delete booking' });
  }
});

// Delete supervisor (Admin only)
router.delete('/supervisors/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const supervisor = await User.findById(req.params.id);

    if (!supervisor || supervisor.role !== 'supervisor') {
      return res.status(404).json({ message: 'Supervisor not found' });
    }

    // Check if supervisor has assigned drivers
    const assignedDrivers = await User.countDocuments({ supervisor: req.params.id });
    if (assignedDrivers > 0) {
      return res.status(400).json({ 
        message: `Cannot delete supervisor. ${assignedDrivers} driver(s) are assigned to this supervisor.` 
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Supervisor deleted successfully' });
  } catch (error) {
    console.error('Delete supervisor error:', error);
    res.status(500).json({ message: 'Failed to delete supervisor' });
  }
});

// Delete driver (Admin only)
router.delete('/drivers/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const driver = await User.findById(req.params.id);

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if driver has active bookings
    const activeBookings = await Booking.countDocuments({ 
      driver: req.params.id,
      status: { $nin: ['completed', 'cancelled'] }
    });

    if (activeBookings > 0) {
      return res.status(400).json({ 
        message: `Cannot delete driver. ${activeBookings} active booking(s) exist.` 
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Driver deleted successfully' });
  } catch (error) {
    console.error('Delete driver error:', error);
    res.status(500).json({ message: 'Failed to delete driver' });
  }
});

// Get statistics (Admin only)
router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const totalSupervisors = await User.countDocuments({ role: 'supervisor' });
    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const activeSupervisors = await User.countDocuments({ role: 'supervisor', isActive: true });
    const activeDrivers = await User.countDocuments({ role: 'driver', isActive: true });
    const totalBookings = await Booking.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: { $nin: ['completed', 'cancelled'] } });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    const totalVenues = await Venue.countDocuments();
    const activeVenues = await Venue.countDocuments({ isActive: true });

    res.json({
      supervisors: { total: totalSupervisors, active: activeSupervisors },
      drivers: { total: totalDrivers, active: activeDrivers },
      bookings: { total: totalBookings, active: activeBookings, completed: completedBookings },
      venues: { total: totalVenues, active: activeVenues }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// ===== VENUE MANAGEMENT ROUTES =====

// Get all venues (Admin only)
router.get('/venues', auth, authorize('admin'), async (req, res) => {
  try {
    const venues = await Venue.find()
      .populate('supervisor', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ venues });
  } catch (error) {
    console.error('Get venues error:', error);
    res.status(500).json({ message: 'Failed to fetch venues' });
  }
});

// Create venue (Admin only)
router.post('/venues',
  auth,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Venue name is required'),
    body('requiresUpfrontPayment').isBoolean().withMessage('Payment setting is required'),
    body('supervisorId').optional()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, requiresUpfrontPayment, supervisorId, parkingSpots } = req.body;

      // Check if venue already exists
      const existingVenue = await Venue.findOne({ name: new RegExp(`^${name}$`, 'i') });
      if (existingVenue) {
        return res.status(400).json({ message: 'Venue with this name already exists' });
      }

      // If requires upfront payment, verify supervisor
      if (requiresUpfrontPayment && supervisorId) {
        const supervisor = await User.findById(supervisorId);
        if (!supervisor || supervisor.role !== 'supervisor') {
          return res.status(400).json({ message: 'Invalid supervisor' });
        }
      }

      const venue = new Venue({
        name,
        requiresUpfrontPayment,
        supervisor: requiresUpfrontPayment ? supervisorId : null,
        parkingSpots: parkingSpots && Array.isArray(parkingSpots) ? parkingSpots.filter(spot => spot.trim() !== '') : []
      });

      await venue.save();
      await venue.populate('supervisor', 'name phone');

      res.status(201).json({
        message: 'Venue created successfully',
        venue
      });
    } catch (error) {
      console.error('Create venue error:', error);
      res.status(500).json({ message: 'Failed to create venue' });
    }
  }
);

// Update venue (Admin only)
router.put('/venues/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, requiresUpfrontPayment, supervisorId, isActive, parkingSpots } = req.body;
    const venue = await Venue.findById(req.params.id);

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    if (name) venue.name = name;
    if (typeof requiresUpfrontPayment !== 'undefined') {
      venue.requiresUpfrontPayment = requiresUpfrontPayment;
    }
    
    if (requiresUpfrontPayment && supervisorId) {
      const supervisor = await User.findById(supervisorId);
      if (!supervisor || supervisor.role !== 'supervisor') {
        return res.status(400).json({ message: 'Invalid supervisor' });
      }
      venue.supervisor = supervisorId;
    } else if (!requiresUpfrontPayment) {
      venue.supervisor = null;
    }

    if (typeof isActive !== 'undefined') venue.isActive = isActive;
    if (parkingSpots && Array.isArray(parkingSpots)) {
      venue.parkingSpots = parkingSpots.filter(spot => spot.trim() !== '');
    }

    await venue.save();
    await venue.populate('supervisor', 'name phone');

    res.json({
      message: 'Venue updated successfully',
      venue
    });
  } catch (error) {
    console.error('Update venue error:', error);
    res.status(500).json({ message: 'Failed to update venue' });
  }
});

// Delete venue (Admin only)
router.delete('/venues/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    await Venue.findByIdAndDelete(req.params.id);

    res.json({ message: 'Venue deleted successfully' });
  } catch (error) {
    console.error('Delete venue error:', error);
    res.status(500).json({ message: 'Failed to delete venue' });
  }
});

// ===== NEW: LIVE RIDES (Admin only — all active bookings) =====
router.get('/live-rides', auth, authorize('admin'), async (req, res) => {
  try {
    const rides = await Booking.find({
      status: { $nin: ['completed', 'cancelled'] }
    })
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ rides, count: rides.length });
  } catch (error) {
    console.error('Live rides error:', error);
    res.status(500).json({ message: 'Failed to fetch live rides' });
  }
});

// ===== NEW: ALL BOOKINGS with search + filter + pagination (Admin only) =====
router.get('/all-bookings', auth, authorize('admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      status,
      search,
      from,
      to,
      sort = 'newest'
    } = req.query;

    const query = {};

    // Status filter
    if (status) {
      query.status = status;
    }

    // Date range filter
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Search by booking ID, customer name/phone
    if (search) {
      query.$or = [
        { bookingId: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
        { 'vehicle.number': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOrder = sort === 'oldest' ? 1 : -1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('driver', 'name phone')
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(parseInt(limit)),
      Booking.countDocuments(query)
    ]);

    res.json({ bookings, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('All bookings error:', error);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// ===== NEW: CUSTOMER RIDES — lookup by phone (Admin only) =====
router.get('/customer-rides', auth, authorize('admin'), async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const bookings = await Booking.find({ 'customer.phone': phone })
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 });

    // Try to get customer name from first booking
    const customerName = bookings.length > 0 ? bookings[0].customer?.name : null;

    // Also check if they exist as a registered customer
    const customerUser = await User.findOne({ phone, role: 'customer' }).select('name');

    res.json({
      customerName: customerUser?.name || customerName || null,
      phone,
      bookings,
      totalBookings: bookings.length,
      completedBookings: bookings.filter(b => b.status === 'completed').length,
      totalSpend: bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + (b.payment?.amount || 0), 0)
    });
  } catch (error) {
    console.error('Customer rides error:', error);
    res.status(500).json({ message: 'Failed to fetch customer rides' });
  }
});

// ===== NEW: REVENUE STATS (Admin only) =====
router.get('/revenue-stats', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [todayRev, weekRev, monthRev, totalRev] = await Promise.all([
      Booking.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: todayStart }, 'payment.amount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: weekStart }, 'payment.amount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: monthStart }, 'payment.amount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { status: 'completed', 'payment.amount': { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
      ])
    ]);

    // Payment method breakdown (all time)
    const paymentBreakdown = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$payment.method', total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }
    ]);

    res.json({
      today:   { amount: todayRev[0]?.total || 0,  count: todayRev[0]?.count || 0 },
      week:    { amount: weekRev[0]?.total || 0,   count: weekRev[0]?.count || 0 },
      month:   { amount: monthRev[0]?.total || 0,  count: monthRev[0]?.count || 0 },
      allTime: { amount: totalRev[0]?.total || 0,  count: totalRev[0]?.count || 0 },
      paymentBreakdown: paymentBreakdown.reduce((acc, item) => {
        acc[item._id || 'unknown'] = { amount: item.total, count: item.count };
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Revenue stats error:', error);
    res.status(500).json({ message: 'Failed to fetch revenue stats' });
  }
});

module.exports = router;

