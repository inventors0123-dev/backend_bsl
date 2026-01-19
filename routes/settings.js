const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');

// Get system settings (create default if doesn't exist)
router.get('/', async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ singleton: true });

        // Create default settings if none exist
        if (!settings) {
            settings = new SystemSettings({ singleton: true });
            await settings.save();
        }

        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update system settings
router.put('/', async (req, res) => {
    try {
        const {
            voltage_max,
            voltage_min,
            current_max,
            pf_min,
            notifications_enabled,
            email_alerts_enabled,
            alert_check_interval,
            device_offline_threshold
        } = req.body;

        // Validation
        if (voltage_min && voltage_max && voltage_min >= voltage_max) {
            return res.status(400).json({ error: 'voltage_min must be less than voltage_max' });
        }

        if (pf_min && (pf_min < 0.5 || pf_min > 1.0)) {
            return res.status(400).json({ error: 'pf_min must be between 0.5 and 1.0' });
        }

        // Find existing settings or create new
        let settings = await SystemSettings.findOne({ singleton: true });

        if (!settings) {
            settings = new SystemSettings({ singleton: true });
        }

        // Update fields if provided
        if (voltage_max !== undefined) settings.voltage_max = voltage_max;
        if (voltage_min !== undefined) settings.voltage_min = voltage_min;
        if (current_max !== undefined) settings.current_max = current_max;
        if (pf_min !== undefined) settings.pf_min = pf_min;
        if (notifications_enabled !== undefined) settings.notifications_enabled = notifications_enabled;
        if (email_alerts_enabled !== undefined) settings.email_alerts_enabled = email_alerts_enabled;
        if (alert_check_interval !== undefined) settings.alert_check_interval = alert_check_interval;
        if (device_offline_threshold !== undefined) settings.device_offline_threshold = device_offline_threshold;

        await settings.save();

        res.json({
            message: 'Settings updated successfully',
            settings
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reset to default settings
router.post('/reset', async (req, res) => {
    try {
        const settings = await SystemSettings.findOne({ singleton: true });

        if (settings) {
            settings.voltage_max = 250;
            settings.voltage_min = 200;
            settings.current_max = 30;
            settings.pf_min = 0.90;
            settings.notifications_enabled = true;
            settings.email_alerts_enabled = true;
            settings.alert_check_interval = 60000;
            settings.device_offline_threshold = 60;

            await settings.save();
            res.json({
                message: 'Settings reset to defaults',
                settings
            });
        } else {
            const newSettings = new SystemSettings({ singleton: true });
            await newSettings.save();
            res.json({
                message: 'Default settings created',
                settings: newSettings
            });
        }
    } catch (error) {
        console.error('Error resetting settings:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
