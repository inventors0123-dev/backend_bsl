const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceParameter = require('../models/DeviceParameter');
const mongoose = require('mongoose');

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const period = req.query.period || 'today'; // 'today' or 'month'

    let startOfPeriod = new Date();

    if (period === 'month') {
      // Start of current month (1st day at 00:00:00)
      startOfPeriod.setDate(1);
      startOfPeriod.setHours(0, 0, 0, 0);
    } else {
      // Start of today (00:00:00)
      startOfPeriod.setHours(0, 0, 0, 0);
    }

    // 1. kWh Today - Daily Energy Consumption
    const dailyEnergyStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $group: {
          _id: "$device_id",
          minEnergy: { $min: "$total_energy_kwh" },
          maxEnergy: { $max: "$total_energy_kwh" }
        }
      },
      {
        $project: {
          consumption: { $subtract: ["$maxEnergy", "$minEnergy"] }
        }
      }
    ]);
    const kwhToday = dailyEnergyStats.reduce((acc, curr) => acc + (curr.consumption || 0), 0) / 1000;

    // 2. Peak kW Today - Maximum total active power
    const peakKwStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $project: {
          total_kw: {
            $divide: [
              {
                $add: [
                  { $ifNull: ['$r_active_power', 0] },
                  { $ifNull: ['$y_active_power', 0] },
                  { $ifNull: ['$b_active_power', 0] }
                ]
              },
              1000 // Convert W to kW
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          peak_kw: { $max: "$total_kw" }
        }
      }
    ]);
    const peakKwToday = peakKwStats.length > 0 ? peakKwStats[0].peak_kw : 0;

    // 2b. Avg kW (today) - Average power consumption
    // Avg_kW_day = AVERAGE(kW(t)) for today
    // Simple average is fine because samples are every 10 sec
    const avgKwStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $project: {
          kw: {
            $divide: [
              {
                $add: [
                  { $ifNull: ['$r_active_power', 0] },
                  { $ifNull: ['$y_active_power', 0] },
                  { $ifNull: ['$b_active_power', 0] }
                ]
              },
              1000
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avg_kw: { $avg: "$kw" }
        }
      }
    ]);
    const avgKwToday = avgKwStats.length > 0 ? avgKwStats[0].avg_kw : 0;

    // 3. PF Today (system) - Weighted average power factor
    // kW_total = (PR + PY + PB) / 1000
    // kVA_total = (SR + SY + SB) / 1000
    // PF = kW_total / kVA_total
    const pfStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $project: {
          kw_total: {
            $divide: [
              {
                $add: [
                  { $ifNull: ['$r_active_power', 0] },
                  { $ifNull: ['$y_active_power', 0] },
                  { $ifNull: ['$b_active_power', 0] }
                ]
              },
              1000
            ]
          },
          kva_total: {
            $divide: [
              {
                $add: [
                  { $ifNull: ['$r_apparent_power', 0] },
                  { $ifNull: ['$y_apparent_power', 0] },
                  { $ifNull: ['$b_apparent_power', 0] }
                ]
              },
              1000
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          sum_kw: { $sum: "$kw_total" },
          sum_kva: { $sum: "$kva_total" }
        }
      }
    ]);
    const pfToday = (pfStats.length > 0 && pfStats[0].sum_kva > 0)
      ? (pfStats[0].sum_kw / pfStats[0].sum_kva)
      : 0;

    // 4. kVArh Today - Reactive energy
    const kvarhStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $group: {
          _id: "$device_id",
          minKvarh: { $min: "$total_energy_kvarh" },
          maxKvarh: { $max: "$total_energy_kvarh" }
        }
      },
      {
        $project: {
          consumption: { $subtract: ["$maxKvarh", "$minKvarh"] }
        }
      }
    ]);
    const kvarhToday = kvarhStats.reduce((acc, curr) => acc + (curr.consumption || 0), 0) / 1000;

    // 5. Avg Voltage - Average voltage across all phases
    const avgVoltageStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $group: {
          _id: null,
          avg_r_voltage: { $avg: "$r_voltage" },
          avg_y_voltage: { $avg: "$y_voltage" },
          avg_b_voltage: { $avg: "$b_voltage" }
        }
      }
    ]);
    const avgVoltage = avgVoltageStats.length > 0
      ? ((avgVoltageStats[0].avg_r_voltage || 0) +
        (avgVoltageStats[0].avg_y_voltage || 0) +
        (avgVoltageStats[0].avg_b_voltage || 0)) / 3
      : 0;

    // 6. Avg Current - Average current across all phases
    const avgCurrentStats = await DeviceParameter.aggregate([
      { $match: { reading_time: { $gte: startOfPeriod } } },
      {
        $group: {
          _id: null,
          avg_r_current: { $avg: "$r_current" },
          avg_y_current: { $avg: "$y_current" },
          avg_b_current: { $avg: "$b_current" }
        }
      }
    ]);
    const avgCurrent = avgCurrentStats.length > 0
      ? ((avgCurrentStats[0].avg_r_current || 0) +
        (avgCurrentStats[0].avg_y_current || 0) +
        (avgCurrentStats[0].avg_b_current || 0)) / 3
      : 0;

    // 7. kW NOW - Current power consumption (latest reading)
    const latestReading = await DeviceParameter.findOne()
      .sort({ reading_time: -1 });

    const kwNow = latestReading
      ? ((latestReading.r_active_power || 0) +
        (latestReading.y_active_power || 0) +
        (latestReading.b_active_power || 0)) / 1000
      : 0;

    res.json({
      kwh_today: kwhToday,
      peak_kw_today: peakKwToday,
      avg_kw_today: avgKwToday,
      pf_today: pfToday,
      kvarh_today: kvarhToday,
      avg_voltage: avgVoltage,
      avg_current: avgCurrent,
      kw_now: kwNow
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
    } else if (type === 'current-trends') {
      // Current trends (last 24 hours, hourly average)

      // Use deviceId if provided, otherwise aggregate all (though usually chart is per device or system total)
      // If deviceId is not provided, we might want to average across all devices? 
      // Existing logic for 'power' handled deviceId optional. We should stick to that pattern.

      const matchQuery = { reading_time: { $gte: oneDayAgo } };
      if (deviceId) {
        matchQuery.device_id = new mongoose.Types.ObjectId(deviceId);
      }

      const currentTrends = await DeviceParameter.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$reading_time' },
              month: { $month: '$reading_time' },
              day: { $dayOfMonth: '$reading_time' },
              hour: { $hour: '$reading_time' }
            },
            r_current: { $avg: '$r_current' },
            y_current: { $avg: '$y_current' },
            b_current: { $avg: '$b_current' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]);

      res.json(currentTrends.map(item => ({
        time: `${String(item._id.hour).padStart(2, '0')}:00`,
        r_current: item.r_current || 0,
        y_current: item.y_current || 0,
        b_current: item.b_current || 0
      })));

    } else if (type === 'pf-trends') {
      // Power Factor trends
      const matchQuery = { reading_time: { $gte: oneDayAgo } };
      if (deviceId) {
        matchQuery.device_id = new mongoose.Types.ObjectId(deviceId);
      }

      const pfTrends = await DeviceParameter.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$reading_time' },
              month: { $month: '$reading_time' },
              day: { $dayOfMonth: '$reading_time' },
              hour: { $hour: '$reading_time' }
            },
            r_pf: { $avg: '$r_power_factor' },
            y_pf: { $avg: '$y_power_factor' },
            b_pf: { $avg: '$b_power_factor' },
            avg_pf: {
              $avg: {
                $divide: [
                  { $add: [{ $ifNull: ['$r_power_factor', 0] }, { $ifNull: ['$y_power_factor', 0] }, { $ifNull: ['$b_power_factor', 0] }] },
                  3
                ]
              }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]);

      res.json(pfTrends.map(item => ({
        time: `${String(item._id.hour).padStart(2, '0')}:00`,
        r_pf: Math.abs(item.r_pf || 0),
        y_pf: Math.abs(item.y_pf || 0),
        b_pf: Math.abs(item.b_pf || 0),
        avg_pf: Math.abs(item.avg_pf || 0)
      })));

    } else if (type === 'frequency-trends') {
      // Frequency trends
      const matchQuery = { reading_time: { $gte: oneDayAgo } };
      if (deviceId) {
        matchQuery.device_id = new mongoose.Types.ObjectId(deviceId);
      }

      const freqTrends = await DeviceParameter.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$reading_time' },
              month: { $month: '$reading_time' },
              day: { $dayOfMonth: '$reading_time' },
              hour: { $hour: '$reading_time' }
            },
            frequency: { $avg: '$frequency' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]);

      res.json(freqTrends.map(item => ({
        time: `${String(item._id.hour).padStart(2, '0')}:00`,
        frequency: item.frequency || 0
      })));

    } else if (type === 'all-trends') {
      // Unified trends for Stacked Charts
      const matchQuery = { reading_time: { $gte: oneDayAgo } };
      if (deviceId) {
        matchQuery.device_id = new mongoose.Types.ObjectId(deviceId);
      }

      const allTrends = await DeviceParameter.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$reading_time' },
              month: { $month: '$reading_time' },
              day: { $dayOfMonth: '$reading_time' },
              hour: { $hour: '$reading_time' }
            },
            // Power
            avg_power: {
              $avg: {
                $divide: [
                  { $add: [{ $ifNull: ['$r_active_power', 0] }, { $ifNull: ['$y_active_power', 0] }, { $ifNull: ['$b_active_power', 0] }] },
                  1 // Keep in Watts
                ]
              }
            },
            // Voltage
            r_voltage: { $avg: '$r_voltage' },
            y_voltage: { $avg: '$y_voltage' },
            b_voltage: { $avg: '$b_voltage' },
            // Current
            r_current: { $avg: '$r_current' },
            y_current: { $avg: '$y_current' },
            b_current: { $avg: '$b_current' },
            // PF
            avg_pf: {
              $avg: {
                $divide: [
                  { $add: [{ $ifNull: ['$r_power_factor', 0] }, { $ifNull: ['$y_power_factor', 0] }, { $ifNull: ['$b_power_factor', 0] }] },
                  3
                ]
              }
            },
            // Frequency
            frequency: { $avg: '$frequency' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
      ]);

      res.json(allTrends.map(item => ({
        time: `${String(item._id.hour).padStart(2, '0')}:00`,
        hour: `${String(item._id.hour).padStart(2, '0')}:00`, // Support both keys
        power: item.avg_power || 0,
        r_voltage: item.r_voltage || 0,
        y_voltage: item.y_voltage || 0,
        b_voltage: item.b_voltage || 0,
        r_current: item.r_current || 0,
        y_current: item.y_current || 0,
        b_current: item.b_current || 0,
        avg_pf: Math.abs(item.avg_pf || 0),
        frequency: item.frequency || 0
      })));

    } else {
      res.status(400).json({ error: 'Invalid chart type' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get live status (latest reading for each device)
router.get('/live-status', async (req, res) => {
  try {
    const devices = await Device.find();

    // For each device, get the absolute latest reading
    const liveStatus = await Promise.all(
      devices.map(async (device) => {
        // Query for the absolutely latest reading for this device
        const lastReading = await DeviceParameter.findOne({ device_id: device._id })
          .sort({ reading_time: -1 });

        return {
          device: device,
          reading: lastReading
        };
      })
    );

    res.json(liveStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


