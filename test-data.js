// Quick test script to check MongoDB data
const mongoose = require('mongoose');
const DeviceParameter = require('./models/DeviceParameter');

mongoose.connect('mongodb://localhost:27017/iot_dashboard')
    .then(async () => {
        console.log('Connected to MongoDB');

        // Get the latest reading
        const latest = await DeviceParameter.findOne()
            .sort({ reading_time: -1 })
            .limit(1);

        console.log('\n=== LATEST READING ===');
        console.log('R Phase Power:', latest?.r_active_power);
        console.log('Y Phase Power:', latest?.y_active_power);
        console.log('B Phase Power:', latest?.b_active_power);
        console.log('Frequency:', latest?.frequency);
        console.log('Total Energy:', latest?.total_energy_kwh);
        console.log('Reading Time:', latest?.reading_time);

        console.log('\n=== FULL READING DATA ===');
        console.log(JSON.stringify(latest, null, 2));

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
