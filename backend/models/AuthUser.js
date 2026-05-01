const mongoose = require('mongoose');

const AuthUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active'
  },
  refreshTokens: {
    type: [String],
    default: []
  },
  subscriptionStartDate: {
    type: Date,
    default: null
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

AuthUserSchema.virtual('id').get(function() {
  return this._id.toString();
});

AuthUserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  }
});

AuthUserSchema.methods.addRefreshToken = async function(token) {
  this.refreshTokens.push(token);
  this.updatedAt = new Date();
  await this.save();
  return this;
};

AuthUserSchema.methods.removeRefreshToken = async function(token) {
  this.refreshTokens = this.refreshTokens.filter(t => t !== token);
  this.updatedAt = new Date();
  await this.save();
  return this;
};

AuthUserSchema.methods.clearAllRefreshTokens = async function() {
  this.refreshTokens = [];
  this.updatedAt = new Date();
  await this.save();
  return this;
};

AuthUserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

AuthUserSchema.statics.findById = function(id) {
  if (!mongoose.isValidObjectId(id)) {
    return Promise.resolve(null);
  }
  return this.findOne({ _id: id });
};

AuthUserSchema.statics.updateById = async function(id, updates) {
  const user = await this.findById(id);
  if (!user) {
    return null;
  }

  Object.keys(updates).forEach(key => {
    if (key !== 'id' && key !== '_id' && key !== 'passwordHash') {
      user[key] = updates[key];
    }
  });
  user.updatedAt = new Date();
  return user.save();
};

const AuthUserModel = mongoose.models.AuthUser || mongoose.model('AuthUser', AuthUserSchema);

module.exports = { AuthUserModel };
