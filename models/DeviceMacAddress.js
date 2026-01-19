const mongoose = require('mongoose');

const deviceMacAddressSchema = new mongoose.Schema({
  device_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  mac_address: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: [/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/, 'Please enter a valid MAC address']
  }
}, {
  timestamps: true
});

// Compound unique index to prevent duplicate device-MAC combinations
deviceMacAddressSchema.index({ device_id: 1, mac_address: 1 }, { unique: true });
deviceMacAddressSchema.index({ mac_address: 1 });

module.exports = mongoose.model('DeviceMacAddress', deviceMacAddressSchema);


