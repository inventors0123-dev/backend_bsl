const express = require('express');
const router = express.Router();
const DeviceMacAddress = require('../models/DeviceMacAddress');
const Device = require('../models/Device');

// Get all MAC addresses (optionally filtered by device)
router.get('/', async (req, res) => {
  try {
    const { device_id } = req.query;
    
    const query = device_id ? { device_id } : {};
    
    const macAddresses = await DeviceMacAddress.find(query)
      .populate('device_id', 'name location')
      .sort({ createdAt: -1 });
    
    res.json(macAddresses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get MAC addresses for a specific device
router.get('/device/:deviceId', async (req, res) => {
  try {
    const macAddresses = await DeviceMacAddress.find({ device_id: req.params.deviceId })
      .populate('device_id', 'name location')
      .sort({ createdAt: -1 });
    
    res.json(macAddresses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add MAC address
router.post('/', async (req, res) => {
  try {
    const { device_id, mac_address } = req.body;
    
    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    if (!mac_address) {
      return res.status(400).json({ error: 'MAC address is required' });
    }
    
    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(mac_address)) {
      return res.status(400).json({ error: 'Please enter a valid MAC address (format: XX:XX:XX:XX:XX:XX)' });
    }
    
    // Check if device exists
    const device = await Device.findById(device_id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Format MAC address (uppercase, colons)
    const formattedMac = mac_address.toUpperCase().replace(/-/g, ':');
    
    const macAddress = new DeviceMacAddress({
      device_id,
      mac_address: formattedMac
    });
    
    await macAddress.save();
    await macAddress.populate('device_id', 'name location');
    
    res.status(201).json(macAddress);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'This MAC address is already assigned to this device' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete MAC address
router.delete('/:id', async (req, res) => {
  try {
    const macAddress = await DeviceMacAddress.findByIdAndDelete(req.params.id);
    
    if (!macAddress) {
      return res.status(404).json({ error: 'MAC address not found' });
    }
    
    res.json({ message: 'MAC address deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


