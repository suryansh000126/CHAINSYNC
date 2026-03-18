const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  pair: {
    type: String,
    required: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  orderType: {
    type: String,
    enum: ['market', 'limit'],
    default: 'market'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true
  },
  isBot: {
    type: Boolean,
    default: false
  },
  txHash: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'executed', 'cancelled'],
    default: 'executed'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

tradeSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Trade', tradeSchema);
