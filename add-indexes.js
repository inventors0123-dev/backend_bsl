/**
 * Database Index Setup Script
 * Run once to add performance-critical indexes
 * Usage: node add-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function addIndexes() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        console.log('\n📝 Creating indexes...\n');

        // DeviceParameter indexes (most critical)
        console.log('1️⃣ Creating DeviceParameter indexes...');
        await db.collection('deviceparameters').createIndex(
            { reading_time: -1 },
            { name: 'reading_time_-1', background: true }
        );
        console.log('  ✅ reading_time index created');

        await db.collection('deviceparameters').createIndex(
            { device_id: 1 },
            { name: 'device_id_1', background: true }
        );
        console.log('  ✅ device_id index created');

        await db.collection('deviceparameters').createIndex(
            { device_id: 1, reading_time: -1 },
            { name: 'device_id_1_reading_time_-1', background: true }
        );
        console.log('  ✅ compound (device_id + reading_time) index created');

        // DeviceMacAddress index
        console.log('\n2️⃣ Creating DeviceMacAddress indexes...');
        await db.collection('devicemacaddresses').createIndex(
            { mac_address: 1 },
            { name: 'mac_address_1', unique: true, background: true }
        );
        console.log('  ✅ mac_address unique index created');

        // Device index (if needed)
        console.log('\n3️⃣ Creating Device indexes...');
        await db.collection('devices').createIndex(
            { name: 1 },
            { name: 'name_1', background: true }
        );
        console.log('  ✅ device name index created');

        console.log('\n✅ All indexes created successfully!\n');

        // List all indexes
        console.log('📋 Current DeviceParameter indexes:');
        const indexes = await db.collection('deviceparameters').listIndexes().toArray();
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        console.log('\n📊 Index Statistics:');
        const stats = await db.collection('deviceparameters').stats();
        console.log(`  Documents: ${stats.count}`);
        console.log(`  Total Index Size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        console.log('🎉 Index setup complete!\n');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

addIndexes();
