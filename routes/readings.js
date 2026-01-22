const express = require('express');
const router = express.Router();
const DeviceParameter = require('../models/DeviceParameter');
const Device = require('../models/Device');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const auth = require('../middleware/auth');
const XLSX = require('xlsx');

// Export all readings to Excel
router.get('/export', auth, async (req, res) => {
    console.log('📉 Export request received');
    try {
        // Fetch all readings with device info
        const readings = await DeviceParameter.find()
            .populate('device_id', 'name location')
            .sort({ reading_time: -1 })
            .lean();

        console.log(`📉 Found ${readings.length} readings`);

        // Transform data for Excel
        const excelData = readings.map(reading => ({
            'Device Name': reading.device_id?.name || 'Unknown',
            'Location': reading.device_id?.location || 'N/A',
            'Reading Time': reading.reading_time ? new Date(reading.reading_time).toLocaleString() : 'N/A',

            // Phase R
            'R Voltage (V)': reading.r_voltage || 0,
            'R Current (A)': reading.r_current || 0,
            'R Active Power (W)': reading.r_active_power || 0,
            'R Reactive Power (VAR)': reading.r_reactive_power || 0,
            'R Apparent Power (VA)': reading.r_apparent_power || 0,
            'R Power Factor': reading.r_power_factor || 0,

            // Phase Y
            'Y Voltage (V)': reading.y_voltage || 0,
            'Y Current (A)': reading.y_current || 0,
            'Y Active Power (W)': reading.y_active_power || 0,
            'Y Reactive Power (VAR)': reading.y_reactive_power || 0,
            'Y Apparent Power (VA)': reading.y_apparent_power || 0,
            'Y Power Factor': reading.y_power_factor || 0,

            // Phase B
            'B Voltage (V)': reading.b_voltage || 0,
            'B Current (A)': reading.b_current || 0,
            'B Active Power (W)': reading.b_active_power || 0,
            'B Reactive Power (VAR)': reading.b_reactive_power || 0,
            'B Apparent Power (VA)': reading.b_apparent_power || 0,
            'B Power Factor': reading.b_power_factor || 0,

            // System Parameters
            'Frequency (Hz)': reading.frequency || 0,
            'Total Energy (kWh)': reading.total_energy_kwh || 0,
            'Total Energy (kVAh)': reading.total_energy_kvah || 0,
            'Total Energy (kVARh)': reading.total_energy_kvarh || 0,
            'Temperature (°C)': reading.temperature || 0,
            'Humidity (%)': reading.humidity || 0,
            'Neutral Current (A)': reading.neutral_current || 0,
            'Voltage Unbalance (%)': reading.voltage_unbalance || 0,
            'Current Unbalance (%)': reading.current_unbalance || 0,
        }));

        console.log('📉 Data transformed');

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        console.log('📉 Worksheet created');

        // Set column widths
        const colWidths = [
            { wch: 20 }, // Device Name
            { wch: 15 }, // Location
            { wch: 20 }, // Reading Time
            ...Array(45).fill({ wch: 15 }) // All data columns
        ];
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'IoT Readings');

        console.log('📉 Generating buffer...');

        // Generate buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        console.log(`📉 Buffer generated, size: ${buffer.length}`);

        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename=iot-readings-${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        res.send(buffer);
        console.log('📉 Response sent');
    } catch (error) {
        console.error('Export error full:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

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
        await DeviceParameter.deleteMany({});
        res.json({ msg: 'All reading data cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
