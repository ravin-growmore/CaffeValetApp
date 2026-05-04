import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { Car, FileText, CheckCircle, User } from 'lucide-react';
import axios from 'axios';
import './CustomerBookingForm.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const valuableOptions = ['Laptop', 'Phone', 'Wallet', 'Gift', 'Snacks', 'Charger', 'HeadPhone'];

const CustomerBookingForm = () => {
  const { driverPhone } = useParams();

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehicleNumber: '',
    notes: '',
    hasValuables: false,
    valuables: [],
  });
  const [carImages, setCarImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverNotFound, setDriverNotFound] = useState(false);

  // Fetch driver name to verify the QR is valid
  useEffect(() => {
    if (!driverPhone) { setDriverNotFound(true); return; }
    const verify = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/auth/driver-info/${driverPhone}`);
        setDriverName(res.data.name || 'Your Valet Driver');
      } catch {
        // If endpoint doesn't exist we just don't show the name - not a blocker
        setDriverName('Your Valet Driver');
      }
    };
    verify();
  }, [driverPhone]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleValuablesToggle = () => {
    setFormData({
      ...formData,
      hasValuables: !formData.hasValuables,
      valuables: !formData.hasValuables ? formData.valuables : []
    });
  };

  const handleValuableSelect = (v) => {
    const updated = formData.valuables.includes(v)
      ? formData.valuables.filter(x => x !== v)
      : [...formData.valuables, v];
    setFormData({ ...formData, valuables: updated });
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + carImages.length > 4) {
      toast.error('Maximum 4 images allowed'); return;
    }
    setCarImages([...carImages, ...files]);
  };

  const removeImage = (i) => setCarImages(carImages.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.customerName.trim()) { toast.error('Name is required'); return; }
    if (!/^[0-9]{10}$/.test(formData.customerPhone.trim())) {
      toast.error('Enter a valid 10-digit mobile number'); return;
    }
    if (formData.vehicleNumber.trim().length < 4) {
      toast.error('Vehicle number must be at least 4 characters'); return;
    }

    setLoading(true);
    try {
      const data = new FormData();
      data.append('driverPhone', driverPhone);
      data.append('customerName', formData.customerName.trim());
      data.append('customerPhone', formData.customerPhone.trim());
      if (formData.customerEmail.trim()) data.append('customerEmail', formData.customerEmail.trim());
      data.append('vehicleNumber', formData.vehicleNumber.trim().toUpperCase());
      data.append('notes', formData.notes);
      data.append('hasValuables', formData.hasValuables);
      data.append('valuables', JSON.stringify(formData.valuables));
      carImages.forEach(f => data.append('carImages', f));

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
  };

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
          <p className="cbf-track-hint">
            You will receive an SMS with a tracking link to monitor your car status in real time.
          </p>
        </motion.div>
      </div>
    );
  }

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

        <form onSubmit={handleSubmit} className="cbf-form">

          {/* Customer Info */}
          <div className="cbf-section">
            <div className="cbf-section-title">
              <User size={18} /> Customer Information
            </div>

            <div className="cbf-field">
              <label>Full Name <span className="req">*</span></label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                placeholder="Your full name"
                required
              />
            </div>

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

            <div className="cbf-field">
              <label>Email <span className="opt">(Optional)</span></label>
              <input
                type="email"
                name="customerEmail"
                value={formData.customerEmail}
                onChange={handleChange}
                placeholder="you@email.com"
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

          {/* Vehicle Security */}
          <div className="cbf-section">
            <div className="cbf-section-title">
              <Car size={18} /> Vehicle Security <span className="cbf-opt-label">(Optional)</span>
            </div>

            <div className="cbf-toggle-row">
              <span>Any valuables in the car?</span>
              <label className="cbf-toggle">
                <input
                  type="checkbox"
                  checked={formData.hasValuables}
                  onChange={handleValuablesToggle}
                />
                <span className="cbf-toggle-slider" />
              </label>
            </div>

            {formData.hasValuables && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="cbf-valuables"
              >
                <p className="cbf-valuables-label">Select what's inside:</p>
                <div className="cbf-chips">
                  {valuableOptions.map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`cbf-chip ${formData.valuables.includes(v) ? 'selected' : ''}`}
                      onClick={() => handleValuableSelect(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Images */}
            <div className="cbf-images-section">
              <label className="cbf-img-label">Car Images (Optional, max 4)</label>
              <p className="cbf-img-hint">Capture front, back, left & right for security</p>

              <div className="cbf-img-buttons">
                <div className="cbf-img-area">
                  <input
                    type="file" id="cbfBrowse" accept="image/*" multiple
                    onChange={handleImageChange} style={{ display: 'none' }}
                    disabled={carImages.length >= 4}
                  />
                  <label htmlFor="cbfBrowse" className={`cbf-upload-btn ${carImages.length >= 4 ? 'disabled' : ''}`}>
                    <Car size={28} /> Browse
                  </label>
                </div>
                <div className="cbf-img-area">
                  <input
                    type="file" id="cbfCamera" accept="image/*" capture="environment"
                    onChange={handleImageChange} style={{ display: 'none' }}
                    disabled={carImages.length >= 4}
                  />
                  <label htmlFor="cbfCamera" className={`cbf-upload-btn camera ${carImages.length >= 4 ? 'disabled' : ''}`}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    Camera
                  </label>
                </div>
              </div>

              <div className="cbf-count">{carImages.length}/4 images added</div>

              {carImages.length > 0 && (
                <div className="cbf-preview-grid">
                  {carImages.map((f, i) => (
                    <div key={i} className="cbf-preview">
                      <img src={URL.createObjectURL(f)} alt={`car-${i}`} />
                      <button type="button" className="cbf-rm-img" onClick={() => removeImage(i)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="cbf-section">
            <div className="cbf-section-title">
              <FileText size={18} /> Notes <span className="cbf-opt-label">(Optional)</span>
            </div>
            <div className="cbf-field">
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="3"
                placeholder="Any special instructions..."
              />
            </div>
          </div>

          <button type="submit" className="cbf-submit" disabled={loading}>
            {loading ? (
              <span className="cbf-spinner">Creating Booking...</span>
            ) : (
              <>🚗 Create Booking</>
            )}
          </button>
        </form>

        <p className="cbf-footer">Powered by GrowMore Valet Services</p>
      </motion.div>
    </div>
  );
};

export default CustomerBookingForm;
