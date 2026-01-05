const users = [];
let userIdCounter = 1;

const PLAN_LIMITS = {
  free: {
    maxTrackedProducts: 10,
    maxAlertsPerDay: 5,
    apiCallsPerHour: 100,
    maxDealsPerMonth: 50
  },
  paid: {
    maxTrackedProducts: 500,
    maxAlertsPerDay: 100,
    apiCallsPerHour: 1000,
    maxDealsPerMonth: 10000
  },
  admin: {
    maxTrackedProducts: -1,
    maxAlertsPerDay: -1,
    apiCallsPerHour: -1,
    maxDealsPerMonth: -1
  }
};

const PLAN_TYPES = {
  FREE: 'free',
  PAID: 'paid',
  ADMIN: 'admin'
};

const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
};

class User {
  constructor(email, hashedPassword, plan = PLAN_TYPES.FREE) {
    this.id = userIdCounter++;
    this.email = email;
    this.passwordHash = hashedPassword;
    this.plan = plan;
    this.status = USER_STATUS.ACTIVE;
    this.usage = {
      trackedProducts: 0,
      alertsToday: 0,
      apiCallsThisHour: 0,
      dealsThisMonth: 0,
      lastApiCall: null,
      lastAlert: null
    };
    this.refreshTokens = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  resetHourlyUsage() {
    this.usage.apiCallsThisHour = 0;
    this.usage.lastApiCall = new Date();
    this.updatedAt = new Date();
  }

  resetDailyUsage() {
    this.usage.alertsToday = 0;
    this.usage.lastAlert = new Date();
    this.updatedAt = new Date();
  }

  resetMonthlyUsage() {
    this.usage.dealsThisMonth = 0;
    this.updatedAt = new Date();
  }

  getPlanLimits() {
    return PLAN_LIMITS[this.plan] || PLAN_LIMITS.free;
  }

  canMakeApiCall() {
    const limits = this.getPlanLimits();
    if (limits.apiCallsPerHour === -1) return true;
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    if (!this.usage.lastApiCall || this.usage.lastApiCall < oneHourAgo) {
      this.resetHourlyUsage();
    }
    
    return this.usage.apiCallsThisHour < limits.apiCallsPerHour;
  }

  canCreateAlert() {
    const limits = this.getPlanLimits();
    if (limits.maxAlertsPerDay === -1) return true;
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    if (!this.usage.lastAlert || this.usage.lastAlert < oneDayAgo) {
      this.resetDailyUsage();
    }
    
    return this.usage.alertsToday < limits.maxAlertsPerDay;
  }

  canTrackProduct() {
    const limits = this.getPlanLimits();
    if (limits.maxTrackedProducts === -1) return true;
    return this.usage.trackedProducts < limits.maxTrackedProducts;
  }

  canCreateDeal() {
    const limits = this.getPlanLimits();
    if (limits.maxDealsPerMonth === -1) return true;
    
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    if (!this.usage.lastDeal || this.usage.lastDeal < oneMonthAgo) {
      this.resetMonthlyUsage();
    }
    
    return this.usage.dealsThisMonth < limits.maxDealsPerMonth;
  }

  incrementApiCall() {
    this.usage.apiCallsThisHour++;
    this.usage.lastApiCall = new Date();
    this.updatedAt = new Date();
  }

  incrementAlert() {
    this.usage.alertsToday++;
    this.usage.lastAlert = new Date();
    this.updatedAt = new Date();
  }

  incrementTrackedProduct() {
    this.usage.trackedProducts++;
    this.updatedAt = new Date();
  }

  decrementTrackedProduct() {
    if (this.usage.trackedProducts > 0) {
      this.usage.trackedProducts--;
      this.updatedAt = new Date();
    }
  }

  incrementDeal() {
    this.usage.dealsThisMonth++;
    this.usage.lastDeal = new Date();
    this.updatedAt = new Date();
  }

  addRefreshToken(token) {
    this.refreshTokens.push(token);
    this.updatedAt = new Date();
  }

  removeRefreshToken(token) {
    this.refreshTokens = this.refreshTokens.filter(t => t !== token);
    this.updatedAt = new Date();
  }

  clearAllRefreshTokens() {
    this.refreshTokens = [];
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      plan: this.plan,
      status: this.status,
      usage: this.usage,
      planLimits: this.getPlanLimits(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// In-memory user operations (replace with database in production)
const UserModel = {
  create: async (email, hashedPassword, plan = PLAN_TYPES.FREE) => {
    const user = new User(email, hashedPassword, plan);
    users.push(user);
    return user;
  },

  findByEmail: async (email) => {
    return users.find(user => user.email === email) || null;
  },

  findById: async (id) => {
    return users.find(user => user.id === parseInt(id)) || null;
  },

  updateById: async (id, updates) => {
    const user = await UserModel.findById(id);
    if (!user) return null;
    
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'passwordHash') {
        user[key] = updates[key];
      }
    });
    
    user.updatedAt = new Date();
    return user;
  },

  deleteById: async (id) => {
    const index = users.findIndex(user => user.id === parseInt(id));
    if (index === -1) return null;
    
    const [deletedUser] = users.splice(index, 1);
    return deletedUser;
  },

  list: async (limit = 50, offset = 0) => {
    return {
      users: users.slice(offset, offset + limit),
      total: users.length
    };
  },

  findByPlan: async (plan) => {
    return users.filter(user => user.plan === plan);
  }
};

module.exports = {
  User,
  UserModel,
  PLAN_TYPES,
  PLAN_LIMITS,
  USER_STATUS
};