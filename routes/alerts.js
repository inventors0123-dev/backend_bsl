const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const Device = require('../models/Device');

// Get all alerts with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const {
            device_id,
            severity,
            alert_type,
            resolved,
            page = 1,
            per_page = 50,
            sort = '-createdAt'
        } = req.query;

        // Build query
        const query = {};
        if (device_id) query.device_id = device_id;
        if (severity) query.severity = severity;
        if (alert_type) query.alert_type = alert_type;
        if (resolved !== undefined) query.resolved = resolved === 'true';

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(per_page);
        const limit = parseInt(per_page);

        // Execute query
        const [alerts, total] = await Promise.all([
            Alert.find(query)
                .populate('device_id', 'name location')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Alert.countDocuments(query)
        ]);

        res.json({
            alerts,
            pagination: {
                total,
                page: parseInt(page),
                per_page: parseInt(per_page),
                total_pages: Math.ceil(total / per_page)
            }
        });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get alert counts by severity
router.get('/counts', async (req, res) => {
    try {
        const counts = await Alert.aggregate([
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 },
                    unresolved: {
                        $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] }
                    }
                }
            }
        ]);

        const result = {
            critical: { total: 0, unresolved: 0 },
            warning: { total: 0, unresolved: 0 },
            info: { total: 0, unresolved: 0 }
        };

        counts.forEach(item => {
            result[item._id] = {
                total: item.count,
                unresolved: item.unresolved
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching alert counts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single alert
router.get('/:id', async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.id)
            .populate('device_id', 'name location')
            .populate('resolved_by', 'name email');

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json(alert);
    } catch (error) {
        console.error('Error fetching alert:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new alert (usually called by system, but exposed for testing)
router.post('/', async (req, res) => {
    try {
        const { device_id, alert_type, severity, message, value, threshold, reading_id } = req.body;

        // Validate device exists
        const device = await Device.findById(device_id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const alert = new Alert({
            device_id,
            alert_type,
            severity,
            message,
            value,
            threshold,
            reading_id
        });

        await alert.save();
        await alert.populate('device_id', 'name location');

        res.status(201).json(alert);
    } catch (error) {
        console.error('Error creating alert:', error);
        res.status(500).json({ error: error.message });
    }
});

// Resolve an alert
router.patch('/:id/resolve', async (req, res) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            {
                resolved: true,
                resolved_at: new Date(),
                resolved_by: req.user?.id // From auth middleware
            },
            { new: true }
        ).populate('device_id', 'name location');

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json(alert);
    } catch (error) {
        console.error('Error resolving alert:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk resolve alerts
router.post('/bulk-resolve', async (req, res) => {
    try {
        const { alert_ids } = req.body;

        if (!Array.isArray(alert_ids) || alert_ids.length === 0) {
            return res.status(400).json({ error: 'alert_ids must be a non-empty array' });
        }

        const result = await Alert.updateMany(
            { _id: { $in: alert_ids }, resolved: false },
            {
                resolved: true,
                resolved_at: new Date(),
                resolved_by: req.user?.id
            }
        );

        res.json({
            message: 'Alerts resolved successfully',
            modified_count: result.modifiedCount
        });
    } catch (error) {
        console.error('Error bulk resolving alerts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete alert (admin only)
router.delete('/:id', async (req, res) => {
    try {
        const alert = await Alert.findByIdAndDelete(req.params.id);

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json({ message: 'Alert deleted successfully' });
    } catch (error) {
        console.error('Error deleting alert:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear all resolved alerts older than X days
router.delete('/cleanup/:days', async (req, res) => {
    try {
        const days = parseInt(req.params.days) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await Alert.deleteMany({
            resolved: true,
            resolved_at: { $lte: cutoffDate }
        });

        res.json({
            message: `Cleaned up alerts older than ${days} days`,
            deleted_count: result.deletedCount
        });
    } catch (error) {
        console.error('Error cleaning up alerts:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
