import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { Car, CheckCircle, User, CreditCard, ShieldCheck, AlertCircle, RefreshCw, IndianRupee } from 'lucide-react';
import axios from 'axios';
import './CustomerBookingForm.css';

const API_URL = process.env.REACT_APP_API_URL || '';
const RAZORPAY_KEY = process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID_HERE';

/* ─── Load Razorpay SDK once ─────────────────────────────── */
const loadRazorpaySDK = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const CustomerBookingForm = () => {
  const { driverPhone } = useParams();

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    vehicleNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverNotFound, setDriverNotFound] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState(150);
  const [paymentMethod, setPaymentMethod] = useState('razorpay'); // razorpay | cash
  const [paymentState, setPaymentState] = useState('idle'); // idle | paying | failed
  const [venueName, setVenueName] = useState('');
  const [venueLoading, setVenueLoading] = useState(true);

  // Fetch driver name + venue parking fee to verify the QR is valid
  useEffect(() => {
    if (!driverPhone) { setDriverNotFound(true); return; }
    const verify = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/auth/driver-info/${driverPhone}`);
        setDriverName(res.data.name || 'Your Valet Driver');
        if (res.data.parkingFee !== undefined) {
          setPaymentAmount(res.data.parkingFee);
        }
        if (res.data.venueName) {
          setVenueName(res.data.venueName);
        }
      } catch {
        setDriverName('Your Valet Driver');
      } finally {
        setVenueLoading(false);
      }
    };
    verify();
  }, [driverPhone]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  /* ─── Validate form fields before action ────────────────── */
  const validateForm = () => {
    if (!/^[0-9]{10}$/.test(formData.customerPhone.trim())) {
      toast.error('Please enter a valid 10-digit mobile number');
      return false;
    }
    if (formData.vehicleNumber.trim().length < 4) {
      toast.error('Vehicle number must be at least 4 characters');
      return false;
    }
    return true;
  };

  /* ─── Build and submit the booking ─────────────────────── */
  const submitBooking = useCallback(async (razorpayPaymentData) => {
    setLoading(true);
    try {
      const data = new FormData();
      data.append('driverPhone', driverPhone);
      data.append('customerName', formData.customerName.trim() || formData.customerPhone.trim());
      data.append('customerPhone', formData.customerPhone.trim());
      data.append('vehicleNumber', formData.vehicleNumber.trim().toUpperCase());
      data.append('paymentMethod', razorpayPaymentData ? 'razorpay' : 'cash');
      if (razorpayPaymentData) {
        data.append('razorpayOrderId', razorpayPaymentData.orderId);
        data.append('razorpayPaymentId', razorpayPaymentData.paymentId);
        data.append('razorpaySignature', razorpayPaymentData.signature);
      }
      data.append('paymentAmount', paymentAmount);

      const res = await axios.post(`${API_URL}/api/bookings/public`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setCreatedBookingId(res.data.booking.bookingId);
      setSubmitted(true);
      toast.success('Booking created successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [driverPhone, formData, paymentAmount]);

  /* ─── Single action button handler ─────────────────────── */
  const handleActionButton = useCallback(async () => {
    if (!validateForm()) return;

    // ── Cash: directly create booking ──
    if (paymentMethod === 'cash') {
      await submitBooking(null);
      return;
    }

    // ── Razorpay: pay then auto-create booking ──
    setPaymentState('paying');

    const sdkLoaded = await loadRazorpaySDK();
    if (!sdkLoaded) {
      toast.error('Failed to load payment gateway. Check your internet connection.');
      setPaymentState('failed');
      return;
    }

    try {
      const { data } = await axios.post(`${API_URL}/api/payment/create-order`, {
        amount: paymentAmount,
        notes: { customerName: formData.customerName, customerPhone: formData.customerPhone }
      });

      // ── Mock / test mode ──
      if (data.orderId && data.orderId.startsWith('mock_order_')) {
        toast.loading('Processing Test Payment (Mock Mode)...', { duration: 1500 });
        setTimeout(async () => {
          try {
            const verify = await axios.post(`${API_URL}/api/payment/verify`, {
              razorpay_order_id: data.orderId,
              razorpay_payment_id: `pay_mock_${Date.now()}`,
              razorpay_signature: 'mock_signature'
            });
            if (verify.data.success) {
              setPaymentState('idle');
              await submitBooking({
                orderId: data.orderId,
                paymentId: verify.data.paymentId,
                signature: 'mock_signature'
              });
            } else {
              setPaymentState('failed');
              toast.error('Test Payment Verification Failed.');
            }
          } catch {
            setPaymentState('failed');
            toast.error('Test Payment Verification Error.');
          }
        }, 1500);
        return;
      }

      // ── Live Razorpay ──
      const options = {
        key: RAZORPAY_KEY,
        amount: data.amount,
        currency: data.currency,
        name: 'GrowMore Valet',
        description: 'Valet Parking Payment',
        order_id: data.orderId,
        prefill: {
          name: formData.customerName,
          contact: formData.customerPhone,
        },
        theme: { color: '#FF6B35' },
        handler: async (response) => {
          try {
            const verify = await axios.post(`${API_URL}/api/payment/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            if (verify.data.success) {
              setPaymentState('idle');
              toast.success('Payment successful! Creating your booking...');
              await submitBooking({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature
              });
            } else {
              setPaymentState('failed');
              toast.error('Payment verification failed. Please retry.');
            }
          } catch {
            setPaymentState('failed');
            toast.error('Payment verification error. Please retry.');
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentState('failed');
            toast.error('Payment cancelled. Please retry.');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        setPaymentState('failed');
        toast.error('Payment failed. Please retry.');
      });
      rzp.open();
    } catch (err) {
      setPaymentState('failed');
      toast.error(err.response?.data?.message || 'Failed to initiate payment. Please try again.');
    }
  }, [formData, paymentAmount, paymentMethod, submitBooking]);

  const handleRetryPayment = () => {
    setPaymentState('idle');
  };

  /* ─── Screens ───────────────────────────────────────────── */
  if (driverNotFound) {
    return (
      <div className="cbf-page">
        <div className="cbf-error-state">
          <Car size={60} color="#EF4444" />
          <h2>Invalid QR Code</h2>
          <p>This QR code is not associated with a valid driver. Please contact your valet service.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="cbf-page">
        <Toaster position="top-center" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="cbf-success-card"
        >
          <div className="cbf-success-icon">
            <CheckCircle size={64} color="#10B981" />
          </div>
          <h2>Booking Confirmed! 🎉</h2>
          <p>Your vehicle has been registered for valet parking.</p>
          <div className="cbf-booking-id-box">
            <span>Booking ID</span>
            <strong>{createdBookingId}</strong>
          </div>
          {paymentMethod === 'razorpay' ? (
            <div className="cbf-payment-success-badge">
              <ShieldCheck size={16} color="#10B981" />
              <span>Payment of ₹{paymentAmount} confirmed online</span>
            </div>
          ) : (
            <div className="cbf-payment-success-badge" style={{ backgroundColor: '#FEF3C7', borderColor: '#FDE68A', color: '#92400E' }}>
              <AlertCircle size={16} color="#92400E" />
              <span>Pay ₹{paymentAmount} in cash to the driver upon collection.</span>
            </div>
          )}
          <p className="cbf-track-hint">
            You will receive an SMS with a tracking link to monitor your car status in real time.
          </p>
        </motion.div>
      </div>
    );
  }

  /* ─── Main Form ─────────────────────────────────────────── */
  const isPaying = paymentState === 'paying';
  const isFailed = paymentState === 'failed';

  return (
    <div className="cbf-page">
      <Toaster position="top-center" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="cbf-wrapper"
      >
        {/* Header */}
        <div className="cbf-header">
          <div className="cbf-logo-ring">
            <Car size={36} color="#FF6B35" />
          </div>
          <h1>GrowMore Valet</h1>
          <p>Book your valet parking in seconds</p>
          {driverName && (
            <div className="cbf-driver-badge">
              <span>👋 Served by <strong>{driverName}</strong></span>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleActionButton(); }} className="cbf-form">

          {/* Customer Info */}
          <div className="cbf-section">
            <div className="cbf-section-title">
              <User size={18} /> Customer Information
            </div>

            {/* Mobile first */}
            <div className="cbf-field">
              <label>Mobile Number <span className="req">*</span></label>
              <input
                type="tel"
                name="customerPhone"
                value={formData.customerPhone}
                onChange={handleChange}
                placeholder="10-digit mobile number"
                pattern="[0-9]{10}"
                maxLength="10"
                required
              />
            </div>

            {/* Name second (optional) */}
            <div className="cbf-field">
              <label>Full Name <span className="opt">(Optional)</span></label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                placeholder="Your full name"
              />
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="cbf-section">
            <div className="cbf-section-title">
              <Car size={18} /> Vehicle Information
            </div>

            <div className="cbf-field">
              <label>
                Vehicle Number <span className="req">*</span>
                <span className="cbf-hint"> (full plate or last 4 digits)</span>
              </label>
              <input
                type="text"
                name="vehicleNumber"
                value={formData.vehicleNumber}
                onChange={handleChange}
                placeholder="MH12AB1234 or 1234"
                minLength="4"
                required
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </div>

          {/* ═══════════════ PAYMENT SECTION ══════════════════ */}
          <div className="cbf-section cbf-payment-section">
            <div className="cbf-section-title">
              <CreditCard size={18} /> Payment
            </div>

            {/* Venue Fee Display (read-only) */}
            <div className="cbf-venue-fee-row">
              <div className="cbf-venue-fee-info">
                <span className="cbf-venue-fee-label">
                  {venueName ? `Parking charge at ${venueName}` : 'Valet Parking Charge'}
                </span>
                {venueLoading ? (
                  <span className="cbf-fee-loading">Loading fee…</span>
                ) : (
                  <span className="cbf-venue-fee-amount">₹{paymentAmount}</span>
                )}
              </div>
              <div className="cbf-fee-badge">Admin set</div>
            </div>

            {/* Payment Method Selector */}
            <div className="cbf-field" style={{ marginTop: '16px', marginBottom: '16px' }}>
              <label>Select Payment Option</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px',
                    border: paymentMethod === 'razorpay' ? '2.5px solid #FF6B35' : '2px solid #E5E7EB',
                    background: paymentMethod === 'razorpay' ? '#FFF5F2' : '#FAFAFA',
                    color: paymentMethod === 'razorpay' ? '#FF6B35' : '#374151',
                    fontWeight: '700', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontFamily: "'Inter', sans-serif", fontSize: '14px', transition: 'all 0.2s'
                  }}
                  onClick={() => { setPaymentMethod('razorpay'); setPaymentState('idle'); }}
                >
                  <CreditCard size={18} /> Online
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '12px', borderRadius: '10px',
                    border: paymentMethod === 'cash' ? '2.5px solid #FF6B35' : '2px solid #E5E7EB',
                    background: paymentMethod === 'cash' ? '#FFF5F2' : '#FAFAFA',
                    color: paymentMethod === 'cash' ? '#FF6B35' : '#374151',
                    fontWeight: '700', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: '8px',
                    fontFamily: "'Inter', sans-serif", fontSize: '14px', transition: 'all 0.2s'
                  }}
                  onClick={() => { setPaymentMethod('cash'); setPaymentState('idle'); }}
                >
                  <IndianRupee size={18} /> Cash
                </button>
              </div>
            </div>

            {/* Cash info banner */}
            {paymentMethod === 'cash' && (
              <div style={{
                background: '#FEF3C7', border: '1.5px solid #FDE68A', borderRadius: '12px',
                padding: '14px 16px', color: '#92400E', fontSize: '13.5px', lineHeight: '1.5',
                display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '4px'
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#D97706' }} />
                <span>
                  You selected <strong>Cash Payment</strong>. Please pay <strong>₹{paymentAmount}</strong> in cash to the valet driver upon vehicle handover/collection.
                </span>
              </div>
            )}

            {/* Payment failed state */}
            <AnimatePresence>
              {isFailed && (
                <motion.div
                  key="failed"
                  className="cbf-payment-failed-wrap"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="cbf-payment-status failed">
                    <AlertCircle size={22} color="#EF4444" />
                    <span className="cbf-ps-title">Payment Failed or Cancelled</span>
                  </div>
                  <button type="button" className="cbf-retry-btn" onClick={handleRetryPayment}>
                    <RefreshCw size={16} /> Retry Payment
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {paymentMethod === 'razorpay' && !isFailed && (
              <p className="cbf-payment-note">
                🔒 Secure payment powered by Razorpay. Booking is created instantly after payment.
              </p>
            )}
          </div>

          {/* ── Single Action Button ── */}
          <motion.button
            type="submit"
            className="cbf-submit"
            disabled={loading || isPaying}
            whileHover={{ scale: loading || isPaying ? 1 : 1.02 }}
            whileTap={{ scale: loading || isPaying ? 1 : 0.98 }}
            style={{ opacity: loading || isPaying ? 0.75 : 1 }}
          >
            {loading ? (
              <span className="cbf-spinner">Creating Booking…</span>
            ) : isPaying ? (
              <><div className="cbf-spinner-inline" /> Opening Payment Gateway…</>
            ) : paymentMethod === 'razorpay' ? (
              <><CreditCard size={20} /> Pay ₹{paymentAmount} &amp; Book</>
            ) : (
              <>🚗 Create Booking</>
            )}
          </motion.button>
        </form>

        <p className="cbf-footer">Powered by GrowMore Valet Services</p>
      </motion.div>
    </div>
  );
};

export default CustomerBookingForm;
