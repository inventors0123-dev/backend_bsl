const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    device_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Device',
        required: true,
        index: true
    },
    alert_type: {
        type: String,
        enum: ['over_voltage', 'under_voltage', 'over_current', 'low_power_factor', 'device_offline', 'system_info'],
        required: true
    },
    severity: {
        type: String,
        enum: ['critical', 'warning', 'info'],
        required: true,
        default: 'info'
    },
    message: {
        type: String,
        required: true
    },
    reading_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeviceParameter'
    },
    value: {
        type: Number  // The actual value that triggered the alert
    },
    threshold: {
        type: Number  // The threshold that was violated
    },
    resolved: {
        type: Boolean,
        default: false
    },
    resolved_at: {
        type: Date
    },
    resolved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for performance
alertSchema.index({ device_id: 1, createdAt: -1 });
alertSchema.index({ severity: 1, resolved: 1 });
alertSchema.index({ alert_type: 1 });
alertSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
