const express = require('express');
const router = express.Router();
const DeviceParameter = require('../models/DeviceParameter');
const Device = require('../models/Device');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');

/**
 * Export device readings with filters
 * GET /api/export/readings
 * Query Parameters:
 *   - device_id: Filter by specific device (optional)
 *   - start_date: Start date for export (ISO string)
 *   - end_date: End date for export (ISO string)
 *   - format: 'csv' or 'json' (default: csv)
 *   - metrics: Comma-separated list of metrics to include (optional, all if not specified)
 */
router.get('/readings', async (req, res) => {
    try {
        const {
            device_id,
            start_date,
            end_date,
            format = 'csv',
            metrics
        } = req.query;

        // Build query filter
        const filter = {};

        // Device filter
        if (device_id) {
            filter.device_id = device_id;
        }

        // Date range filter
        if (start_date || end_date) {
            filter.reading_time = {};
            if (start_date) {
                filter.reading_time.$gte = new Date(start_date);
            }
            if (end_date) {
                filter.reading_time.$lte = new Date(end_date);
            }
        }

        // Fetch readings
        const readings = await DeviceParameter.find(filter)
            .sort({ reading_time: -1 })
            .limit(10000) // Limit to prevent memory issues
            .populate('device_id', 'name location')
            .lean();

        if (readings.length === 0) {
            return res.status(404).json({ error: 'No readings found for the specified filters' });
        }

        // Determine which fields to include
        let fieldsToInclude = [
            'device_name',
            'location',
            'reading_time',
            'r_voltage',
            'y_voltage',
            'b_voltage',
            'r_current',
            'y_current',
            'b_current',
            'r_active_power',
            'y_active_power',
            'b_active_power',
            'r_reactive_power',
            'y_reactive_power',
            'b_reactive_power',
            'r_apparent_power',
            'y_apparent_power',
            'b_apparent_power',
            'r_power_factor',
            'y_power_factor',
            'b_power_factor',
            'frequency',
            'total_energy_kwh',
            'total_energy_kvah',
            'total_energy_kvarh',
            'temperature'
        ];

        // Filter metrics if specified
        if (metrics) {
            const requestedMetrics = metrics.split(',').map(m => m.trim());
            fieldsToInclude = ['device_name', 'location', 'reading_time', ...requestedMetrics];
        }

        // Transform data for export
        const exportData = readings.map(reading => {
            const row = {
                device_name: reading.device_id?.name || 'Unknown',
                location: reading.device_id?.location || 'Unknown',
                reading_time: new Date(reading.reading_time).toISOString()
            };

            // Add requested fields
            fieldsToInclude.forEach(field => {
                if (field !== 'device_name' && field !== 'location' && field !== 'reading_time') {
                    row[field] = reading[field] || 0;
                }
            });

            return row;
        });

        // Export based on format
        if (format === 'csv') {
            // Generate CSV
            const parser = new Parser({ fields: fieldsToInclude });
            const csv = parser.parse(exportData);

            // Set headers for download
            const filename = `readings_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        } else if (format === 'json') {
            // Generate JSON
            const filename = `readings_${new Date().toISOString().split('T')[0]}.json`;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json({
                total: exportData.length,
                filters: {
                    device_id,
                    start_date,
                    end_date,
                    metrics
                },
                data: exportData
            });
        } else if (format === 'xlsx') {
            // Generate Excel
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Readings');

            // Set columns
            worksheet.columns = fieldsToInclude.map(field => ({
                header: field.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                key: field,
                width: 20
            }));

            // Add rows
            worksheet.addRows(exportData);

            // Set headers for download
            const filename = `readings_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            await workbook.xlsx.write(res);
            res.end();
        } else {
            return res.status(400).json({ error: 'Invalid format. Use "csv", "json", or "xlsx"' });
        }

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export alerts with filters
 * GET /api/export/alerts
 */
router.get('/alerts', async (req, res) => {
    try {
        const {
            device_id,
            start_date,
            end_date,
            severity,
            format = 'csv'
        } = req.query;

        const Alert = require('../models/Alert');

        // Build query filter
        const filter = {};

        if (device_id) filter.device_id = device_id;
        if (severity) filter.severity = severity;

        if (start_date || end_date) {
            filter.createdAt = {};
            if (start_date) filter.createdAt.$gte = new Date(start_date);
            if (end_date) filter.createdAt.$lte = new Date(end_date);
        }

        // Fetch alerts
        const alerts = await Alert.find(filter)
            .sort({ createdAt: -1 })
            .populate('device_id', 'name location')
            .lean();

        if (alerts.length === 0) {
            return res.status(404).json({ error: 'No alerts found for the specified filters' });
        }

        // Transform data
        const exportData = alerts.map(alert => ({
            device_name: alert.device_id?.name || 'Unknown',
            location: alert.device_id?.location || 'Unknown',
            alert_type: alert.alert_type,
            severity: alert.severity,
            message: alert.message,
            value: alert.value,
            threshold: alert.threshold,
            resolved: alert.resolved,
            created_at: new Date(alert.createdAt).toISOString(),
            updated_at: new Date(alert.updatedAt).toISOString()
        }));

        if (format === 'csv') {
            const parser = new Parser();
            const csv = parser.parse(exportData);

            const filename = `alerts_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        } else if (format === 'json') {
            const filename = `alerts_${new Date().toISOString().split('T')[0]}.json`;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json({
                total: exportData.length,
                filters: { device_id, start_date, end_date, severity },
                data: exportData
            });
        } else if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Alerts');

            // Define columns manually since we constructed exportData differently
            worksheet.columns = [
                { header: 'Device Name', key: 'device_name', width: 20 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Alert Type', key: 'alert_type', width: 15 },
                { header: 'Severity', key: 'severity', width: 10 },
                { header: 'Message', key: 'message', width: 40 },
                { header: 'Value', key: 'value', width: 10 },
                { header: 'Threshold', key: 'threshold', width: 10 },
                { header: 'Resolved', key: 'resolved', width: 10 },
                { header: 'Created At', key: 'created_at', width: 25 },
                { header: 'Updated At', key: 'updated_at', width: 25 }
            ];

            worksheet.addRows(exportData);

            const filename = `alerts_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            await workbook.xlsx.write(res);
            res.end();
        }

    } catch (error) {
        console.error('Export alerts error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get export statistics (count of readings available)
 * GET /api/export/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const { device_id, start_date, end_date } = req.query;

        const filter = {};
        if (device_id) filter.device_id = device_id;

        if (start_date || end_date) {
            filter.reading_time = {};
            if (start_date) filter.reading_time.$gte = new Date(start_date);
            if (end_date) filter.reading_time.$lte = new Date(end_date);
        }

        const count = await DeviceParameter.countDocuments(filter);
        const devices = await Device.find();

        res.json({
            total_readings: count,
            total_devices: devices.length,
            max_export_limit: 10000,
            max_export_limit: 10000,
            available_formats: ['csv', 'json', 'xlsx']
        });

    } catch (error) {
        console.error('Export stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
