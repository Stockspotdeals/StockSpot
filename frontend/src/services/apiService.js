import { apiClient } from './authService';

class ApiService {
  /**
   * Health check
   */
  async getHealth() {
    try {
      const response = await apiClient.get('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get API info
   */
  async getInfo() {
    try {
      const response = await apiClient.get('/api/status');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get deals with pagination and filters
   */
  async getDeals(params = {}) {
    try {
      const response = await apiClient.get('/api/feed', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create new deal
   */
  async createDeal(dealData) {
    try {
      const response = await apiClient.post('/create-checkout-session', dealData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(params = {}) {
    try {
      const response = await apiClient.get('/analytics', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Post to Twitter
   */
  async postToTwitter(postData) {
    try {
      const response = await apiClient.post('/twitter/post', postData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Search Amazon products
   */
  async searchAmazonProducts(params = {}) {
    try {
      const response = await apiClient.get('/amazon/products', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Shorten URL
   */
  async shortenUrl(urlData) {
    try {
      const response = await apiClient.post('/links/shorten', urlData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all users (admin only)
   */
  async getUsers(params = {}) {
    try {
      const response = await apiClient.get('/users', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const response = await apiClient.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update user (admin only)
   */
  async updateUser(userId, userData) {
    try {
      const response = await apiClient.put(`/users/${userId}`, userData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    try {
      const response = await apiClient.delete(`/users/${userId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get user usage statistics
   */
  async getUserUsage(userId) {
    try {
      const response = await apiClient.get(`/users/${userId}/usage`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Reset user usage (admin only)
   */
  async resetUserUsage(userId, resetData) {
    try {
      const response = await apiClient.post(`/users/${userId}/reset-usage`, resetData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get plan information
   */
  async getPlanInfo() {
    try {
      const response = await apiClient.get('/users/plans/info');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upgrade user plan
   */
  async upgradePlan(userId, planData) {
    try {
      const response = await apiClient.post(`/users/${userId}/upgrade`, planData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors consistently
   */
  handleError(error) {
    if (error.response) {
      const { data, status } = error.response;
      
      // Handle specific error types
      switch (data.code) {
        case 'RATE_LIMIT_EXCEEDED':
        case 'PLAN_RATE_LIMIT_EXCEEDED':
        case 'FEATURE_LIMIT_EXCEEDED':
          return {
            ...data,
            isLimitError: true
          };
        case 'PREMIUM_REQUIRED':
          return {
            ...data,
            isPremiumRequired: true
          };
        case 'INSUFFICIENT_PLAN':
          return {
            ...data,
            isPlanUpgradeRequired: true
          };
        default:
          return {
            message: data.message || 'An error occurred',
            details: data.details || [],
            code: data.code,
            status
          };
      }
    } else if (error.request) {
      return {
        message: 'Network error - please check your connection',
        code: 'NETWORK_ERROR'
      };
    } else {
      return {
        message: error.message || 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR'
      };
    }
  }
}

// Create and export singleton instance
const apiService = new ApiService();
export default apiService;