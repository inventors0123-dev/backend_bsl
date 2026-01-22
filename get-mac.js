const mongoose = require('mongoose');
const DeviceMacAddress = require('./models/DeviceMacAddress');

mongoose.connect('mongodb://localhost:27017/iot_dashboard').then(async () => {
    const mac = await DeviceMacAddress.findOne();
    console.log('Valid MAC:', mac ? mac.mac_address : 'None found');
    process.exit(0);
});
