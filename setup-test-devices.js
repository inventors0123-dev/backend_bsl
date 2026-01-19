/**
 * Quick Setup Script
 * Seeds database with devices and MAC addresses for testing
 */

const mongoose = require('mongoose');
const Device = require('./models/Device');
const DeviceMacAddress = require('./models/DeviceMacAddress');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard';

async function setupDevices() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB\n');

        // Create test devices
        const devicesData = [
            { name: 'Panel-A', location: 'Building A - Floor 1' },
            { name: 'Panel-B', location: 'Building A - Floor 2' },
            { name: 'Panel-C', location: 'Building B - Floor 1' }
        ];

        console.log('📦 Creating devices...');
        const devices = [];

        for (const deviceData of devicesData) {
            let device = await Device.findOne({ name: deviceData.name });

            if (!device) {
                device = await Device.create(deviceData);
                console.log(`  ✅ Created device: ${device.name}`);
            } else {
                console.log(`  ℹ️  Device already exists: ${device.name}`);
            }

            devices.push(device);
        }

        // Create MAC addresses
        const macAddresses = [
            { mac: 'AA:BB:CC:DD:EE:FF', deviceIndex: 0 },
            { mac: '11:22:33:44:55:66', deviceIndex: 1 },
            { mac: 'AA:11:BB:22:CC:33', deviceIndex: 2 }
        ];

        console.log('\n📡 Registering MAC addresses...');

        for (const macData of macAddresses) {
            const device = devices[macData.deviceIndex];

            const existingMac = await DeviceMacAddress.findOne({
                mac_address: macData.mac
            });

            if (!existingMac) {
                await DeviceMacAddress.create({
                    device_id: device._id,
                    mac_address: macData.mac
                });
                console.log(`  ✅ Registered MAC ${macData.mac} → ${device.name}`);
            } else {
                console.log(`  ℹ️  MAC already registered: ${macData.mac}`);
            }
        }

        console.log('\n✨ Setup complete!');
        console.log('\n📋 Summary:');
        console.log(`   Devices: ${devices.length}`);
        console.log(`   MAC Addresses: ${macAddresses.length}`);
        console.log('\n🚀 You can now run the simulator:');
        console.log('   node simulate_live.js\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

setupDevices();
