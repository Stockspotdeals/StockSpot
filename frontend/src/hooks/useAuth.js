import { useState, useEffect, useContext, createContext } from 'react';
import authService from '../services/authService';

// Create Auth Context
const AuthContext = createContext(null);

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Initialize auth state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (authService.isAuthenticated()) {
          // Try to get current user from token
          const currentUser = authService.getCurrentUser();
          if (currentUser) {
            setUser(currentUser);
          } else {
            // Token exists but invalid, try to refresh
            try {
              await authService.refreshToken();
              const refreshedUser = authService.getCurrentUser();
              setUser(refreshedUser);
            } catch (refreshError) {
              // Refresh failed, clear token
              authService.setToken(null);
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Clear any invalid tokens
        authService.setToken(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (credentials) => {
    setLoading(true);
    try {
      const response = await authService.login(credentials);
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      return response;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (userData) => {
    setLoading(true);
    try {
      const response = await authService.register(userData);
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      return response;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  // Logout from all devices
  const logoutAll = async () => {
    setLoading(true);
    try {
      await authService.logoutAll();
    } catch (error) {
      console.error('Logout all error:', error);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  // Update profile
  const updateProfile = async (profileData) => {
    try {
      const response = await authService.updateProfile(profileData);
      // Update user state if email changed
      if (profileData.email) {
        setUser(prev => ({ ...prev, email: profileData.email }));
      }
      return response;
    } catch (error) {
      throw error;
    }
  };

  // Change password
  const changePassword = async (passwordData) => {
    try {
      const response = await authService.changePassword(passwordData);
      // Password change logs out all sessions, so clear user state
      setUser(null);
      return response;
    } catch (error) {
      throw error;
    }
  };

  // Check if user has specific plan
  const hasPlan = (plan) => {
    if (!user) return false;
    if (Array.isArray(plan)) {
      return plan.includes(user.plan);
    }
    return user.plan === plan;
  };

  // Check if user is admin
  const isAdmin = () => {
    return user?.plan === 'admin';
  };

  // Check if user has premium features
  const isPremium = () => {
    return user?.plan === 'paid' || user?.plan === 'admin';
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    return user !== null;
  };

  const value = {
    user,
    loading,
    initialized,
    login,
    register,
    logout,
    logoutAll,
    updateProfile,
    changePassword,
    hasPlan,
    isAdmin,
    isPremium,
    isAuthenticated
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// HOC for protected routes
export const withAuth = (Component) => {
  return (props) => {
    const { isAuthenticated, loading, initialized } = useAuth();

    if (!initialized || loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!isAuthenticated()) {
      // Redirect to login
      window.location.href = '/login';
      return null;
    }

    return <Component {...props} />;
  };
};

// HOC for admin-only routes
export const withAdminAuth = (Component) => {
  return (props) => {
    const { isAuthenticated, isAdmin, loading, initialized } = useAuth();

    if (!initialized || loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!isAuthenticated() || !isAdmin()) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
            <p className="text-gray-600 mb-4">Administrator privileges required</p>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};

// HOC for premium-only routes
export const withPremiumAuth = (Component) => {
  return (props) => {
    const { isAuthenticated, isPremium, loading, initialized } = useAuth();

    if (!initialized || loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!isAuthenticated()) {
      window.location.href = '/login';
      return null;
    }

    if (!isPremium()) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Premium Feature</h2>
            <p className="text-gray-600 mb-4">This feature is only available to paid subscribers</p>
            <button
              onClick={() => window.location.href = '/upgrade'}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mr-2"
            >
              Upgrade Now
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};