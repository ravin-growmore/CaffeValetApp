const mongoose = require('mongoose');
const User = require('./models/User');
const Venue = require('./models/Venue');
require('dotenv').config();

const seedData = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI is not set in .env file');
      process.exit(1);
    }

    if (process.env.MONGODB_URI.includes('YOUR_PASSWORD') || process.env.MONGODB_URI.includes('<db_password>')) {
      console.error('❌ Error: Please replace the password placeholder in backend/.env');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB —', mongoose.connection.name);
    console.log('');

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────
    const adminExists = await User.findOne({ phone: '7777777777' });
    if (!adminExists) {
      await new User({ name: 'Admin', phone: '7777777777', password: 'admin123', role: 'admin' }).save();
      console.log('✓ Created admin: Admin (7777777777)');
    } else {
      console.log('- Admin already exists: Admin (7777777777)');
    }

    // ─────────────────────────────────────────────
    // THANE LOCATION
    // ─────────────────────────────────────────────
    let thaneSupervisorId;
    const thaneSupervisor = await User.findOne({ phone: '8800000001' });
    if (!thaneSupervisor) {
      const ts = await new User({
        name: 'Thane Supervisor',
        phone: '8800000001',
        password: 'super123',
        role: 'supervisor'
      }).save();
      thaneSupervisorId = ts._id;
      console.log('✓ Created Thane Supervisor (8800000001)');
    } else {
      thaneSupervisorId = thaneSupervisor._id;
      console.log('- Thane Supervisor already exists (8800000001)');
    }

    const thaneDriver = await User.findOne({ phone: '9900000001' });
    if (!thaneDriver) {
      await new User({
        name: 'Thane Driver',
        phone: '9900000001',
        password: 'driver123',
        role: 'driver',
        supervisor: thaneSupervisorId
      }).save();
      console.log('✓ Created Thane Driver (9900000001) → assigned to Thane Supervisor');
    } else {
      console.log('- Thane Driver already exists (9900000001)');
    }

    // ─────────────────────────────────────────────
    // ANDHERI LOCATION
    // ─────────────────────────────────────────────
    let andheriSupervisorId;
    const andheriSupervisor = await User.findOne({ phone: '8800000002' });
    if (!andheriSupervisor) {
      const as = await new User({
        name: 'Andheri Supervisor',
        phone: '8800000002',
        password: 'super123',
        role: 'supervisor'
      }).save();
      andheriSupervisorId = as._id;
      console.log('✓ Created Andheri Supervisor (8800000002)');
    } else {
      andheriSupervisorId = andheriSupervisor._id;
      console.log('- Andheri Supervisor already exists (8800000002)');
    }

    const andheriDriver = await User.findOne({ phone: '9900000002' });
    if (!andheriDriver) {
      await new User({
        name: 'Andheri Driver',
        phone: '9900000002',
        password: 'driver123',
        role: 'driver',
        supervisor: andheriSupervisorId
      }).save();
      console.log('✓ Created Andheri Driver (9900000002) → assigned to Andheri Supervisor');
    } else {
      console.log('- Andheri Driver already exists (9900000002)');
    }

    // ─────────────────────────────────────────────
    // DEMO (legacy) — keep for backward compat
    // ─────────────────────────────────────────────
    let demoSupervisorId;
    const demoSupervisor = await User.findOne({ phone: '8888888888' });
    if (!demoSupervisor) {
      const ds = await new User({
        name: 'Demo Supervisor',
        phone: '8888888888',
        password: 'super123',
        role: 'supervisor'
      }).save();
      demoSupervisorId = ds._id;
      console.log('✓ Created Demo Supervisor (8888888888)');
    } else {
      demoSupervisorId = demoSupervisor._id;
      console.log('- Demo Supervisor already exists (8888888888)');
    }

    const demoDriver = await User.findOne({ phone: '9999999999' });
    if (!demoDriver) {
      await new User({
        name: 'Demo Driver',
        phone: '9999999999',
        password: 'driver123',
        role: 'driver',
        supervisor: demoSupervisorId
      }).save();
      console.log('✓ Created Demo Driver (9999999999)');
    } else {
      console.log('- Demo Driver already exists (9999999999)');
    }

    // ─────────────────────────────────────────────
    // VENUES
    // ─────────────────────────────────────────────
    const venues = [
      {
        name: 'Bonito - Thane',
        requiresUpfrontPayment: false,
        supervisor: thaneSupervisorId,
        isActive: true,
        parkingSpots: ['Bonito - Thane']
      },
      {
        name: 'Bonito - Andheri',
        requiresUpfrontPayment: false,
        supervisor: andheriSupervisorId,
        isActive: true,
        parkingSpots: ['Bonito - Andheri']
      },
      {
        name: 'Mall Parking',
        requiresUpfrontPayment: false,
        isActive: true,
        parkingSpots: ['M1', 'M2', 'M3', 'B1', 'B2', 'B3']
      },
      {
        name: 'Shopping Center',
        requiresUpfrontPayment: false,
        isActive: true,
        parkingSpots: ['P1', 'P2', 'P3', 'P4']
      },
      {
        name: 'Restaurant Zone',
        requiresUpfrontPayment: true,
        supervisor: demoSupervisorId,
        isActive: true,
        parkingSpots: ['R1', 'R2', 'R3']
      }
    ];

    for (const venueData of venues) {
      const existing = await Venue.findOne({ name: venueData.name });
      if (!existing) {
        await new Venue(venueData).save();
        console.log(`✓ Created venue: ${venueData.name} (${venueData.parkingSpots.length} spots)`);
      } else {
        // Update parking spots if empty
        if (!existing.parkingSpots || existing.parkingSpots.length === 0) {
          existing.parkingSpots = venueData.parkingSpots;
          await existing.save();
          console.log(`✓ Updated venue: ${venueData.name}`);
        } else {
          console.log(`- Venue already exists: ${venueData.name}`);
        }
      }
    }

    // ─────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────
    console.log('\n✓ Seed completed successfully!\n');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                     LOGIN CREDENTIALS                      │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  ADMIN                                                      │');
    console.log('│    Phone: 7777777777    Password: admin123                  │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  THANE LOCATION                                             │');
    console.log('│    Supervisor  Phone: 8800000001  Password: super123        │');
    console.log('│    Driver      Phone: 9900000001  Password: driver123       │');
    console.log('│    QR Link: /book/9900000001                                │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  ANDHERI LOCATION                                           │');
    console.log('│    Supervisor  Phone: 8800000002  Password: super123        │');
    console.log('│    Driver      Phone: 9900000002  Password: driver123       │');
    console.log('│    QR Link: /book/9900000002                                │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  DEMO (Legacy)                                              │');
    console.log('│    Supervisor  Phone: 8888888888  Password: super123        │');
    console.log('│    Driver      Phone: 9999999999  Password: driver123       │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('\n📍 Venues: Thane · Andheri · Mall Parking · Shopping Center · Restaurant Zone');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed error:', error.message);

    if (error.message.includes('authentication failed') || error.message.includes('bad auth')) {
      console.error('🔐 MongoDB Authentication Failed — check your password in backend/.env');
    } else if (error.message.includes('IP')) {
      console.error('🌐 IP not whitelisted — add your IP in MongoDB Atlas → Network Access');
    }

    process.exit(1);
  }
};

seedData();
