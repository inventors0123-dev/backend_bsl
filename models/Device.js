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
  }
}, {
  timestamps: true
});

// Index for faster queries
deviceSchema.index({ name: 1 });
deviceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Device', deviceSchema);


