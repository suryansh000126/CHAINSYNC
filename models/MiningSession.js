const mongoose = require('mongoose');

const miningSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  coin: {
    type: String,
    default: 'XMR',
    uppercase: true
  },
  hardwareType: {
    type: String,
    enum: ['cpu', 'gpu'],
    default: 'cpu'
  },
  threads: {
    type: Number,
    default: 1,
    min: 1,
    max: 16
  },
  hashrate: {
    type: Number,
    default: 0
  },
  sharesFound: {
    type: Number,
    default: 0
  },
  sharesAccepted: {
    type: Number,
    default: 0
  },
  earnings: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  }
});

module.exports = mongoose.model('MiningSession', miningSessionSchema);
