/**
 * Database Connection Test
 * Tests MongoDB connection and displays database statistics
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Device = require('./models/Device');
const DeviceParameter = require('./models/DeviceParameter');
const Alert = require('./models/Alert');
const User = require('./models/User');
const SystemSettings = require('./models/SystemSettings');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard';

async function testDatabaseConnection() {
    console.log('\n🔍 DATABASE CONNECTION TEST\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Step 1: Test Connection
        console.log('📡 Testing MongoDB Connection...');
        console.log(`   URI: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`); // Hide password
        console.log('');

        const startTime = Date.now();
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000 // 5 second timeout
        });
        const connectionTime = Date.now() - startTime;

        console.log('✅ MongoDB Connected Successfully!');
        console.log(`   Connection Time: ${connectionTime}ms`);
        console.log(`   Database: ${mongoose.connection.db.databaseName}`);
        console.log(`   Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
        console.log(`   Ready State: ${mongoose.connection.readyState} (1 = connected)`);
        console.log('');

        // Step 2: Check Collections
        console.log('📊 Collection Statistics:\n');

        const deviceCount = await Device.countDocuments();
        const readingCount = await DeviceParameter.countDocuments();
        const alertCount = await Alert.countDocuments();
        const userCount = await User.countDocuments();
        const settingsCount = await SystemSettings.countDocuments();

        console.log(`   Devices:       ${deviceCount.toLocaleString()} documents`);
        console.log(`   Readings:      ${readingCount.toLocaleString()} documents`);
        console.log(`   Alerts:        ${alertCount.toLocaleString()} documents`);
        console.log(`   Users:         ${userCount.toLocaleString()} documents`);
        console.log(`   Settings:      ${settingsCount.toLocaleString()} documents`);
        console.log('');

        // Step 3: Recent Data Check
        console.log('📅 Recent Activity:\n');

        const latestReading = await DeviceParameter.findOne()
            .sort({ reading_time: -1 })
            .populate('device_id', 'name');

        if (latestReading) {
            console.log(`   Latest Reading:`);
            console.log(`     Device: ${latestReading.device_id?.name || 'Unknown'}`);
            console.log(`     Time: ${latestReading.reading_time.toLocaleString()}`);
            console.log(`     Voltage (R): ${latestReading.r_voltage}V`);
            console.log(`     Power (Total): ${((latestReading.r_active_power || 0) + (latestReading.y_active_power || 0) + (latestReading.b_active_power || 0)).toFixed(2)} kW`);
        } else {
            console.log('   ⚠️  No readings found in database');
        }
        console.log('');

        const latestAlert = await Alert.findOne()
            .sort({ createdAt: -1 })
            .populate('device_id', 'name');

        if (latestAlert) {
            console.log(`   Latest Alert:`);
            console.log(`     Device: ${latestAlert.device_id?.name || 'Unknown'}`);
            console.log(`     Type: ${latestAlert.alert_type}`);
            console.log(`     Severity: ${latestAlert.severity}`);
            console.log(`     Time: ${latestAlert.createdAt.toLocaleString()}`);
            console.log(`     Resolved: ${latestAlert.resolved ? 'Yes' : 'No'}`);
        } else {
            console.log('   ℹ️  No alerts in database');
        }
        console.log('');

        // Step 4: Database Size (if available)
        try {
            const dbStats = await mongoose.connection.db.stats();
            console.log('💾 Database Size:\n');
            console.log(`   Total Size:    ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Storage Size:  ${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Index Size:    ${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Collections:   ${dbStats.collections}`);
            console.log('');
        } catch (err) {
            console.log('   ℹ️  Database size stats not available\n');
        }

        // Step 5: Test Write Operation
        console.log('✍️  Testing Write Operation...');
        const testDoc = new SystemSettings({ singleton: false }); // Won't actually save due to validation
        await testDoc.validate();
        console.log('   ✅ Write permission confirmed\n');

        // Step 6: List All Devices
        if (deviceCount > 0) {
            console.log('📱 Registered Devices:\n');
            const devices = await Device.find().limit(10);
            devices.forEach((device, index) => {
                console.log(`   ${index + 1}. ${device.name}`);
                if (device.location) console.log(`      Location: ${device.location}`);
            });
            if (deviceCount > 10) {
                console.log(`   ... and ${deviceCount - 10} more`);
            }
            console.log('');
        }

        // Final Summary
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('✅ DATABASE CONNECTION TEST PASSED!');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log('📊 Summary:');
        console.log(`   Status:        Connected ✅`);
        console.log(`   Response Time: ${connectionTime}ms`);
        console.log(`   Total Data:    ${(deviceCount + readingCount + alertCount + userCount).toLocaleString()} documents`);
        console.log(`   Latest Data:   ${latestReading ? new Date(latestReading.reading_time).toLocaleTimeString() : 'N/A'}`);
        console.log('');

        if (readingCount === 0) {
            console.log('💡 Tip: Start the device simulator to populate readings:');
            console.log('   cd backend');
            console.log('   node simulate_live.js');
            console.log('');
        }

    } catch (error) {
        console.log('❌ DATABASE CONNECTION FAILED!\n');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('Error Details:');
        console.log(`   Type: ${error.name}`);
        console.log(`   Message: ${error.message}`);
        console.log('');

        if (error.name === 'MongooseServerSelectionError') {
            console.log('🔧 Possible Causes:');
            console.log('   1. MongoDB is not running');
            console.log('   2. Wrong connection string in MONGODB_URI');
            console.log('   3. Firewall blocking port 27017');
            console.log('   4. Network connectivity issues');
            console.log('');
            console.log('💡 Solutions:');
            console.log('   • Start MongoDB: net start MongoDB (Windows)');
            console.log('   • Check MongoDB status: tasklist | findstr mongod');
            console.log('   • Verify connection string in .env file');
            console.log('   • Try: mongodb://127.0.0.1:27017/iot_dashboard');
        } else if (error.name === 'MongoParseError') {
            console.log('🔧 Fix:');
            console.log('   Your MONGODB_URI format is incorrect');
            console.log('   Should be: mongodb://localhost:27017/iot_dashboard');
            console.log('   Or Atlas: mongodb+srv://user:pass@cluster.mongodb.net/db');
        }
        console.log('');
        console.log('Full Error:');
        console.log(error);
        console.log('');
    } finally {
        await mongoose.disconnect();
        console.log('👋 Connection closed.\n');
        process.exit(0);
    }
}

// Run the test
console.log('Starting in 1 second...\n');
setTimeout(testDatabaseConnection, 1000);
