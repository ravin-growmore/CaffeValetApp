const axios = require('axios');

/**
 * ChatMitra WhatsApp Service — Cafe Quattro Valet
 * Sends WhatsApp template messages via ChatMitra API.
 * Falls back to MOCK mode if CHATMITRA_API_KEY or CHATMITRA_API_URL are not set.
 *
 * ⚠ IMPORTANT: The template names below must be created and approved in
 *   your ChatMitra dashboard before they will work in production.
 */
class WhatsAppService {
  constructor() {
    this.enabled = !!(
      process.env.CHATMITRA_API_KEY &&
      process.env.CHATMITRA_API_URL
    );

    if (this.enabled) {
      this.apiKey = process.env.CHATMITRA_API_KEY;
      this.apiUrl = process.env.CHATMITRA_API_URL;
      console.log('✓ ChatMitra WhatsApp Service initialized');
    } else {
      console.log('⚠ WhatsApp Service running in MOCK mode (CHATMITRA_API_KEY not configured)');
    }
  }

  /**
   * Format phone number to international format required by ChatMitra
   * e.g. "9876543210" → "919876543210"
   */
  _formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  }

  /**
   * Core method — sends any approved template message.
   * @param {string} phone         - Recipient phone number (10 digits or with 91)
   * @param {string} templateName  - Exact template name as saved in ChatMitra dashboard
   * @param {string[]} variables   - Array of variable values in order: {{1}}, {{2}}, ...
   */
  async sendTemplate(phone, templateName, variables = []) {
    const to = this._formatPhone(phone);

    if (this.enabled) {
      try {
        const payload = {
          recipient_mobile_number: to,
          customer_name: 'Customer',
          messages: [{
            kind: 'template',
            template: {
              name: templateName,
              language: 'en_US',
              components: variables.length > 0
                ? [{
                  type: 'body',
                  parameters: variables.map(v => ({ type: 'text', text: String(v) }))
                }]
                : []
            }
          }]
        };

        const response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`✓ WhatsApp [${templateName}] sent to ${phone}:`, response.data?.id || 'ok');
        return { success: true, data: response.data };
      } catch (error) {
        const errData = error.response?.data || error.message;
        console.error(`✗ WhatsApp [${templateName}] to ${phone} failed:`, errData);
        return { success: false, error: errData };
      }
    } else {
      // ── MOCK mode ──────────────────────────────────────────────
      console.log('\n📲 MOCK WhatsApp:');
      console.log(`   To       : ${to}`);
      console.log(`   Template : ${templateName}`);
      if (variables.length) {
        variables.forEach((v, i) => console.log(`   {{${i + 1}}}     : ${v}`));
      }
      console.log('─────────────────────────────\n');
      return { success: true, mock: true };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HIGH-LEVEL METHODS  (one per notification type)
  // ─────────────────────────────────────────────────────────────

  /**
   * Template: Cafe_Quattro_otp
   * Category: AUTHENTICATION
   * Variables: {{1}} = OTP code
   * Button: Copy Code — "Copy OTP"
   *
   * Message:
   * Your Cafe Quattro Valet verification OTP is: *{{1}}*
   * Valid for 10 minutes. Do not share this code with anyone.
   * - Team Cafe Quattro
   */
  async sendOTP(phone, otp) {
    const to = this._formatPhone(phone);
    if (this.enabled) {
      try {
        const payload = {
          recipient_mobile_number: to,
          customer_name: 'Customer',
          messages: [{
            kind: 'template',
            template: {
              name: 'cafe_quattro_otp_20260711184419',
              language: 'en_US',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: String(otp) }]
                },
                {
                  type: 'button',
                  sub_type: 'copy_code',
                  index: '0',
                  parameters: [{ type: 'coupon_code', coupon_code: String(otp) }]
                }
              ]
            }
          }]
        };

        const response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✓ WhatsApp [cafe_quattro_otp_20260711184419] sent to ${phone}:`, response.data?.id || 'ok');
        return { success: true, data: response.data };
      } catch (error) {
        console.error(`✗ WhatsApp [cafe_quattro_otp_20260711184419] failed:`, error.response?.data || error.message);
        return { success: false };
      }
    } else {
      console.log(`\n📲 MOCK WhatsApp OTP: ${otp} to ${phone}\n`);
      return { success: true, mock: true };
    }
  }

  /**
   * Template: Cafe_Quattro_booking_confirmation
   * Category: UTILITY
   * Body variables: {{1}} = customerName, {{2}} = bookingId
   * Button (index 0): Call To Action (URL) — "Track my car"
   *   Base URL: https://caffequattrovaletapp.onrender.com/customer/access/
   *   URL Suffix variable: {{1}} → accessToken
   *
   * Message Body:
   * Hi *{{1}}* 👋, your Cafe Quattro Valet booking is confirmed!
   *
   * 🚗 *Booking ID:* {{2}}
   *
   * *HOW IT WORKS — 4 EASY STEPS*
   *
   * 1️⃣ *Car Parked* ✅
   * Your vehicle is now safely parked by our valet driver.
   *
   * 2️⃣ *Request Your Car* 🔁
   * When you're ready to leave, tap the Track my car button below to request your car.
   *
   * 3️⃣ *Track in Real Time* 📍
   * You'll get an estimated arrival time and track your car as the driver brings it to you.
   *
   * 4️⃣ *Verify & Drive Away* 🔐
   * When your car arrives, you'll receive an OTP. Share it with the driver to verify and collect your vehicle.
   *
   * - Team Cafe Quattro
   *
   * [Button] Track my car → https://caffequattrovaletapp.onrender.com/customer/access/<accessToken>
   */
  async sendBookingConfirmation(phone, customerName, bookingId, accessToken) {
    const to = this._formatPhone(phone);

    if (this.enabled) {
      try {
        const payload = {
          recipient_mobile_number: to,
          customer_name: customerName || 'Customer',
          messages: [{
            kind: 'template',
            template: {
              name: 'cafe_quattro_booking_confirmation_20260711184852',
              language: 'en_US',
              components: [
                // Body: {{1}} = customerName, {{2}} = bookingId
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: customerName || 'Customer' },
                    { type: 'text', text: bookingId }
                  ]
                },
                // Button index 0: dynamic URL suffix (accessToken)
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [
                    { type: 'text', text: accessToken }
                  ]
                }
              ]
            }
          }]
        };

        const response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`✓ WhatsApp [cafe_quattro_booking_confirmation_20260711184852] sent to ${phone}:`, response.data?.id || 'ok');
        return { success: true, data: response.data };
      } catch (error) {
        const errData = error.response?.data || error.message;
        console.error(`✗ WhatsApp [cafe_quattro_booking_confirmation_20260711184852] to ${phone} failed:`, errData);
        return { success: false, error: errData };
      }
    } else {
      // MOCK mode
      console.log('\n📲 MOCK WhatsApp:');
      console.log(`   To       : ${to}`);
      console.log(`   Template : cafe_quattro_booking_confirmation_20260711184852`);
      console.log(`   {{1}}    : ${customerName || 'Customer'}`);
      console.log(`   {{2}}    : ${bookingId}`);
      console.log(`   [Button] : Track my car → accessToken=${accessToken}`);
      console.log('─────────────────────────────\n');
      return { success: true, mock: true };
    }
  }

  /**
   * Template: Cafe_Quattro_recall_notification
   * Category: UTILITY
   * Variables: {{1}} = bookingId, {{2}} = estimatedMinutes
   * Buttons: None
   *
   * Message:
   * 🚗 Your car is on the way!
   *
   * *Booking:* {{1}}
   * *Estimated arrival:* {{2}} minutes
   *
   * Please be ready at the pickup point.
   * - Team Cafe Quattro
   */
  async sendRecallNotification(phone, bookingId, estimatedMinutes) {
    return this.sendTemplate(phone, 'cafe_quattro_recall_notification_20260711185046', [
      bookingId,
      String(estimatedMinutes)
    ]);
  }

  /**
   * ── ARRIVAL NOTIFICATION — 2 messages sent back-to-back ──────────────
   *
   * MSG 1 — Template: Cafe_Quattro_car_arrived  (UTILITY)
   * Variables: {{1}} = bookingId
   * Buttons: None
   *
   * Body:
   * ✅ Your car has arrived at the pickup point!
   *
   * *Booking:* {{1}}
   *
   * You will receive your handover number in the next message.
   * Please have it ready to show the Cafe Quattro valet driver.
   *
   * - Team Cafe Quattro
   *
   * ─────────────────────────────────────────────────────────────────────
   *
   * MSG 2 — Template: Cafe_Quattro_handover_otp  (AUTHENTICATION)
   * Variables: {{1}} = OTP
   * Button: Copy Code — "Copy Number"
   *
   * Body (WhatsApp AUTHENTICATION fixed format):
   * {{1}} is your Cafe Quattro handover number.
   * Valid for 10 minutes. Do not share with anyone other than the valet driver.
   */
  async sendArrivalNotification(phone, bookingId, otp) {
    // MSG 1: UTILITY — car arrived notice (zero auth-trigger words)
    const notify = await this.sendTemplate(
      phone,
      'cafe_quattro_car_arrived_20260711195101',
      [bookingId]
    );

    // MSG 2: AUTHENTICATION — handover OTP with Copy Code button
    const to = this._formatPhone(phone);
    let otpResult;

    if (this.enabled) {
      try {
        const payload = {
          recipient_mobile_number: to,
          customer_name: 'Customer',
          messages: [{
            kind: 'template',
            template: {
              name: 'cafe_quattro_handover_otp_20260711195215',
              language: 'en_US',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: String(otp) }]
                },
                {
                  type: 'button',
                  sub_type: 'copy_code',
                  index: '0',
                  parameters: [{ type: 'coupon_code', coupon_code: String(otp) }]
                }
              ]
            }
          }]
        };

        const response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✓ WhatsApp [cafe_quattro_handover_otp_20260711195215] sent to ${phone}:`, response.data?.id || 'ok');
        otpResult = { success: true, data: response.data };
      } catch (error) {
        console.error(`✗ WhatsApp [cafe_quattro_handover_otp_20260711195215] failed:`, error.response?.data || error.message);
        otpResult = { success: false };
      }
    } else {
      console.log(`\n📲 MOCK WhatsApp Handover OTP: ${otp} to ${phone}\n`);
      otpResult = { success: true, mock: true };
    }

    return { notify, otpResult };
  }

  /**
   * Template: Cafe_Quattro_thank_you
   * Category: UTILITY
   * Variables: {{1}} = customerName, {{2}} = bookingId
   * Buttons: None
   *
   * Message:
   * Thank you for choosing Cafe Quattro Valet, *{{1}}*! 🙏
   *
   * Your booking *{{2}}* has been completed successfully.
   * We hope you had a seamless experience. It was our pleasure to serve you — we look forward to seeing you again!
   * – Team Cafe Quattro 🚗
   */
  async sendThankYou(phone, customerName, bookingId) {
    return this.sendTemplate(phone, 'cafe_quattro_thank_you_20260711195539', [
      customerName || 'Valued Customer',
      bookingId
    ]);
  }
}

module.exports = new WhatsAppService();
