const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID_HERE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET_HERE'
});

// POST /api/payment/create-order
// Creates a Razorpay order for the given amount (in rupees)
// Accessible without auth (customer fills QR form without logging in)
router.post('/create-order', async (req, res) => {
  try {
    const { amount = 150, currency = 'INR', notes = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes
    };

    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'rzp_test_YOUR_KEY_ID_HERE' || process.env.RAZORPAY_KEY_SECRET === 'YOUR_KEY_SECRET_HERE') {
      console.log('⚠️ Using Mock Razorpay Order Creation (No valid keys found)');
      return res.json({
        orderId: `mock_order_${Date.now()}`,
        amount: Math.round(amount * 100),
        currency,
        keyId: 'mock_key'
      });
    }

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID_HERE'
    });
  } catch (error) {
    console.error('Razorpay create-order error:', error);
    res.status(500).json({ message: 'Failed to create payment order', error: error.message });
  }
});

// POST /api/payment/verify
// Verifies a Razorpay payment signature
// Used by frontend after payment modal closes
router.post('/verify', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    if (razorpay_order_id && razorpay_order_id.startsWith('mock_order_')) {
      console.log('⚠️ Verifying Mock Razorpay Order:', razorpay_order_id);
      return res.json({ success: true, paymentId: `mock_pay_${Date.now()}` });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET_HERE';
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('Razorpay signature mismatch');
      return res.status(400).json({ success: false, message: 'Payment verification failed — invalid signature' });
    }

    res.json({ success: true, paymentId: razorpay_payment_id });
  } catch (error) {
    console.error('Razorpay verify error:', error);
    res.status(500).json({ success: false, message: 'Payment verification error' });
  }
});

// POST /api/payment/webhook
// ─────────────────────────────────────────────────────────────────────────────
// Called by Razorpay SERVER-TO-SERVER after payment.captured event fires.
// This is the SAFETY NET: creates the booking even if the customer closed
// their browser right after paying (before the JS handler ran).
//
// Setup required in Razorpay Dashboard:
//   Webhook URL  →  https://your-domain.com/api/payment/webhook
//   Events       →  payment.captured
//   Secret       →  set as RAZORPAY_WEBHOOK_SECRET in .env
//
// IMPORTANT: express.raw({ type: 'application/json' }) is registered in server.js
// BEFORE express.json() so req.body arrives here as a raw Buffer, not a parsed Object.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret) {
      // Verify Razorpay webhook signature using the raw body buffer
      const receivedSig = req.headers['x-razorpay-signature'];
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body) // raw Buffer — NOT parsed JSON
        .digest('hex');

      if (receivedSig !== expectedSig) {
        console.error('Webhook: invalid signature — possible spoofed request');
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }
    } else {
      console.warn('⚠️ RAZORPAY_WEBHOOK_SECRET not set — skipping signature check (not safe for production)');
    }

    const event = JSON.parse(req.body.toString());
    console.log('📦 Razorpay Webhook event:', event.event);

    // Only handle successful payment captures
    if (event.event !== 'payment.captured') {
      return res.json({ received: true, action: 'ignored', event: event.event });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return res.json({ received: true, action: 'no-payment-entity' });
    }

    const { order_id: razorpayOrderId, id: razorpayPaymentId, notes } = payment;

    // Booking details were embedded in the order notes at create-order time
    const { driverPhone, customerPhone, customerName, vehicleNumber, paymentAmount } = notes || {};

    if (!driverPhone || !customerPhone || !vehicleNumber) {
      console.warn('Webhook: missing booking details in order notes:', notes);
      return res.json({ received: true, action: 'missing-notes' });
    }

    const Booking = require('../models/Booking');
    const User = require('../models/User');

    // ── Deduplication ─────────────────────────────────────────────────────────
    // If the browser succeeded and already created the booking, skip.
    const existing = await Booking.findOne({ 'payment.razorpay.orderId': razorpayOrderId });
    if (existing) {
      console.log(`Webhook: booking already exists for order ${razorpayOrderId} → ${existing.bookingId} (skipping)`);
      return res.json({ received: true, action: 'duplicate-skipped', bookingId: existing.bookingId });
    }

    // Find driver by phone number
    const driver = await User.findOne({ phone: driverPhone, role: 'driver' });
    if (!driver) {
      console.error('Webhook: no driver found for phone:', driverPhone);
      return res.json({ received: true, action: 'driver-not-found' });
    }

    const resolvedName = (customerName && customerName.trim()) ? customerName.trim() : customerPhone;
    const parsedAmount = parseFloat(paymentAmount) || (payment.amount / 100);

    const booking = new Booking({
      driver: driver._id,
      customer: { phone: customerPhone, name: resolvedName, email: null },
      vehicle: {
        type: 'car',
        number: vehicleNumber.toUpperCase(),
        images: [],
        hasValuables: false,
        valuables: []
      },
      location: { venue: '', parkingSpot: '' },
      notes: 'Created via Razorpay webhook (customer closed browser after payment)',
      payment: {
        method: 'razorpay',
        amount: parsedAmount,
        status: 'completed',
        paidAt: new Date(),
        razorpay: {
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
          signature: '' // webhook doesn't carry the frontend sig; identity is verified via webhook secret
        }
      },
      paymentStatus: 'paid',
      status: 'parked'
    });

    await booking.save();
    await booking.populate('driver', 'name phone');

    console.log(`✅ Webhook booking created: ${booking.bookingId} | ${customerPhone} | ${vehicleNumber}`);

    // Notify supervisor dashboard via socket (best-effort)
    try {
      const app = require('../server');
      const io = app?.get?.('io');
      if (io) io.to('supervisors').emit('new-booking', { booking: booking.toObject() });
    } catch (_) { }

    // Send SMS confirmation (best-effort)
    try {
      const smsService = require('../services/smsService');
      const accessLink = `${process.env.FRONTEND_URL || 'https://caffequattrovaletapp.onrender.com'}/customer/access/${booking.accessToken}`;
      await smsService.sendBookingConfirmation(customerPhone, booking.bookingId, accessLink);
    } catch (smsErr) {
      console.warn('Webhook: SMS failed:', smsErr.message);
    }

    // Send WhatsApp confirmation (best-effort)
    try {
      const whatsappService = require('../services/whatsappService');
      await whatsappService.sendBookingConfirmation(customerPhone, resolvedName, booking.bookingId, booking.accessToken);
    } catch (waErr) {
      console.warn('Webhook: WhatsApp failed:', waErr.message);
    }

    res.json({ received: true, action: 'booking-created', bookingId: booking.bookingId });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Always respond 200 so Razorpay doesn't retry indefinitely
    res.status(200).json({ received: true, action: 'error', message: error.message });
  }
});

module.exports = router;
