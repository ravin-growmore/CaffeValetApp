const axios = require('axios');

/**
 * ChatMitra WhatsApp Service — Caffe Quattro Valet
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
   * Template: bonito_otp_20260506033644
   * Variables: {{1}} = OTP code
   *
   * Message:
   * Your Caffe Quattro Valet verification OTP is: *{{1}}*
   * Valid for 10 minutes. Do not share this code with anyone.
   * - Team Caffe Quattro
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
              name: 'bonito_otp_20260506033644',
              language: 'en_US',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: String(otp) }]
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: String(otp) }]
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
        console.log(`✓ WhatsApp [bonito_otp_20260506033644] sent to ${phone}:`, response.data?.id || 'ok');
        return { success: true, data: response.data };
      } catch (error) {
        console.error(`✗ WhatsApp [bonito_otp_20260506033644] failed:`, error.response?.data || error.message);
        return { success: false };
      }
    } else {
      console.log(`\n📲 MOCK WhatsApp OTP: ${otp} to ${phone}\n`);
      return { success: true, mock: true };
    }
  }

  /**
   * Template: bonito_booking_confirmation_20260506035804
   * Body variables:  {{1}} = customerName, {{2}} = bookingId
   * Button (index 0): Visit Website → "Track my car"
   *   Template URL in ChatMitra: <FRONTEND_URL>/customer/access/{{1}}
   *   We pass only the ACCESS TOKEN as the button parameter.
   *
   * Message Body:
   * Hi *{{1}}* 👋, your Caffe Quattro Valet booking is confirmed!
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
   * You'll get an estimated arrival time and can track your car as the driver brings it to you.
   *
   * 4️⃣ *Verify & Drive Away* 🔐
   * When your car arrives, you'll receive an OTP. Share it with the driver to verify and collect your vehicle.
   *
   * - Team Caffe Quattro
   *
   * [Button] Track my car → <FRONTEND_URL>/customer/access/<accessToken>
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
              name: 'bonito_booking_confirmation_20260506035804',
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
                // Button index 0: dynamic URL suffix
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

        console.log(`✓ WhatsApp [bonito_booking_confirmation_20260506035804] sent to ${phone}:`, response.data?.id || 'ok');
        return { success: true, data: response.data };
      } catch (error) {
        const errData = error.response?.data || error.message;
        console.error(`✗ WhatsApp [bonito_booking_confirmation_20260506035804] to ${phone} failed:`, errData);
        return { success: false, error: errData };
      }
    } else {
      // MOCK mode
      console.log('\n📲 MOCK WhatsApp:');
      console.log(`   To       : ${to}`);
      console.log(`   Template : bonito_booking_confirmation_20260506035804`);
      console.log(`   {{1}}    : ${customerName || 'Customer'}`);
      console.log(`   {{2}}    : ${bookingId}`);
      console.log(`   [Button] : Track my car → accessToken=${accessToken}`);
      console.log('─────────────────────────────\n');
      return { success: true, mock: true };
    }
  }

  /**
   * Template: bonito_recall_notification_20260506040401
   * Variables: {{1}} = bookingId, {{2}} = estimatedMinutes
   *
   * Message:
   * 🚗 Your car is on the way!
   *
   * *Booking:* {{1}}
   * *Estimated arrival:* {{2}} minutes
   *
   * Please be ready at the pickup point.
   * - Team Caffe Quattro
   */
  async sendRecallNotification(phone, bookingId, estimatedMinutes) {
    return this.sendTemplate(phone, 'bonito_recall_notification_20260506040401', [
      bookingId,
      String(estimatedMinutes)
    ]);
  }

  /**
   * Template: bonito_arrival_otp_20260506040618
   * Variables: {{1}} = bookingId, {{2}} = OTP
   *
   * Message:
   * ✅ Your car has arrived!
   *
   * *Booking:* {{1}}
   * *Handover OTP:* *{{2}}*
   *
   * Share this OTP only with the Caffe Quattro driver to collect your car.
   * Valid for 10 minutes.
   * - Team Caffe Quattro
   */
  async sendArrivalNotification(phone, bookingId, otp) {
    return this.sendTemplate(phone, 'bonito_arrival_otp_20260506040618', [bookingId, otp]);
  }

  /**
   * Template: bonito_thank_you_20260602161841
   * Variables: {{1}} = customerName, {{2}} = bookingId
   *
   * Message:
   * Thank you for choosing Caffe Quattro Valet, *{{1}}*! 🙏
   *
   * Your booking *{{2}}* has been completed successfully.
   *
   * We hope you had a seamless experience. It was our pleasure to serve you — we look forward to seeing you again!
   *
   * – Team Caffe Quattro 🚗
   */
  async sendThankYou(phone, customerName, bookingId) {
    return this.sendTemplate(phone, 'bonito_thank_you_20260602161841', [
      customerName || 'Valued Customer',
      bookingId
    ]);
  }
}

module.exports = new WhatsAppService();
