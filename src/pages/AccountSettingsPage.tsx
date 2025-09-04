import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Settings, Webhook, Shield, Crown, AlertCircle, CheckCircle } from 'lucide-react';
import UserMenu from '../components/UserMenu';
import CheckinWebhookSettingsModal from '../components/CheckinWebhookSettingsModal';
import { useAuth } from '../contexts/AuthContext';
import { userService, checkinWebhookService, teamService } from '../lib/supabase';

const AccountSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  
  // Integration status
  const [hasWebhookConfigured, setHasWebhookConfigured] = useState(false);
  
  // Role and permissions
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [canEditSettings, setCanEditSettings] = useState(false);

  useEffect(() => {
    loadUserData();
    checkIntegrationStatus();
    checkUserPermissions();
  }, []);

  const loadUserData = async () => {
    try {
      const profile = await userService.getUserProfile();
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      setError('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const checkIntegrationStatus = async () => {
    try {
      // Check webhook status
      const webhookSettings = await checkinWebhookService.getUserCheckinWebhookSettings();
      setHasWebhookConfigured(!!(webhookSettings?.webhook_secret));
    } catch (error) {
      console.error('Error checking integration status:', error);
    }
  };

  const checkUserPermissions = async () => {
    try {
      const isMember = await teamService.isTeamMember();
      const role = await teamService.getTeamMemberRole();
      
      setIsTeamMember(isMember);
      setUserRole(role);
      
      // Can edit if they're the coach (not a team member) or if they're an admin team member
      const canEdit = !isMember || role === 'admin';
      setCanEditSettings(canEdit);
    } catch (error) {
      console.error('Error checking user permissions:', error);
    }
  };

  const handleIntegrationUpdate = () => {
    checkIntegrationStatus();
  };

  const getRoleDisplay = () => {
    if (!isTeamMember) {
      return { name: 'Coach', icon: Crown, color: 'text-purple-600 bg-purple-100' };
    } else if (userRole === 'admin') {
      return { name: 'Admin', icon: Shield, color: 'text-blue-600 bg-blue-100' };
    } else if (userRole === 'assistant_coach') {
      return { name: 'Assistant Coach', icon: User, color: 'text-green-600 bg-green-100' };
    }
    return { name: 'Member', icon: User, color: 'text-slate-600 bg-slate-100' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading account settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    );
  }

  const roleInfo = getRoleDisplay();
  const RoleIcon = roleInfo.icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              to="/" 
              className="flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors duration-200"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to CheckinAI
            </Link>
            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
              <Settings className="w-6 h-6" />
              <span>Account Settings</span>
            </h1>
          </div>
          <UserMenu />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-8">
          
          {/* User Profile Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>User Profile</span>
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200">
                  {userProfile?.full_name || 'Not set'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200">
                  {userProfile?.email || user?.email}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Subscription Status</label>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    userProfile?.subscription_status === 'premium' 
                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                      : userProfile?.subscription_status === 'enterprise'
                      ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300'
                      : 'bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-300'
                  }`}>
                    {userProfile?.subscription_status === 'premium' && '✨ Premium'}
                    {userProfile?.subscription_status === 'enterprise' && '🚀 Enterprise'}
                    {userProfile?.subscription_status === 'free' && '📱 Free'}
                    {!userProfile?.subscription_status && 'Unknown'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Member Since</label>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200">
                  {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          {/* Webhook Integration Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center space-x-2">
              <Webhook className="w-5 h-5" />
              <span>Check-in Integration</span>
            </h2>
            
            <div className="space-y-4">
              {/* Webhook Integration */}
              <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 rounded-lg flex items-center justify-center">
                    <Webhook className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Check-in Webhook</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {hasWebhookConfigured 
                        ? 'Automatically receive check-in transcripts' 
                        : 'Configure webhook to receive check-ins automatically'
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {hasWebhookConfigured ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className={`text-sm font-medium ${
                      hasWebhookConfigured ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
                    }`}>
                      {hasWebhookConfigured ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowWebhookModal(true)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                      canEditSettings
                        ? 'bg-teal-600 hover:bg-teal-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {canEditSettings ? (hasWebhookConfigured ? 'Manage' : 'Setup') : 'View'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Team Information (for team members) */}
          {isTeamMember && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Team Information</span>
              </h2>
              
              <div className={`p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20`}>
                <div className="flex items-center space-x-3">
                  <RoleIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200">You are a {roleInfo.name}</h3>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      {userRole === 'admin' 
                        ? 'You have full access to all features and can manage team settings.'
                        : 'You can view and respond to check-ins but cannot modify account settings.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CheckinWebhookSettingsModal
        isOpen={showWebhookModal}
        onClose={() => setShowWebhookModal(false)}
        onSave={handleIntegrationUpdate}
        canEdit={canEditSettings}
      />
    </div>
  );
};

export default AccountSettingsPage;