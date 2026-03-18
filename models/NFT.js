const mongoose = require('mongoose');

const nftSchema = new mongoose.Schema({
  tokenId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  collectionName: {
    type: String,
    default: 'ChainSync Collection'
  },
  image: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'ETH'
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  previousOwners: [{
    userId: mongoose.Schema.Types.ObjectId,
    purchasedAt: Date,
    price: Number
  }],
  isListed: {
    type: Boolean,
    default: true
  },
  onChain: {
    type: Boolean,
    default: false
  },
  txHash: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('NFT', nftSchema);
