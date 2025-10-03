import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Settings, Webhook, Shield, Crown, AlertCircle, CheckCircle, Edit2, Save, X, Zap } from 'lucide-react';
import Navigation from '../components/Navigation';
import CheckinWebhookSettingsModal from '../components/CheckinWebhookSettingsModal';
import { useAuth } from '../contexts/AuthContext';
import { userService, checkinWebhookService, teamService } from '../lib/supabase';

const AccountSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  
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
      setEditedProfile(profile || {});
    } catch (error) {
      console.error('Error loading user profile:', error);
      setError('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProfile = () => {
    setEditedProfile({ ...userProfile });
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    setEditedProfile({ ...userProfile });
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const updated = await userService.updateUserProfile(editedProfile);
      setUserProfile(updated);
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfileChange = (field: string, value: string) => {
    setEditedProfile(prev => ({ ...prev, [field]: value }));
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
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            Account Settings
          </h1>
          <p className="mt-2 text-gray-600">Manage your profile and integration settings</p>
        </div>
        <div className="space-y-8">
          
          {/* User Profile Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>User Profile</span>
              </h2>
              {!isEditingProfile ? (
                <button
                  onClick={handleEditProfile}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={editedProfile?.full_name || ''}
                    onChange={(e) => handleProfileChange('full_name', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your full name"
                  />
                ) : (
                  <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                    {userProfile?.full_name || 'Not set'}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                  {userProfile?.email || user?.email}
                </div>
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subscription Status</label>
                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    userProfile?.subscription_status === 'premium' 
                      ? 'bg-green-100 text-green-800'
                      : userProfile?.subscription_status === 'enterprise'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {userProfile?.subscription_status === 'premium' && '✨ Premium'}
                    {userProfile?.subscription_status === 'enterprise' && '🚀 Enterprise'}
                    {userProfile?.subscription_status === 'free' && '📱 Free'}
                    {!userProfile?.subscription_status && 'Free'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Member Since</label>
                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                  {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          {/* Webhook Integration Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                <Webhook className="w-5 h-5" />
                <span>Integration Settings</span>
              </h2>
              <Link
                to="/integrations"
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span>Manage Integrations</span>
              </Link>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-600">
                Legacy webhook integration. Use the new <Link to="/integrations" className="text-blue-600 hover:text-blue-700 font-medium">Integrations page</Link> to manage your form connections.
              </p>
              
              {/* Webhook Integration */}
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Webhook className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Legacy Webhook</h3>
                    <p className="text-sm text-gray-600">
                      {hasWebhookConfigured 
                        ? 'Direct webhook endpoint configured' 
                        : 'Direct webhook endpoint not configured'
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {hasWebhookConfigured ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className={`text-sm font-medium ${
                      hasWebhookConfigured ? 'text-green-700' : 'text-amber-600'
                    }`}>
                      {hasWebhookConfigured ? 'Active' : 'Not Active'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowWebhookModal(true)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      canEditSettings
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Team Information</span>
              </h2>
              
              <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                <div className="flex items-center space-x-3">
                  <RoleIcon className="w-8 h-8 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-blue-800">You are a {roleInfo.name}</h3>
                    <p className="text-blue-700 text-sm">
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