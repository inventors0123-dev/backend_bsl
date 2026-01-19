const mongoose = require('mongoose');
const Device = require('./models/Device');
const DeviceMacAddress = require('./models/DeviceMacAddress');
require('dotenv').config();

const MAC = "AA:BB:CC:DD:EE:FF";

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_dashboard', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('✅ Connected to MongoDB');

    try {
        // 1. Ensure Device Exists
        let device = await Device.findOne({ name: "Demo Device" });
        if (!device) {
            device = new Device({
                name: "Demo Device",
                type: "Energy Meter",
                location: "Simulation",
                status: "active"
            });
            await device.save();
            console.log("✅ Created 'Demo Device'");
        } else {
            console.log("ℹ️ 'Demo Device' already exists");
        }

        // 2. Ensure MAC is Registered
        let mac = await DeviceMacAddress.findOne({ mac_address: MAC });
        if (!mac) {
            mac = new DeviceMacAddress({
                device_id: device._id,
                mac_address: MAC,
                description: "Auto-generated for simulation"
            });
            await mac.save();
            console.log(`✅ Registered MAC: ${MAC}`);
        } else {
            console.log(`ℹ️ MAC ${MAC} already registered`);
        }

        console.log("\n🎉 SETUP COMPLETE! You can now run the simulation.");

    } catch (err) {
        console.error("❌ Error seeding:", err);
    } finally {
        mongoose.disconnect();
    }
}).catch(err => {
    console.error("❌ Connect error:", err);
    process.exit(1);
});
