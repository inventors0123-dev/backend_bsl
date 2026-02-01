const mongoose = require('mongoose');

async function checkPowerData() {
    await mongoose.connect('mongodb://localhost:27017/iot_dashboard');

    const DeviceParameter = require('./models/DeviceParameter');

    // Check what "today" means in different timezones
    const startOfTodayLocal = new Date();
    startOfTodayLocal.setHours(0, 0, 0, 0);

    const startOfTodayUTC = new Date();
    startOfTodayUTC.setUTCHours(0, 0, 0, 0);

    console.log('Start of today (local):', startOfTodayLocal.toISOString());
    console.log('Start of today (UTC):', startOfTodayUTC.toISOString());
    console.log('Current time:', new Date().toISOString());

    // Count readings from local midnight
    const countLocal = await DeviceParameter.countDocuments({
        reading_time: { $gte: startOfTodayLocal }
    });

    // Count readings from UTC midnight
    const countUTC = await DeviceParameter.countDocuments({
        reading_time: { $gte: startOfTodayUTC }
    });

    console.log('\nReadings since local midnight:', countLocal);
    console.log('Readings since UTC midnight:', countUTC);

    // Get sample power values
    const samples = await DeviceParameter.find({
        reading_time: { $gte: startOfTodayLocal }
    }).limit(3).select('r_active_power y_active_power b_active_power reading_time');

    console.log('\nSample readings:');
    samples.forEach(s => {
        const total = (s.r_active_power || 0) + (s.y_active_power || 0) + (s.b_active_power || 0);
        console.log(`Time: ${s.reading_time.toISOString()}, Total Power: ${total.toFixed(2)} kW`);
    });

    // Calculate average
    const result = await DeviceParameter.aggregate([
        { $match: { reading_time: { $gte: startOfTodayLocal } } },
        {
            $group: {
                _id: null,
                avgPower: {
                    $avg: {
                        $add: [
                            { $ifNull: ['$r_active_power', 0] },
                            { $ifNull: ['$y_active_power', 0] },
                            { $ifNull: ['$b_active_power', 0] }
                        ]
                    }
                }
            }
        }
    ]);

    if (result.length > 0) {
        console.log('\nAverage power today:', result[0].avgPower.toFixed(2), 'kW');
        const hoursElapsed = (new Date() - startOfTodayLocal) / (1000 * 60 * 60);
        console.log('Hours elapsed:', hoursElapsed.toFixed(2));
        console.log('Energy consumption:', (result[0].avgPower * hoursElapsed).toFixed(2), 'kWh');
    }

    await mongoose.disconnect();
}

checkPowerData().catch(console.error);
