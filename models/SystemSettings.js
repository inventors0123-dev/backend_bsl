const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    // Voltage Thresholds
    voltage_max: {
        type: Number,
        default: 250,
        min: 200,
        max: 300
    },
    voltage_min: {
        type: Number,
        default: 200,
        min: 150,
        max: 240
    },

    // Current Thresholds
    current_max: {
        type: Number,
        default: 30,
        min: 1,
        max: 100
    },

    // Power Factor Threshold
    pf_min: {
        type: Number,
        default: 0.90,
        min: 0.5,
        max: 1.0
    },

    // Notification Settings
    notifications_enabled: {
        type: Boolean,
        default: true
    },
    email_alerts_enabled: {
        type: Boolean,
        default: true
    },

    // Alert Settings
    alert_check_interval: {
        type: Number,
        default: 60000, // 1 minute in milliseconds
        min: 10000,     // Min 10 seconds
        max: 3600000    // Max 1 hour
    },

    // Device Offline Threshold (in minutes)
    device_offline_threshold: {
        type: Number,
        default: 60,    // 60 minutes
        min: 5,
        max: 1440       // 24 hours
    },

    // Singleton pattern - only one settings document
    singleton: {
        type: Boolean,
        default: true,
        unique: true
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
systemSettingsSchema.pre('save', async function (next) {
    const count = await this.constructor.countDocuments();
    if (count > 0 && this.isNew) {
        throw new Error('Only one SystemSettings document is allowed');
    }
    next();
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
