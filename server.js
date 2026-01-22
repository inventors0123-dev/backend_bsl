const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// External API Sync Service
const externalApiSync = require('./services/externalApiSync');

// Alert Generator Service
const alertGenerator = require('./services/alertGenerator');

// Models
const User = require('./models/User');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const auth = require('./middleware/auth');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', auth, require('./routes/devices'));
app.use('/api/readings', require('./routes/readings')); // Protected inside for GET, public for POST (sensors)
app.use('/api/mac-addresses', auth, require('./routes/macAddresses'));
app.use('/api/stats', auth, require('./routes/stats'));
app.use('/api/tasks', auth, require('./routes/tasks'));
app.use('/api/users', require('./routes/users')); // Internal auth
app.use('/api/alerts', auth, require('./routes/alerts'));
app.use('/api/settings', auth, require('./routes/settings'));

// Root Route
app.get('/', (req, res) => {
  res.send('IoT Dashboard Backend is Running 🚀. Use /api/health to check status.');
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'IoT Dashboard API is running' });
});

app.post('/api/alerts/generator/start', (req, res) => {
  alertGenerator.start();
  res.json({ message: 'Alert generator started', status: alertGenerator.getStatus() });
});

app.post('/api/alerts/generator/stop', (req, res) => {
  alertGenerator.stop();
  res.json({ message: 'Alert generator stopped', status: alertGenerator.getStatus() });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // Seed Admin User
    try {
      const adminEmail = 'admin@bsl.com';
      const adminPassword = 'Admin@123';
      let admin = await User.findOne({ email: adminEmail });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);

      if (!admin) {
        admin = new User({
          name: 'BSL Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin'
        });
        await admin.save();
        console.log(`👤 Admin user created: ${adminEmail} / ${adminPassword}`);
      } else {
        // Enforce password update to match request
        admin.password = hashedPassword;
        await admin.save();
        console.log(`✅ Admin password enforced: ${adminEmail} / ${adminPassword}`);
      }
    } catch (err) {
      console.error('⚠️ User seeding error:', err);
    }

    // External API Sync Service (enabled with new clean API)
    console.log('\n🌐 Starting External API Sync (Connecting to Hostinger)...');
    externalApiSync.start();


    // Start Alert Generator Service
    console.log('\n🚨 Starting Alert Generator Service...');
    setTimeout(() => {
      alertGenerator.start();
    }, 2000); // Wait 2 seconds after server start

    console.log('\n📡 Ready to receive data at: http://localhost:5000/api/readings');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
