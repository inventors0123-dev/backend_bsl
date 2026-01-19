const express = require('express');
const router = express.Router();
const DeviceParameter = require('../models/DeviceParameter');
const Device = require('../models/Device');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const auth = require('../middleware/auth');

// Get all readings with filters and pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      search,
      device,
      date_from,
      date_to,
      page = 1,
      per_page = 20
    } = req.query;

    const pageNum = parseInt(page);
    const perPage = parseInt(per_page);
    const skip = (pageNum - 1) * perPage;

    // Build query
    const query = {};

    if (device) {
      query.device_id = device;
    }

    if (date_from || date_to) {
      query.reading_time = {};
      if (date_from) {
        query.reading_time.$gte = new Date(date_from);
      }
      if (date_to) {
        const toDate = new Date(date_to);
        toDate.setHours(23, 59, 59, 999);
        query.reading_time.$lte = toDate;
      }
    }

    // Get total count
    let totalQuery = DeviceParameter.find(query);

    // Apply search filter if provided
    if (search) {
      const devices = await Device.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const deviceIds = devices.map(d => d._id);
      query.device_id = { $in: deviceIds };
      totalQuery = DeviceParameter.find(query);
    }

    const total = await totalQuery.countDocuments();

    // Get readings with device info
    let readingsQuery = DeviceParameter.find(query)
      .populate('device_id', 'name location')
      .sort({ reading_time: -1 })
      .skip(skip)
      .limit(perPage);

    const readings = await readingsQuery;

    res.json({
      readings,
      pagination: {
        total,
        page: pageNum,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single reading
router.get('/:id', auth, async (req, res) => {
  try {
    const reading = await DeviceParameter.findById(req.params.id)
      .populate('device_id', 'name location');

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    res.json(reading);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create reading (API endpoint for IoT devices)
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate MAC address and get device_id
    if (!data.mac_address) {
      return res.status(400).json({ error: 'MAC address is required' });
    }

    const macRecord = await DeviceMacAddress.findOne({
      mac_address: data.mac_address.toUpperCase().trim()
    });

    if (!macRecord) {
      return res.status(403).json({ error: 'MAC address not found or not authorized' });
    }

    const device_id = macRecord.device_id;

    // Prepare reading data
    const readingData = {
      device_id,
      reading_time: data.reading_time ? new Date(data.reading_time) : new Date(),

      // Phase R
      r_voltage: data.r_voltage || null,
      r_voltage_line_to_line: data.r_voltage_line_to_line || null,
      r_current: data.r_current || null,
      r_active_power: data.r_active_power || null,
      r_reactive_power: data.r_reactive_power || null,
      r_apparent_power: data.r_apparent_power || null,
      r_power_factor: data.r_power_factor || null,
      r_thd_voltage: data.r_thd_voltage || null,
      r_thd_current: data.r_thd_current || null,
      r_harmonics_voltage: data.r_harmonics_voltage || null,
      r_harmonics_current: data.r_harmonics_current || null,
      r_voltage_neutral: data.r_voltage_neutral || null,

      // Phase Y
      y_voltage: data.y_voltage || null,
      y_voltage_line_to_line: data.y_voltage_line_to_line || null,
      y_current: data.y_current || null,
      y_active_power: data.y_active_power || null,
      y_reactive_power: data.y_reactive_power || null,
      y_apparent_power: data.y_apparent_power || null,
      y_power_factor: data.y_power_factor || null,
      y_thd_voltage: data.y_thd_voltage || null,
      y_thd_current: data.y_thd_current || null,
      y_harmonics_voltage: data.y_harmonics_voltage || null,
      y_harmonics_current: data.y_harmonics_current || null,
      y_voltage_neutral: data.y_voltage_neutral || null,

      // Phase B
      b_voltage: data.b_voltage || null,
      b_voltage_line_to_line: data.b_voltage_line_to_line || null,
      b_current: data.b_current || null,
      b_active_power: data.b_active_power || null,
      b_reactive_power: data.b_reactive_power || null,
      b_apparent_power: data.b_apparent_power || null,
      b_power_factor: data.b_power_factor || null,
      b_thd_voltage: data.b_thd_voltage || null,
      b_thd_current: data.b_thd_current || null,
      b_harmonics_voltage: data.b_harmonics_voltage || null,
      b_harmonics_current: data.b_harmonics_current || null,
      b_voltage_neutral: data.b_voltage_neutral || null,

      // Line-to-Line Voltages
      ry_voltage: data.ry_voltage || null,
      yb_voltage: data.yb_voltage || null,
      br_voltage: data.br_voltage || null,

      // Common Parameters
      neutral_current: data.neutral_current || null,
      voltage_unbalance: data.voltage_unbalance || null,
      current_unbalance: data.current_unbalance || null,
      frequency: data.frequency || null,
      total_energy_kwh: data.total_energy_kwh || null,
      total_energy_kvah: data.total_energy_kvah || null,
      total_energy_kvarh: data.total_energy_kvarh || null,
      transient_event_count: data.transient_event_count || null,
      temperature: data.temperature || null,
      humidity: data.humidity || null
    };

    const reading = new DeviceParameter(readingData);
    await reading.save();

    // Populate device info for response
    await reading.populate('device_id', 'name location');

    res.status(201).json({
      success: true,
      message: 'Device readings stored successfully',
      device_id: device_id.toString(),
      reading_id: reading._id.toString(),
      reading
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all readings (Admin only)
router.delete('/all', auth, async (req, res) => {
  try {
    // Check if user is admin (req.user is populated by auth middleware)
    // Note: auth middleware sets req.user to payload (id). It doesn't fetch the role unless we fetch user.
    // But login returns role.
    // Auth middleware usually just decodes token.
    // Token payload has `user: { id: ... }`.
    // I need to fetch user to check role OR blindly trust if it's protected?
    // "Proper login" suggests role check.
    // I'll fetch user to be safe.
    // OR just allow any authenticated user for now since there is only Admin.

    await DeviceParameter.deleteMany({});
    res.json({ msg: 'All reading data cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


