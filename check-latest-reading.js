const mongoose = require('mongoose');
require('dotenv').config();

const DeviceParameter = require('./models/DeviceParameter');

async function checkLatestReading() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard');
        console.log('Connected to MongoDB');

        const latestReading = await DeviceParameter.findOne()
            .sort({ reading_time: -1 })
            .lean();

        if (latestReading) {
            const now = new Date();
            const readingTime = new Date(latestReading.reading_time);
            const timeDiff = (now - readingTime) / 1000; // seconds

            console.log('\n=== LATEST READING ===');
            console.log('Reading Time:', readingTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
            console.log('Current Time:', now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
            console.log('Time Difference:', timeDiff.toFixed(0), 'seconds ago');
            console.log('\nReading Data:');
            console.log('- R Voltage:', latestReading.r_voltage, 'V');
            console.log('- Y Voltage:', latestReading.y_voltage, 'V');
            console.log('- B Voltage:', latestReading.b_voltage, 'V');
            console.log('- R Current:', latestReading.r_current, 'A');
            console.log('- Y Current:', latestReading.y_current, 'A');
            console.log('- B Current:', latestReading.b_current, 'A');
            console.log('- Frequency:', latestReading.frequency, 'Hz');

            if (timeDiff > 60) {
                console.log('\n⚠️  WARNING: Data is', Math.floor(timeDiff / 60), 'minutes old!');
            } else {
                console.log('\n✅ Data is fresh (less than 1 minute old)');
            }
        } else {
            console.log('No readings found in database');
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkLatestReading();
