const mongoose = require('mongoose');

const deviceParameterSchema = new mongoose.Schema({
  device_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  reading_time: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Phase R
  r_voltage: { type: Number },
  r_voltage_line_to_line: { type: Number },
  r_current: { type: Number },
  r_active_power: { type: Number },
  r_reactive_power: { type: Number },
  r_apparent_power: { type: Number },
  r_power_factor: { type: Number },
  r_thd_voltage: { type: Number },
  r_thd_current: { type: Number },
  r_harmonics_voltage: { type: mongoose.Schema.Types.Mixed },
  r_harmonics_current: { type: mongoose.Schema.Types.Mixed },
  r_voltage_neutral: { type: Number },
  
  // Phase Y
  y_voltage: { type: Number },
  y_voltage_line_to_line: { type: Number },
  y_current: { type: Number },
  y_active_power: { type: Number },
  y_reactive_power: { type: Number },
  y_apparent_power: { type: Number },
  y_power_factor: { type: Number },
  y_thd_voltage: { type: Number },
  y_thd_current: { type: Number },
  y_harmonics_voltage: { type: mongoose.Schema.Types.Mixed },
  y_harmonics_current: { type: mongoose.Schema.Types.Mixed },
  y_voltage_neutral: { type: Number },
  
  // Phase B
  b_voltage: { type: Number },
  b_voltage_line_to_line: { type: Number },
  b_current: { type: Number },
  b_active_power: { type: Number },
  b_reactive_power: { type: Number },
  b_apparent_power: { type: Number },
  b_power_factor: { type: Number },
  b_thd_voltage: { type: Number },
  b_thd_current: { type: Number },
  b_harmonics_voltage: { type: mongoose.Schema.Types.Mixed },
  b_harmonics_current: { type: mongoose.Schema.Types.Mixed },
  b_voltage_neutral: { type: Number },
  
  // Line-to-Line Voltages
  ry_voltage: { type: Number },
  yb_voltage: { type: Number },
  br_voltage: { type: Number },
  
  // Common Parameters
  neutral_current: { type: Number },
  voltage_unbalance: { type: Number },
  current_unbalance: { type: Number },
  frequency: { type: Number },
  total_energy_kwh: { type: Number },
  total_energy_kvah: { type: Number },
  total_energy_kvarh: { type: Number },
  transient_event_count: { type: Number },
  temperature: { type: Number },
  humidity: { type: Number }
}, {
  timestamps: true
});

// Indexes for performance
deviceParameterSchema.index({ device_id: 1, reading_time: -1 });
deviceParameterSchema.index({ reading_time: -1 });

module.exports = mongoose.model('DeviceParameter', deviceParameterSchema);


