import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'coach' | 'admin' | 'super_admin';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth page if not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check role requirements if specified
  if (requiredRole && userProfile) {
    const roleHierarchy: Record<string, number> = {
      'user': 0,
      'coach': 1,
      'admin': 2,
      'super_admin': 3
    };

    const userRoleLevel = roleHierarchy[userProfile.app_role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-6 py-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p>You don't have permission to access this page.</p>
              <p className="text-sm mt-2">Required role: {requiredRole}</p>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;