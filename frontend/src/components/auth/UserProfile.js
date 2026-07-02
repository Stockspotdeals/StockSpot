import React from 'react';
import { useAuth } from '../../hooks/useAuth';

const UserProfile = () => {
  const { user, logout, logoutAll } = useAuth();

  if (!user) {
    return (
      <div className="text-center text-gray-500">
        <p>Please log in to view your profile</p>
      </div>
    );
  }

  const getPlanBadgeColor = (plan) => {
    switch (plan) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'free':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'suspended':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleLogoutAll = async () => {
    if (window.confirm('This will log you out from all devices. Are you sure?')) {
      try {
        await logoutAll();
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout all error:', error);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <h2 className="text-2xl font-bold text-white">User Profile</h2>
      </div>

      {/* Profile Content */}
      <div className="p-6">
        <div className="space-y-6">
          {/* User Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                <span className="text-gray-900">{user.email}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                <span className="text-gray-900 font-mono text-sm">{user.id}</span>
              </div>
            </div>
          </div>

          {/* Plan and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plan
              </label>
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getPlanBadgeColor(user.plan)}`}>
                  {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeColor(user.status)}`}>
                  {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Plan Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Plan Features
            </label>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              {user.plan === 'free' && (
                <ul className="space-y-2 text-sm text-blue-700">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    Track up to 10 products
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    5 alerts per day
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    100 API calls per hour
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    50 deals per month
                  </li>
                </ul>
              )}
              
              {user.plan === 'paid' && (
                <ul className="space-y-2 text-sm text-green-700">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    Track up to 500 products
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    100 alerts per day
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    1,000 API calls per hour
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    10,000 deals per month
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    Priority support
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                    Advanced analytics
                  </li>
                </ul>
              )}
              
              {user.plan === 'admin' && (
                <ul className="space-y-2 text-sm text-purple-700">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                    Unlimited everything
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                    User management
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                    System administration
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                    Advanced reporting
                  </li>
                </ul>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex flex-wrap gap-3">
              <a
                href="/profile/edit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
              >
                Edit Profile
              </a>
              
              <a
                href="/profile/change-password"
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition duration-200"
              >
                Change Password
              </a>
              
              {user.plan === 'free' && (
                <a
                  href="/upgrade"
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200"
                >
                  Upgrade Plan
                </a>
              )}
              
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition duration-200"
              >
                Sign Out
              </button>
              
              <button
                onClick={handleLogoutAll}
                className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition duration-200"
              >
                Sign Out All Devices
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;