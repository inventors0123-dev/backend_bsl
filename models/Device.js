const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  rated_kVA: {
    type: Number,
    default: 100, // Default rated capacity in kVA
    min: 1
  }
}, {
  timestamps: true
});

// Index for faster queries
deviceSchema.index({ name: 1 });
deviceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Device', deviceSchema);


