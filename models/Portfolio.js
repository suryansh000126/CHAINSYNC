const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  coinSymbol: {
    type: String,
    required: true,
    uppercase: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  buyPrice: {
    type: Number,
    default: 0
  },
  source: {
    type: String,
    enum: ['manual', 'trade', 'mining'],
    default: 'manual'
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

portfolioSchema.index({ userId: 1, coinSymbol: 1 });

module.exports = mongoose.model('Portfolio', portfolioSchema);
