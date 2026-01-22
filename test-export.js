const mongoose = require('mongoose');
const DeviceParameter = require('./models/DeviceParameter');
const Device = require('./models/Device');
const XLSX = require('xlsx');
require('dotenv').config();

// MOCK AUTH MIDDLEWARE
const auth = (req, res, next) => next();

async function testExport() {
    try {
        console.log('Connecting to DB...');
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/iot-dashboard';
        await mongoose.connect(uri);
        console.log('Connected.');

        console.log('Fetching readings...');
        const readings = await DeviceParameter.find()
            .populate('device_id', 'name location')
            .sort({ reading_time: -1 })
            .limit(10) // Limit to 10 for testing
            .lean();

        console.log(`Found ${readings.length} readings`);

        const excelData = readings.map(reading => ({
            'Device Name': reading.device_id?.name || 'Unknown',
            'Location': reading.device_id?.location || 'N/A',
            'Reading Time': reading.reading_time ? new Date(reading.reading_time).toLocaleString() : 'N/A',
            'R Voltage (V)': reading.r_voltage || 0,
        }));

        console.log('Creating workbook...');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'IoT Readings');

        console.log('Writing buffer...');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        console.log('Success! Buffer size:', buffer.length);
        process.exit(0);
    } catch (error) {
        console.error('TEST FAILED:', error);
        process.exit(1);
    }
}

testExport();
