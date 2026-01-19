const mongoose = require('mongoose');
const Device = require('./models/Device');
const DeviceMacAddress = require('./models/DeviceMacAddress');
require('dotenv').config();

const MAC_ADDRESS = 'AA:BB:CC:DD:EE:FF';

async function seed() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Check if MAC address exists
        let macRecord = await DeviceMacAddress.findOne({ mac_address: MAC_ADDRESS });

        if (macRecord) {
            console.log(`MAC Address ${MAC_ADDRESS} already exists linked to device ID: ${macRecord.device_id}`);
        } else {
            console.log(`MAC Address ${MAC_ADDRESS} not found. Creating new device...`);

            // Create new Device
            const device = new Device({
                name: 'Test Device A',
                location: 'Server Room'
            });
            await device.save();
            console.log('Created Device:', device._id);

            // Create DeviceMacAddress
            macRecord = new DeviceMacAddress({
                device_id: device._id,
                mac_address: MAC_ADDRESS
            });
            await macRecord.save();
            console.log(`Linked MAC ${MAC_ADDRESS} to Device ${device._id}`);
        }

        mongoose.connection.close();
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seed();
