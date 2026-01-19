/**
 * Test Alert Generation
 * This script will:
 * 1. Check if Alert Generator is running
 * 2. Lower the thresholds to trigger alerts
 * 3. Wait for alerts to be generated
 */

const mongoose = require('mongoose');
const SystemSettings = require('./models/SystemSettings');
const Alert = require('./models/Alert');
const alertGenerator = require('./services/alertGenerator');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard';

async function testAlerts() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB\n');

        // Step 1: Check current settings
        console.log('📋 Current System Settings:');
        let settings = await SystemSettings.findOne({ singleton: true });

        if (!settings) {
            console.log('⚠️  No settings found. Creating defaults...');
            settings = new SystemSettings({ singleton: true });
            await settings.save();
        }

        console.log(`   Voltage Max: ${settings.voltage_max}V`);
        console.log(`   Voltage Min: ${settings.voltage_min}V`);
        console.log(`   Current Max: ${settings.current_max}A`);
        console.log(`   PF Min: ${settings.pf_min}`);
        console.log(`   Notifications: ${settings.notifications_enabled}`);
        console.log(`   Check Interval: ${settings.alert_check_interval}ms\n`);

        // Step 2: Lower thresholds to TRIGGER alerts
        console.log('🎯 Setting LOW thresholds to trigger alerts...');
        settings.voltage_max = 232;  // Lower than our ~230-235V range
        settings.voltage_min = 228;  // In the middle of our range
        settings.current_max = 11;   // Lower than our ~8-12A range
        settings.pf_min = 0.99;      // Higher than our ~0.94-1.04 range
        settings.notifications_enabled = true;
        settings.alert_check_interval = 10000; // 10 seconds for faster testing

        await settings.save();
        console.log('✅ Thresholds updated!\n');

        // Step 3: Check alert generator status
        console.log('🔍 Checking Alert Generator...');
        const status = alertGenerator.getStatus();
        console.log(`   Running: ${status.running}`);
        console.log(`   Interval: ${status.check_interval}ms\n`);

        if (!status.running) {
            console.log('🚀 Starting Alert Generator...');
            await alertGenerator.start();
            console.log('✅ Alert Generator started!\n');
        }

        // Step 4: Force a check immediately
        console.log('⚡ Running immediate alert check...');
        await alertGenerator.checkForAlerts();
        console.log('✅ Check complete!\n');

        // Step 5: Wait and check for alerts
        console.log('⏳ Waiting 15 seconds for alerts to generate...\n');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Step 6: Display generated alerts
        const alerts = await Alert.find().populate('device_id', 'name').sort('-createdAt').limit(10);

        console.log(`📊 Recent Alerts (${alerts.length} found):\n`);

        if (alerts.length === 0) {
            console.log('⚠️  No alerts generated yet!');
            console.log('\n💡 Possible reasons:');
            console.log('   1. No recent readings in database');
            console.log('   2. All readings are within thresholds');
            console.log('   3. Alert generator not checking properly');
            console.log('\n   Try: Make sure the simulator is running!');
        } else {
            alerts.forEach((alert, index) => {
                const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
                console.log(`${icon} Alert ${index + 1}:`);
                console.log(`   Device: ${alert.device_id?.name || 'Unknown'}`);
                console.log(`   Type: ${alert.alert_type}`);
                console.log(`   Severity: ${alert.severity}`);
                console.log(`   Message: ${alert.message}`);
                console.log(`   Value: ${alert.value} | Threshold: ${alert.threshold}`);
                console.log(`   Time: ${alert.createdAt.toLocaleString()}`);
                console.log(`   Resolved: ${alert.resolved}`);
                console.log('');
            });
        }

        console.log('\n✨ Test complete!');
        console.log('\n📝 Next steps:');
        console.log('   1. Refresh your dashboard to see alerts');
        console.log('   2. Check the Alerts widget');
        console.log('   3. Go to /alerts page for full list');
        console.log('\n💡 Tip: The alert generator runs every 10 seconds now (was 60)');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testAlerts();
