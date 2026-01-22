const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceParameter = require('../models/DeviceParameter');
const mongoose = require('mongoose');

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const totalDevices = await Device.countDocuments();
    const totalReadings = await DeviceParameter.countDocuments();

    // Recent readings (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const recentReadings = await DeviceParameter.countDocuments({
      reading_time: { $gte: oneDayAgo }
    });

    // Active devices (with readings in last hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const activeDevices = await DeviceParameter.distinct('device_id', {
      reading_time: { $gte: oneHourAgo }
    });

    res.json({
      total_devices: totalDevices,
      total_readings: totalReadings,
      recent_readings: recentReadings,
      active_devices: activeDevices.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent readings for dashboard
router.get('/recent-readings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const readings = await DeviceParameter.find()
      .populate('device_id', 'name location')
      .sort({ reading_time: -1 })
      .limit(limit);
    // Removed .select() to return ALL fields including y_voltage, y_current, y_active_power, b_voltage, b_current, b_active_power

    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get device status
router.get('/device-status', async (req, res) => {
  try {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const devices = await Device.find();

    const deviceStatus = await Promise.all(
      devices.map(async (device) => {
        const lastReading = await DeviceParameter.findOne({ device_id: device._id })
          .sort({ reading_time: -1 })
          .select('reading_time');

        const isActive = lastReading && lastReading.reading_time >= oneHourAgo;

        return {
          id: device._id,
          name: device.name,
          location: device.location,
          status: isActive ? 'active' : 'inactive',
          last_reading: lastReading?.reading_time || null
        };
      })
    );

    res.json(deviceStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chart data for dashboard
router.get('/chart-data', async (req, res) => {
  try {
    const { type = 'power', deviceId } = req.query;
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    if (type === 'power') {
      // Build match query
      const matchQuery = {
        reading_time: { $gte: oneDayAgo }
      };

      if (deviceId) {
        matchQuery.device_id = new mongoose.Types.ObjectId(deviceId);
      }

      // Power consumption over last 24 hours (hourly)
      const readings = await DeviceParameter.aggregate([
        {
          $match: matchQuery
        },
        {
          $group: {
            _id: {
              year: { $year: '$reading_time' },
              month: { $month: '$reading_time' },
              day: { $dayOfMonth: '$reading_time' },
              hour: { $hour: '$reading_time' }
            },
            avg_power: {
              $avg: {
                $add: [
                  { $ifNull: ['$r_active_power', 0] },
                  { $ifNull: ['$y_active_power', 0] },
                  { $ifNull: ['$b_active_power', 0] }
                ]
              }
            },
            avg_frequency: { $avg: '$frequency' },
            avg_temperature: { $avg: '$temperature' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]);

      res.json(readings.map(r => ({
        hour: `${String(r._id.hour).padStart(2, '0')}:00`,
        avg_power: r.avg_power || 0,
        avg_frequency: r.avg_frequency || 0,
        avg_temperature: r.avg_temperature || 0
      })));
    } else if (type === 'device-power') {
      // Device power distribution
      // Increased window to 24h to match general stats and catch intermittent devices
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const devicePower = await DeviceParameter.aggregate([
        {
          $match: {
            reading_time: { $gte: oneDayAgo }
          }
        },
        {
          $group: {
            _id: '$device_id',
            avg_power: {
              $avg: {
                $add: [
                  { $ifNull: ['$r_active_power', 0] },
                  { $ifNull: ['$y_active_power', 0] },
                  { $ifNull: ['$b_active_power', 0] }
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'devices',
            localField: '_id',
            foreignField: '_id',
            as: 'device'
          }
        },
        {
          $unwind: '$device'
        },
        {
          $project: {
            device_name: '$device.name',
            avg_power: 1
          }
        },
        { $sort: { avg_power: -1 } }
      ]);

      res.json(devicePower);
    } else if (type === 'voltage-trends') {
      // Voltage trends (last 24 hours, 1-hour intervals)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const voltageTrends = await DeviceParameter.aggregate([
        {
          $match: {
            reading_time: { $gte: oneDayAgo }
          }
        },
        {
          $group: {
            _id: {
              hour: { $hour: '$reading_time' },
              minute: {
                $subtract: [
                  { $minute: '$reading_time' },
                  { $mod: [{ $minute: '$reading_time' }, 30] }
                ]
              }
            },
            r_voltage: { $avg: '$r_voltage' },
            y_voltage: { $avg: '$y_voltage' },
            b_voltage: { $avg: '$b_voltage' }
          }
        },
        { $sort: { '_id.hour': 1, '_id.minute': 1 } }
      ]);

      // Format time in JavaScript for better compatibility
      const formattedTrends = voltageTrends.map(item => ({
        time: `${String(item._id.hour).padStart(2, '0')}:${String(item._id.minute).padStart(2, '0')}`,
        r_voltage: item.r_voltage || 0,
        y_voltage: item.y_voltage || 0,
        b_voltage: item.b_voltage || 0
      }));

      res.json(formattedTrends);
    } else {
      res.status(400).json({ error: 'Invalid chart type' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


