const mongoose = require('mongoose');
const { sendDashboardAlertWhatsapp } = require('../services/whatsappNotifier');

const alertSchema = new mongoose.Schema({
    device_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Device',
        required: true,
        index: true
    },
    alert_type: {
        type: String,
        enum: [
            'over_voltage',
            'under_voltage',
            'over_current',
            'low_power_factor',
            'device_offline',
            'system_info',
            'current_imbalance',
            'phase_loss',
            'voltage_imbalance',
            'frequency_deviation',
            'high_temperature'
        ],
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

// Track whether this document is newly created so WhatsApp triggers only once.
alertSchema.pre('save', function (next) {
    this.$locals.wasNew = this.isNew;
    next();
});

alertSchema.post('save', function (doc) {
    if (!this.$locals?.wasNew) return;

    setImmediate(() => {
        sendDashboardAlertWhatsapp(doc).catch((error) => {
            console.error('Error sending WhatsApp alert:', error.message);
        });
    });
});

module.exports = mongoose.model('Alert', alertSchema);
