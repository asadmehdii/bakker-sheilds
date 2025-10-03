import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Settings, Crown, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, userProfile, signOut } = useAuth();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  const getRoleIcon = () => {
    if (userProfile?.app_role === 'super_admin') {
      return <Crown className="w-4 h-4 text-purple-600" />;
    } else if (userProfile?.app_role === 'admin') {
      return <Shield className="w-4 h-4 text-blue-600" />;
    }
    return <User className="w-4 h-4 text-slate-600" />;
  };

  const getRoleDisplay = () => {
    if (userProfile?.app_role === 'super_admin') return 'Super Admin';
    if (userProfile?.app_role === 'admin') return 'Admin';
    if (userProfile?.app_role === 'coach') return 'Coach';
    return 'User';
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
          {user?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {userProfile?.full_name || user?.email?.split('@')[0] || 'User'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
            {getRoleIcon()}
            <span>{getRoleDisplay()}</span>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {userProfile?.full_name || user?.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {user?.email}
                </div>
                <div className="flex items-center space-x-1 mt-1">
                  {getRoleIcon()}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {getRoleDisplay()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <Link
              to="/account-settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
            >
              <Settings className="w-4 h-4" />
              <span>Account Settings</span>
            </Link>
            
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;