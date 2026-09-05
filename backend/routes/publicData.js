const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const User = require('../models/User');
const Venue = require('../models/Venue');

// ─────────────────────────────────────────────────────────────────────────────
// API-KEY Middleware
// All routes in this file are protected by an X-API-KEY header.
// The key is validated against the PUBLIC_DATA_API_KEY environment variable.
//
// Response codes:
//   503 — PUBLIC_DATA_API_KEY is not configured on the server
//   401 — key is missing or does not match
// ─────────────────────────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const serverKey = process.env.PUBLIC_DATA_API_KEY;

  if (!serverKey) {
    console.error('[public-data] PUBLIC_DATA_API_KEY is not set — refusing all requests');
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Integration API is not configured on this server.'
    });
  }

  const clientKey = req.headers['x-api-key'];
  if (!clientKey || clientKey !== serverKey) {
    console.warn(`[public-data] Unauthorized request from ${req.ip} — invalid or missing X-API-KEY`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid X-API-KEY header.'
    });
  }

  next();
}

// Apply API-KEY guard to every route in this router
router.use(requireApiKey);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a Date at the very start of today (00:00:00.000) in local time */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parses a query string value into a safe integer with optional min/max clamp */
function parseIntParam(val, defaultVal, min, max) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return defaultVal;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/health
// Simple liveness + DB connectivity check for the Admin Panel to poll.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    // Cheap DB ping: count documents without full collection scan
    await Booking.estimatedDocumentCount();
    return res.json({
      status: 'OK',
      app: process.env.APP_NAME || 'CaffeValet',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[public-data/health] DB error:', err.message);
    return res.status(503).json({
      status: 'ERROR',
      app: process.env.APP_NAME || 'CaffeValet',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/summary
// High-level KPI snapshot — today's stats plus all-time totals.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const todayStart = startOfToday();

    const [allTimeAgg, todayAgg, activeCount, statusBreakdown, paymentMethodBreakdown] =
      await Promise.all([
        // All-time: total bookings + total revenue (paid bookings only)
        Booking.aggregate([
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalRevenue: {
                $sum: {
                  $cond: [{ $eq: ['$payment.status', 'completed'] }, { $ifNull: ['$payment.amount', 0] }, 0]
                }
              }
            }
          }
        ]),

        // Today only
        Booking.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              todayBookings: { $sum: 1 },
              todayRevenue: {
                $sum: {
                  $cond: [{ $eq: ['$payment.status', 'completed'] }, { $ifNull: ['$payment.amount', 0] }, 0]
                }
              }
            }
          }
        ]),

        // Active bookings (not completed / cancelled)
        Booking.countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),

        // Status breakdown (all-time)
        Booking.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),

        // Payment method breakdown (paid bookings only, all-time)
        Booking.aggregate([
          { $match: { 'payment.status': 'completed' } },
          {
            $group: {
              _id: '$payment.method',
              count: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$payment.amount', 0] } }
            }
          },
          { $sort: { revenue: -1 } }
        ])
      ]);

    const allTime = allTimeAgg[0] || { totalBookings: 0, totalRevenue: 0 };
    const today   = todayAgg[0]   || { todayBookings: 0, todayRevenue: 0 };

    return res.json({
      allTime: {
        totalBookings: allTime.totalBookings,
        totalRevenue:  allTime.totalRevenue
      },
      today: {
        bookings: today.todayBookings,
        revenue:  today.todayRevenue
      },
      activeBookings: activeCount,
      statusBreakdown: statusBreakdown.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
      paymentMethodBreakdown: paymentMethodBreakdown.map(p => ({
        method:  p._id || 'unknown',
        count:   p.count,
        revenue: p.revenue
      })),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[public-data/summary] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/bookings
// Paginated booking list with optional date-range + status filters.
//
// Query params:
//   from    — ISO date string (inclusive)
//   to      — ISO date string (inclusive, clamped to end of day)
//   status  — booking status, or comma-separated list e.g. parked,completed
//   page    — page number, default 1
//   limit   — results per page, default 20, max 100
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bookings', async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const page  = parseIntParam(req.query.page,  1,  1);
    const limit = parseIntParam(req.query.limit, 20, 1, 100);
    const skip  = (page - 1) * limit;

    const query = {};

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('driver', 'name phone')
        .select('-verification -accessToken -__v'),
      Booking.countDocuments(query)
    ]);

    return res.json({
      bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('[public-data/bookings] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/revenue
// Detailed revenue analytics with time-series breakdown.
//
// Query params:
//   from  — ISO date string (default: start of today)
//   to    — ISO date string (default: now)
//
// Granularity auto-selection:
//   range <= 3 days  → hourly breakdown
//   range >  3 days  → daily breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revenue', async (req, res) => {
  try {
    const fromDate = req.query.from ? new Date(req.query.from) : startOfToday();
    const toDate   = req.query.to   ? new Date(req.query.to)   : new Date();

    // Clamp to end of day when a bare date string is provided
    if (req.query.to) toDate.setHours(23, 59, 59, 999);

    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    const useHourly = diffDays <= 3;

    const baseMatch = {
      $match: {
        'payment.status': 'completed',
        createdAt: { $gte: fromDate, $lte: toDate }
      }
    };

    const timeGroupId = useHourly
      ? {
          year:  { $year:  '$createdAt' },
          month: { $month: '$createdAt' },
          day:   { $dayOfMonth: '$createdAt' },
          hour:  { $hour:  '$createdAt' }
        }
      : {
          year:  { $year:  '$createdAt' },
          month: { $month: '$createdAt' },
          day:   { $dayOfMonth: '$createdAt' }
        };

    const [summaryAgg, methodAgg, statusAgg, timeSeriesAgg] = await Promise.all([
      // Overall totals for the range
      Booking.aggregate([
        baseMatch,
        {
          $group: {
            _id: null,
            totalRevenue:  { $sum: { $ifNull: ['$payment.amount', 0] } },
            totalBookings: { $sum: 1 },
            avgTicket:     { $avg: { $ifNull: ['$payment.amount', 0] } }
          }
        }
      ]),

      // Revenue split by payment method
      Booking.aggregate([
        baseMatch,
        {
          $group: {
            _id:     '$payment.method',
            revenue: { $sum: { $ifNull: ['$payment.amount', 0] } },
            count:   { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } }
      ]),

      // Payment status split (across ALL bookings in range, not just paid)
      Booking.aggregate([
        { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
        {
          $group: {
            _id:     '$payment.status',
            count:   { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$payment.amount', 0] } }
          }
        }
      ]),

      // Time-series (paid bookings only)
      Booking.aggregate([
        baseMatch,
        {
          $group: {
            _id:     timeGroupId,
            revenue: { $sum: { $ifNull: ['$payment.amount', 0] } },
            count:   { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ])
    ]);

    const summary = summaryAgg[0] || { totalRevenue: 0, totalBookings: 0, avgTicket: 0 };

    const timeSeries = timeSeriesAgg.map(entry => {
      const { year, month, day, hour } = entry._id;
      const label = useHourly
        ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:00`
        : `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      return { period: label, revenue: entry.revenue, bookings: entry.count };
    });

    return res.json({
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      granularity: useHourly ? 'hourly' : 'daily',
      summary: {
        totalRevenue:  summary.totalRevenue,
        totalBookings: summary.totalBookings,
        avgTicketSize: Math.round((summary.avgTicket || 0) * 100) / 100
      },
      byPaymentMethod: methodAgg.map(m => ({
        method:  m._id || 'unknown',
        revenue: m.revenue,
        count:   m.count
      })),
      byPaymentStatus: statusAgg.map(s => ({
        status:  s._id || 'unknown',
        count:   s.count,
        revenue: s.revenue
      })),
      timeSeries,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[public-data/revenue] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/users
// Returns all operational staff (drivers, supervisors, managers) with
// today's booking count annotated per driver.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const todayStart = startOfToday();

    const [staff, todayBookingCounts] = await Promise.all([
      User.find({ role: { $in: ['driver', 'supervisor', 'manager'] } })
        .select('-password -__v')
        .populate('supervisor', 'name phone')
        .populate('manager', 'name phone')
        .populate('venue', 'name')
        .lean(),

      // Count today's bookings per driver ObjectId
      Booking.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        { $group: { _id: '$driver', count: { $sum: 1 } } }
      ])
    ]);

    // Build lookup map: driverId → count
    const countMap = todayBookingCounts.reduce((acc, entry) => {
      acc[entry._id.toString()] = entry.count;
      return acc;
    }, {});

    const annotated = staff.map(user => ({
      ...user,
      // Only drivers get a meaningful booking count; others get null
      todayBookings: user.role === 'driver' ? (countMap[user._id.toString()] || 0) : null
    }));

    return res.json({
      total: staff.length,
      drivers:     annotated.filter(u => u.role === 'driver'),
      supervisors: annotated.filter(u => u.role === 'supervisor'),
      managers:    annotated.filter(u => u.role === 'manager'),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[public-data/users] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public-data/venues
// Returns all venues enriched with fee settings, parking spots,
// and today's revenue + booking count.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/venues', async (req, res) => {
  try {
    const todayStart = startOfToday();

    const [venues, todayVenueStats] = await Promise.all([
      Venue.find({})
        .populate('supervisor', 'name phone')
        .lean(),

      // Today's revenue grouped by location.venue (stored as a string name)
      Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: todayStart },
            'payment.status': 'completed'
          }
        },
        {
          $group: {
            _id:           '$location.venue',
            todayRevenue:  { $sum: { $ifNull: ['$payment.amount', 0] } },
            todayBookings: { $sum: 1 }
          }
        }
      ])
    ]);

    // Build lookup by venue name string
    const statsMap = todayVenueStats.reduce((acc, s) => {
      if (s._id) acc[s._id] = { revenue: s.todayRevenue, bookings: s.todayBookings };
      return acc;
    }, {});

    const enriched = venues.map(venue => ({
      ...venue,
      totalParkingSpots: (venue.parkingSpots || []).length,
      todayRevenue:  (statsMap[venue.name] || {}).revenue  || 0,
      todayBookings: (statsMap[venue.name] || {}).bookings || 0
    }));

    return res.json({
      total: venues.length,
      venues: enriched,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[public-data/venues] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

module.exports = router;
