const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceParameter = require('../models/DeviceParameter');
const DeviceMacAddress = require('../models/DeviceMacAddress');

// Get all devices with statistics
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find().sort({ createdAt: -1 });

    const devicesWithStats = await Promise.all(
      devices.map(async (device) => {
        const readingCount = await DeviceParameter.countDocuments({ device_id: device._id });
        const macCount = await DeviceMacAddress.countDocuments({ device_id: device._id });
        const lastReading = await DeviceParameter.findOne({ device_id: device._id })
          .sort({ reading_time: -1 })
          .select('reading_time');

        return {
          ...device.toObject(),
          reading_count: readingCount,
          mac_count: macCount,
          last_reading: lastReading?.reading_time || null
        };
      })
    );

    res.json(devicesWithStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single device
// Get single device with details
router.get('/:id', async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const readingCount = await DeviceParameter.countDocuments({ device_id: device._id });
    const macCount = await DeviceMacAddress.countDocuments({ device_id: device._id });
    const lastReading = await DeviceParameter.findOne({ device_id: device._id })
      .sort({ reading_time: -1 })
      .select('reading_time');

    const macAddresses = await DeviceMacAddress.find({ device_id: device._id });

    res.json({
      ...device.toObject(),
      reading_count: readingCount,
      mac_count: macCount,
      last_reading: lastReading?.reading_time || null,
      mac_addresses: macAddresses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create device
router.post('/', async (req, res) => {
  try {
    const { name, location } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    const device = new Device({ name: name.trim(), location: location?.trim() || '' });
    await device.save();
    res.status(201).json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update device
router.put('/:id', async (req, res) => {
  try {
    const { name, location } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    const device = await Device.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), location: location?.trim() || '' },
      { new: true, runValidators: true }
    );

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete device
router.delete('/:id', async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Delete associated readings and MAC addresses (cascade delete)
    await DeviceParameter.deleteMany({ device_id: device._id });
    await DeviceMacAddress.deleteMany({ device_id: device._id });
    await Device.findByIdAndDelete(req.params.id);

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


