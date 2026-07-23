import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  TrendingUp, IndianRupee, CheckCircle, XCircle, Clock,
  CreditCard, RefreshCw, Calendar, BarChart2, PieChart, ChevronDown
} from 'lucide-react';
import api from '../../services/api';
import './AdminTransactions.css';

/* ─── Mini Bar Chart (pure SVG, no deps) ─────────────────── */
const BarChart = ({ data, height = 140 }) => {
  if (!data || data.length === 0) return <div className="atx-empty-chart">No data</div>;
  const max = Math.max(...data.map(d => d.amount), 1);
  const barW = Math.max(4, Math.floor(560 / data.length) - 3);

  return (
    <div className="atx-chart-scroll">
      <svg
        width={data.length * (barW + 3)}
        height={height + 24}
        style={{ display: 'block' }}
      >
        {data.map((d, i) => {
          const barH = Math.max(3, Math.round((d.amount / max) * height));
          const x = i * (barW + 3);
          const y = height - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={3}
                fill={isToday ? '#FF6B35' : d.amount > 0 ? '#6366F1' : '#E5E7EB'}
                opacity={isToday ? 1 : 0.85}
              >
                <title>₹{d.amount.toLocaleString()} • {d.count} txn{d.count !== 1 ? 's' : ''} • {d.label}</title>
              </rect>
              {(i % Math.ceil(data.length / 10) === 0 || i === data.length - 1) && (
                <text
                  x={x + barW / 2} y={height + 16}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#9CA3AF"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ─── Donut Chart (SVG) ─────────────────────────────────── */
const DonutChart = ({ segments, size = 100 }) => {
  const r = 38;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth="16" />
    </svg>
  );

  let cumAngle = -90;
  const arcs = segments.map(seg => {
    const pct = seg.value / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 360;
    cumAngle = endAngle;
    const toRad = (a) => (a * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return { ...seg, d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, pct };
  });

  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="16" />
      {arcs.map((arc, i) => (
        <path key={i} d={arc.d} fill="none" stroke={arc.color} strokeWidth="16" strokeLinecap="butt" />
      ))}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1A1A2E">
        {total}
      </text>
      <text x={cx} y={cy + 17} textAnchor="middle" fontSize="8" fill="#9CA3AF">txns</text>
    </svg>
  );
};

/* ─── Main Component ────────────────────────────────────── */
const AdminTransactions = () => {
  const [data, setData] = useState(null);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState('daily'); // daily | weekly | monthly
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null); // bookingId being saved

  const fetchData = useCallback(async () => {
    try {
      const [revenueRes, bookingsRes] = await Promise.allSettled([
        api.get('/admin/revenue-stats'),
        api.get('/admin/all-bookings?limit=20&sort=newest')
      ]);
      if (revenueRes.status === 'fulfilled') setData(revenueRes.value.data);
      if (bookingsRes.status === 'fulfilled') {
        setRecentTxns(bookingsRes.value.data.bookings || []);
      }
      if (revenueRes.status === 'rejected') toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  /* ─── Admin: update payment field inline ─── */
  const updatePayment = async (bookingDbId, bookingId, field, value) => {
    const key = `${bookingDbId}-${field}`;
    setUpdating(key);
    try {
      const payload = field === 'status'
        ? { paymentStatus: value }
        : { paymentMethod: value };

      await api.patch(`/admin/bookings/${bookingDbId}/payment`, payload);

      // Optimistically update local state
      setRecentTxns(prev => prev.map(b => {
        if (b._id !== bookingDbId) return b;
        const updated = { ...b, payment: { ...b.payment } };
        if (field === 'status') {
          updated.payment.status = value;
          updated.paymentStatus = value === 'completed' ? 'paid' : value === 'pending' ? 'unpaid' : 'failed';
        } else {
          updated.payment.method = value;
        }
        return updated;
      }));

      toast.success(`Payment ${field === 'status' ? 'status' : 'method'} updated for ${bookingId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(null);
    }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  const chartData = {
    daily: data?.dailyBreakdown || [],
    weekly: data?.weeklyBreakdown || [],
    monthly: data?.monthlyBreakdown || []
  }[chartView];

  const paymentMethodColors = {
    razorpay: '#6366F1', cash: '#10B981', upi: '#F59E0B',
    card: '#3B82F6', qr: '#8B5CF6', staff: '#EC4899', foc: '#14B8A6', pending: '#9CA3AF'
  };

  const methodSegments = Object.entries(data?.paymentBreakdown || {}).map(([method, val]) => ({
    label: method, value: val.count, color: paymentMethodColors[method] || '#9CA3AF'
  }));

  const getPaymentMethodLabel = (m) => ({
    razorpay: '💳 Razorpay', cash: '💵 Cash', upi: '📱 UPI',
    card: '🃏 Card', qr: '🔲 QR', staff: '👷 Staff', foc: '🎁 FOC', pending: '⏳ Pending'
  }[m] || m);

  const getStatusBadge = (status) => {
    const map = {
      completed: { label: 'Paid', cls: 'atx-badge-success' },
      failed: { label: 'Failed', cls: 'atx-badge-failed' },
      pending: { label: 'Pending', cls: 'atx-badge-pending' }
    };
    return map[status] || { label: status, cls: 'atx-badge-pending' };
  };

  if (loading) {
    return (
      <div className="atx-container">
        <div className="atx-loading-grid">
          {[1,2,3,4].map(i => <div key={i} className="atx-skeleton" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="atx-container">
      {/* Header */}
      <div className="atx-header">
        <div>
          <h2>Transaction Dashboard</h2>
          <p>Revenue analytics &amp; payment monitoring</p>
        </div>
        <button className="atx-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="atx-cards-grid">
        {[
          { label: "Today's Revenue", value: fmt(data?.today?.amount), sub: `${data?.today?.count || 0} transactions`, icon: Calendar, color: '#FF6B35' },
          { label: 'This Week', value: fmt(data?.week?.amount), sub: `${data?.week?.count || 0} transactions`, icon: TrendingUp, color: '#6366F1' },
          { label: 'This Month', value: fmt(data?.month?.amount), sub: `${data?.month?.count || 0} transactions`, icon: BarChart2, color: '#10B981' },
          { label: 'All Time', value: fmt(data?.allTime?.amount), sub: `${data?.allTime?.count || 0} transactions`, icon: IndianRupee, color: '#F59E0B' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="atx-card"
            style={{ '--card-accent': card.color }}
          >
            <div className="atx-card-icon" style={{ background: card.color + '18' }}>
              <card.icon size={20} color={card.color} />
            </div>
            <div>
              <p className="atx-card-label">{card.label}</p>
              <h3 className="atx-card-value">{card.value}</h3>
              <span className="atx-card-sub">{card.sub}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Payment Status Row ── */}
      <div className="atx-status-row">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="atx-status-card success"
        >
          <CheckCircle size={28} color="#10B981" />
          <div>
            <span className="atx-status-count">{data?.paymentStatus?.successful?.count || 0}</span>
            <span className="atx-status-label">Successful Payments</span>
            <span className="atx-status-amount">{fmt(data?.paymentStatus?.successful?.total)}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.37 }}
          className="atx-status-card failed"
        >
          <XCircle size={28} color="#EF4444" />
          <div>
            <span className="atx-status-count">{data?.paymentStatus?.failed?.count || 0}</span>
            <span className="atx-status-label">Failed Payments</span>
            <span className="atx-status-amount">{fmt(data?.paymentStatus?.failed?.total)}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44 }}
          className="atx-status-card pending"
        >
          <Clock size={28} color="#F59E0B" />
          <div>
            <span className="atx-status-count">{data?.paymentStatus?.pending?.count || 0}</span>
            <span className="atx-status-label">Pending Payments</span>
            <span className="atx-status-amount">{fmt(data?.paymentStatus?.pending?.total)}</span>
          </div>
        </motion.div>
      </div>

      {/* ── Chart + Method Breakdown ── */}
      <div className="atx-analytics-row">
        {/* Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="atx-chart-card"
        >
          <div className="atx-chart-header">
            <h3>Revenue Trend</h3>
            <div className="atx-chart-tabs">
              {['daily','weekly','monthly'].map(v => (
                <button
                  key={v}
                  className={`atx-tab ${chartView === v ? 'active' : ''}`}
                  onClick={() => setChartView(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <BarChart data={chartData} height={140} />
          <div className="atx-chart-legend">
            <span><span className="atx-dot" style={{ background: '#6366F1' }} /> Past</span>
            <span><span className="atx-dot" style={{ background: '#FF6B35' }} /> Latest</span>
          </div>
        </motion.div>

        {/* Payment Method Donut */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="atx-method-card"
        >
          <h3><PieChart size={16} /> Payment Methods</h3>
          <div className="atx-donut-wrap">
            <DonutChart segments={methodSegments} size={110} />
          </div>
          <div className="atx-method-list">
            {Object.entries(data?.paymentBreakdown || {}).map(([method, val]) => (
              <div key={method} className="atx-method-item">
                <div className="atx-method-left">
                  <span className="atx-method-dot" style={{ background: paymentMethodColors[method] || '#9CA3AF' }} />
                  <span className="atx-method-name">{getPaymentMethodLabel(method)}</span>
                </div>
                <div className="atx-method-right">
                  <span className="atx-method-amount">{fmt(val.amount)}</span>
                  <span className="atx-method-count">{val.count} txns</span>
                </div>
              </div>
            ))}
            {Object.keys(data?.paymentBreakdown || {}).length === 0 && (
              <div className="atx-empty">No payment data yet</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Transactions Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="atx-table-card"
      >
        <div className="atx-table-header-row">
          <h3><CreditCard size={16} /> Recent Transactions</h3>
          <span className="atx-admin-hint">✏️ Click Method or Status to edit</span>
        </div>
        <div className="atx-table-wrap">
          <table className="atx-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map(b => {
                const badge = getStatusBadge(b.payment?.status);
                const statusKey = `${b._id}-status`;
                const methodKey = `${b._id}-method`;
                return (
                  <tr key={b._id}>
                    <td><span className="atx-booking-id">{b.bookingId}</span></td>
                    <td>
                      <span className="atx-customer-name">{b.customer?.name || '—'}</span>
                      <span className="atx-customer-phone">{b.customer?.phone}</span>
                    </td>
                    <td>{b.vehicle?.number || '—'}</td>
                    <td>
                      <span className="atx-amount">
                        {b.payment?.amount ? `₹${b.payment.amount}` : '—'}
                      </span>
                    </td>

                    {/* ── Method — admin editable dropdown ── */}
                    <td>
                      <div className="atx-edit-select-wrap">
                        <select
                          className="atx-edit-select atx-method-select"
                          value={b.payment?.method || 'cash'}
                          disabled={updating === methodKey}
                          onChange={(e) => updatePayment(b._id, b.bookingId, 'method', e.target.value)}
                          style={{
                            background: (paymentMethodColors[b.payment?.method] || '#9CA3AF') + '18',
                            color: paymentMethodColors[b.payment?.method] || '#6B7280',
                            borderColor: (paymentMethodColors[b.payment?.method] || '#9CA3AF') + '60'
                          }}
                        >
                          <option value="cash">💵 Cash</option>
                          <option value="razorpay">💳 Razorpay</option>
                          <option value="upi">📱 UPI</option>
                          <option value="card">🃏 Card</option>
                          <option value="qr">🔲 QR</option>
                          <option value="staff">👷 Staff</option>
                          <option value="foc">🎁 FOC</option>
                        </select>
                        <ChevronDown size={11} className="atx-select-chevron" />
                      </div>
                    </td>

                    {/* ── Status — admin editable dropdown ── */}
                    <td>
                      <div className="atx-edit-select-wrap">
                        <select
                          className={`atx-edit-select atx-status-select ${badge.cls}`}
                          value={b.payment?.status || 'pending'}
                          disabled={updating === statusKey}
                          onChange={(e) => updatePayment(b._id, b.bookingId, 'status', e.target.value)}
                        >
                          <option value="pending">⏳ Pending</option>
                          <option value="completed">✅ Paid</option>
                          <option value="failed">❌ Failed</option>
                        </select>
                        <ChevronDown size={11} className="atx-select-chevron" />
                      </div>
                    </td>

                    <td>
                      <span className="atx-date">
                        {new Date(b.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {recentTxns.length === 0 && (
                <tr><td colSpan="7" className="atx-empty-row">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminTransactions;
