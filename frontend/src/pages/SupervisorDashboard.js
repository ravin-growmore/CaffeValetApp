import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { LogOut, Activity, Car, Clock, TrendingUp, Download } from 'lucide-react';
import api from '../services/api';
import './SupervisorDashboard.css';

const SupervisorDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket, on, off } = useSocket();
  const [stats,    setStats]    = useState({});
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('active'); // Status filter
  const [dateFilter, setDateFilter] = useState('today'); // Date filter

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/bookings/stats/overview');
      setStats(response.data);
    } catch { console.error('Failed to fetch stats'); }
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      let fromDate = new Date();
      let toDate = new Date();
      
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);

      if (dateFilter === 'week') {
        fromDate.setDate(fromDate.getDate() - 7);
      } else if (dateFilter === 'month') {
        fromDate.setMonth(fromDate.getMonth() - 1);
      } else if (dateFilter === 'all') {
        fromDate = new Date(2020, 0, 1);
      }

      const params = filter === 'all'
        ? {}
        : { status: filter === 'active' ? 'parked,recall-requested,in-transit,arrived' : 'completed' };
      
      params.from = fromDate.toISOString();
      params.to = toDate.toISOString();

      const response = await api.get('/bookings/all', { params });
      setBookings(response.data.bookings);
    } catch { toast.error('Failed to fetch bookings'); }
    finally { setLoading(false); }
  }, [filter, dateFilter]);

  useEffect(() => {
    fetchStats();
    fetchBookings();
  }, [filter, dateFilter, fetchStats, fetchBookings]);

  useEffect(() => {
    if (socket) {
      const handleNewBooking = () => {
        toast.success('New booking created!');
        fetchStats();
        fetchBookings();
      };
      on('new-booking', handleNewBooking);
      return () => { off('new-booking', handleNewBooking); };
    }
  }, [socket, on, off, fetchStats, fetchBookings]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const formatTime = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  /** Calculate duration between booking creation and completion */
  const formatDuration = (booking) => {
    const start = booking.createdAt;
    const end   = booking.parking?.actualEndTime || booking.updatedAt;

    if (!start) return '—';
    if (booking.status !== 'completed') return 'Active';

    const ms      = new Date(end) - new Date(start);
    if (ms <= 0)  return '—';

    const totalMins = Math.floor(ms / 60000);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const exportToCSV = () => {
    try {
      const headers = [
        'Booking ID', 'Customer Name', 'Customer Phone',
        'Vehicle Number', 'Driver Name', 'Status',
        'Booking Time', 'Recall Time', 'Complete Time',
        'Duration', 'Venue', 'Parking Spot'
      ];

      const rows = bookings.map(b => [
        b.bookingId || '',
        b.customer?.name || '',
        b.customer?.phone || '',
        b.vehicle?.number || '',
        b.driver?.name || 'N/A',
        b.status || '',
        formatTime(b.createdAt),
        formatTime(b.recall?.requestedAt),
        formatTime(b.parking?.actualEndTime),
        formatDuration(b),
        b.location?.venue || '',
        b.location?.parkingSpot || ''
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(c => `"${c}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `bookings-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV downloaded!');
    } catch { toast.error('Failed to export CSV'); }
  };

  const statCards = [
    { label: "Today's Bookings", value: stats.todayBookings  || 0, icon: TrendingUp, color: '#3B82F6' },
    { label: 'Active Bookings',  value: stats.activeBookings || 0, icon: Activity,   color: '#FF6B35' },
    { label: 'Completed',        value: stats.completedBookings || 0, icon: Car,     color: '#10B981' },
    { label: 'Total Bookings',   value: stats.totalBookings  || 0, icon: Clock,      color: '#8B5CF6' }
  ];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <Activity size={28} color="#FF6B35" />
          <div>
            <h2>Supervisor Dashboard</h2>
            <p>{user?.name}</p>
          </div>
        </div>
        <div className="header-right">
          <button onClick={exportToCSV} className="export-btn" style={{ marginRight: '10px' }}>
            <Download size={18} /> Export CSV
          </button>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </header>

      <main className="supervisor-content">

        {/* Stats Cards */}
        <div className="stats-grid">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="stat-card"
              style={{ borderTop: `3px solid ${stat.color}` }}
            >
              <div className="stat-icon" style={{ background: `${stat.color}18` }}>
                <stat.icon size={24} color={stat.color} />
              </div>
              <div style={{ flex: 1 }}>
                <p className="stat-label">{stat.label}</p>
                <h3 className="stat-value">{stat.value}</h3>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bookings Table */}
        <div className="bookings-section">
          <div className="section-header">
            <h3>All Bookings</h3>
            <div className="filter-buttons">
              {['active', 'completed', 'all'].map(f => (
                <button
                  key={f}
                  className={filter === f ? 'active' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="date-filters" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button className={`filter-btn ${dateFilter === 'today' ? 'active' : ''}`} onClick={() => setDateFilter('today')}>
              Today
            </button>
            <button className={`filter-btn ${dateFilter === 'week' ? 'active' : ''}`} onClick={() => setDateFilter('week')}>
              This Week
            </button>
            <button className={`filter-btn ${dateFilter === 'month' ? 'active' : ''}`} onClick={() => setDateFilter('month')}>
              This Month
            </button>
            <button className={`filter-btn ${dateFilter === 'all' ? 'active' : ''}`} onClick={() => setDateFilter('all')}>
              All Time
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="bookings-table">
              <table>
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Booking Time</th>
                    <th>Recall Time</th>
                    <th>Complete Time</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const duration = formatDuration(booking);
                    const isActive = booking.status !== 'completed';
                    return (
                      <tr key={booking._id}>
                        <td><strong>{booking.bookingId}</strong></td>
                        <td>
                          {booking.customer?.name || booking.customer?.phone}<br/>
                          <small>{booking.customer?.phone}</small>
                        </td>
                        <td>{booking.vehicle?.number}</td>
                        <td>{booking.driver?.name || 'N/A'}</td>
                        <td>
                          <span className={`status-badge status-${booking.status}`}>
                            {booking.status}
                          </span>
                        </td>
                        <td><small>{formatTime(booking.createdAt)}</small></td>
                        <td><small>{formatTime(booking.recall?.requestedAt)}</small></td>
                        <td><small>{formatTime(booking.parking?.actualEndTime)}</small></td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '700',
                            background: isActive ? '#FFF5F2' : '#ECFDF5',
                            color: isActive ? '#FF6B35' : '#10B981',
                            border: `1px solid ${isActive ? '#FFD9CC' : '#A7F3D0'}`
                          }}>
                            <Clock size={11} />
                            {duration}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {bookings.length === 0 && (
                <div className="empty-table">No bookings found</div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SupervisorDashboard;
