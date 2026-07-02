import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || window.location.origin;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Include cookies for refresh token
  headers: {
    'Content-Type': 'application/json'
  }
});

// Token storage
const TOKEN_KEY = 'stockspot_access_token';

class AuthService {
  constructor() {
    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for token handling
   */
  setupInterceptors() {
    // Request interceptor - add auth token
    apiClient.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh
    apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (
          error.response?.status === 401 &&
          error.response?.data?.code === 'TOKEN_EXPIRED' &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          try {
            await this.refreshToken();
            // Retry original request with new token
            const token = this.getToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.logout();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Store access token
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  /**
   * Get stored access token
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;

    try {
      // Basic JWT structure check
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Date.now() / 1000;
      return payload.exp > now;
    } catch {
      return false;
    }
  }

  /**
   * Get current user info from token
   */
  getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.userId,
        email: payload.email,
        plan: payload.plan,
        status: payload.status
      };
    } catch {
      return null;
    }
  }

  /**
   * Register new user
   */
  async register(userData) {
    try {
      const response = await apiClient.post('/auth/register', userData);
      
      if (response.data.accessToken) {
        this.setToken(response.data.accessToken);
      }
      
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Login user
   */
  async login(credentials) {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      
      if (response.data.accessToken) {
        this.setToken(response.data.accessToken);
      }
      
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken() {
    try {
      const response = await apiClient.post('/auth/refresh');
      
      if (response.data.accessToken) {
        this.setToken(response.data.accessToken);
      }
      
      return response.data;
    } catch (error) {
      this.setToken(null); // Clear invalid token
      throw this.handleError(error);
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API call failed:', error);
    } finally {
      this.setToken(null);
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll() {
    try {
      await apiClient.post('/auth/logout-all');
    } catch (error) {
      console.error('Logout all API call failed:', error);
    } finally {
      this.setToken(null);
    }
  }

  /**
   * Get user profile
   */
  async getProfile() {
    try {
      const response = await apiClient.get('/auth/profile');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(profileData) {
    try {
      const response = await apiClient.put('/auth/profile', profileData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Change password
   */
  async changePassword(passwordData) {
    try {
      const response = await apiClient.put('/auth/change-password', passwordData);
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
      // Server responded with error status
      const { data, status } = error.response;
      return {
        message: data.message || 'An error occurred',
        details: data.details || [],
        code: data.code,
        status
      };
    } else if (error.request) {
      // Request made but no response
      return {
        message: 'Network error - please check your connection',
        code: 'NETWORK_ERROR'
      };
    } else {
      // Something else happened
      return {
        message: error.message || 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR'
      };
    }
  }
}

// Create and export singleton instance
const authService = new AuthService();
export default authService;

// Also export the configured axios instance for other services
export { apiClient };