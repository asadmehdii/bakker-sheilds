import React, { useState, useRef, useEffect } from 'react';
import { Send, Plus, MessageSquare, Zap, AlertCircle, X, Trash2, ArrowLeft, Menu, Users, Calendar, TrendingUp, Settings, Webhook, Bell, Clock, FileText, User, CheckCircle, Archive, Reply, Sparkles, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { chatService, checkinService, checkinWebhookService, teamService, logService, type ChatSession as DBChatSession, type Message as DBMessage, type Checkin } from '../lib/supabase';
import UserMenu from '../components/UserMenu';
import CheckinWebhookSettingsModal from '../components/CheckinWebhookSettingsModal';
import CoachResponseModal from '../components/CoachResponseModal';
import Navigation from '../components/Navigation';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  threadId?: string;
  checkinId?: string;
  type: 'general' | 'checkin';
}

function CheckinAIApp() {
  const { clientId } = useParams<{ clientId: string }>();
  
  // Dashboard state
  const [hasWebhookConfigured, setHasWebhookConfigured] = useState(false);
  const [showWebhookSettingsModal, setShowWebhookSettingsModal] = useState(false);
  const [pendingCheckins, setPendingCheckins] = useState<Checkin[]>([]);
  const [completedCheckins, setCompletedCheckins] = useState<Checkin[]>([]);
  const [pendingCheckinsCount, setPendingCheckinsCount] = useState(0);
  const [isLoadingCheckins, setIsLoadingCheckins] = useState(true);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [effectiveCoachId, setEffectiveCoachId] = useState<string | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [canEditSettings, setCanEditSettings] = useState(true);

  // Load data on component mount
  useEffect(() => {
    initializeTeamContext();
    loadInitialData();
    
    // Log feature usage
    logService.logFeatureUsage('checkin_ai_opened', {
      client_filter: clientId || null
    });
  }, []);

  useEffect(() => {
    if (clientId) {
      loadClientName();
    }
  }, [clientId]);

  const initializeTeamContext = async () => {
    try {
      const [coachId, isMember] = await Promise.all([
        teamService.getEffectiveCoachId(),
        teamService.isTeamMember()
      ]);
      
      setEffectiveCoachId(coachId);
      setIsTeamMember(isMember);
      
      // Team members cannot edit webhook settings, only coaches can
      setCanEditSettings(!isMember);
    } catch (error) {
      console.error('Error initializing team context:', error);
    }
  };

  const loadInitialData = async () => {
    await Promise.all([
      loadCheckins(),
      checkWebhookStatus()
    ]);
  };

  const loadClientName = async () => {
    if (!clientId) return;
    
    try {
      const name = await checkinService.getClientNameById(clientId);
      setClientName(name);
    } catch (error) {
      console.error('Error loading client name:', error);
    }
  };

  const loadCheckins = async () => {
    setIsLoadingCheckins(true);
    try {
      const [pending, completed, count] = await Promise.all([
        checkinService.getPendingCheckins(clientId),
        checkinService.getCompletedCheckins(clientId),
        checkinService.getPendingCheckinsCount(clientId)
      ]);
      setPendingCheckins(pending);
      setCompletedCheckins(completed);
      setPendingCheckinsCount(count);
    } catch (error) {
      console.error('Error loading checkins:', error);
      setError('Failed to load checkins');
    } finally {
      setIsLoadingCheckins(false);
    }
  };

  const checkWebhookStatus = async () => {
    try {
      const settings = await checkinWebhookService.getUserCheckinWebhookSettings();
      const isConfigured = !!(settings?.webhook_secret);
      setHasWebhookConfigured(isConfigured);
      console.log('🔍 [CheckinAI] Webhook status check: settings =', settings, 'isConfigured =', isConfigured);
    } catch (error) {
      console.error('Error checking webhook status:', error);
    }
  };

  const scrollToBottom = () => {
    // Function moved to CheckinDetailPage
  };


  const openCheckinChat = async (checkin: Checkin) => {
    // Navigate to the checkin detail page instead of opening a modal
    window.location.href = `/checkin-ai/checkin/${checkin.id}`;
    
    // Log checkin viewed
    logService.logFeatureUsage('checkin_viewed', {
      checkin_id: checkin.id,
      client_name: checkin.client_name,
      status: checkin.status
    });
  };

  const closeChatWindow = () => {
    // Function removed - no longer needed with page-based approach
  };

  const sendToSupabase = async (message: string) => {
    // Function moved to CheckinDetailPage
  };

  const handleSendMessage = async (messageToSend?: string) => {
    // Function moved to CheckinDetailPage
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Function moved to CheckinDetailPage
  };

  const handleWebhookSettingsSaved = () => {
    checkWebhookStatus();
    loadCheckins();
  };

  const generateAIAnalysis = async (checkin: Checkin) => {
    // Function moved to CheckinDetailPage
  };

  const handleCoachResponseSubmitted = () => {
    // Function removed - handled on dedicated page
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const CheckinCard = ({ checkin, isCompleted = false }: { checkin: Checkin; isCompleted?: boolean }) => (
    <div
      onClick={() => openCheckinChat(checkin)}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-gray-600 hover:border-teal-300 dark:hover:border-teal-500 hover:shadow-md cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            {checkin.client_id && !clientId ? (
              <Link 
                to={`/checkin-ai/client/${checkin.client_id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-slate-800 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors duration-200"
              >
                {checkin.client_name}
              </Link>
            ) : (
              <h3 className="font-semibold text-slate-800 dark:text-white">{checkin.client_name}</h3>
            )}
            <p className="text-sm text-slate-500 dark:text-gray-400">{formatDate(new Date(checkin.date))}</p>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ExternalLink className="w-4 h-4 text-slate-400 dark:text-gray-500" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isCompleted ? (
            <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400" />
          ) : (
            <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            isCompleted 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
          }`}>
            {isCompleted ? 'Responded' : 'Pending'}
          </span>
        </div>
      </div>
      
      <div className="mb-3">
        <p className="text-sm text-slate-600 dark:text-gray-300 line-clamp-2">
          {checkin.transcript.substring(0, 120)}...
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <MessageSquare className="w-8 h-8 text-blue-600" />
                {clientId && clientName ? `${clientName} Check-ins` : 'All Check-ins'}
              </h1>
              <p className="mt-2 text-gray-600">
                {clientId && clientName 
                  ? `Manage check-ins from ${clientName}`
                  : isTeamMember 
                    ? 'View and respond to check-ins across your team'
                    : 'View and respond to all check-ins from your clients'
                }
              </p>
            </div>
            {pendingCheckinsCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <Bell className="w-5 h-5 text-orange-600" />
                <span className="text-orange-700 font-medium">{pendingCheckinsCount} pending</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      {/* Webhook Setup Banner */}
      {!hasWebhookConfigured && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-b border-amber-200 dark:border-amber-800 p-4 transition-colors duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Webhook className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 transition-colors duration-300">Webhook Setup Required</h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 transition-colors duration-300">Configure your webhook to automatically receive check-in transcripts and enable smart recall features.</p>
              </div>
            </div>
            <button
              onClick={() => setShowWebhookSettingsModal(true)}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 transition-all duration-200 text-sm"
            >
              Setup Now
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4 transition-colors duration-300">
          <div className="max-w-7xl mx-auto flex items-center space-x-2 text-red-700 dark:text-red-400 transition-colors duration-300">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800 rounded transition-colors duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Dashboard Header */}
        <div className="mb-8">
          {clientId && clientName ? (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Link 
                  to="/checkin-ai"
                  className="text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300 transition-colors duration-200"
                >
                  CheckinAI
                </Link>
                <span className="text-slate-400 dark:text-gray-500">/</span>
                <span className="text-slate-800 dark:text-white transition-colors duration-300">Client</span>
              </div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 transition-colors duration-300">Check-ins for {clientName}</h1>
              <p className="text-slate-600 dark:text-gray-300 transition-colors duration-300">
                All check-ins from {clientName} with AI-powered insights and smart recall technology.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 transition-colors duration-300">CheckinAI Dashboard</h1>
              <p className="text-slate-600 dark:text-gray-300 transition-colors duration-300">
                {isTeamMember 
                  ? "View and respond to your coach's client check-ins with AI-powered insights and smart recall technology."
                  : "Manage and respond to client check-ins with AI-powered insights and smart recall technology."
                }
              </p>
            </div>
          )}
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* New Checkins Requiring Response */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 transition-colors duration-300">
            <div className="p-6 border-b border-slate-200 dark:border-gray-700 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                    <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">New Checkins</h2>
                    <p className="text-sm text-slate-600 dark:text-gray-300 transition-colors duration-300">
                      {clientId && clientName 
                        ? `From ${clientName} requiring response` 
                        : isTeamMember 
                          ? 'Requiring response from your team'
                          : 'Requiring your response'
                      }
                    </p>
                  </div>
                </div>
                {pendingCheckinsCount > 0 && (
                  <span className="bg-red-500 text-white text-sm px-3 py-1 rounded-full font-medium">
                    {pendingCheckinsCount}
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-6">
              {isLoadingCheckins ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-500 dark:text-gray-400 transition-colors duration-300">Loading checkins...</p>
                </div>
              ) : pendingCheckins.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-slate-400 dark:text-gray-500" />
                  <h3 className="text-lg font-medium text-slate-600 dark:text-gray-300 mb-2 transition-colors duration-300">No pending checkins</h3>
                  <p className="text-slate-500 dark:text-gray-400 transition-colors duration-300">New checkins will appear here when received via webhook</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {pendingCheckins.map((checkin) => (
                    <CheckinCard key={checkin.id} checkin={checkin} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Completed Checkins */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 transition-colors duration-300">
            <div className="p-6 border-b border-slate-200 dark:border-gray-700 transition-colors duration-300">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">Completed Checkins</h2>
                  <p className="text-sm text-slate-600 dark:text-gray-300 transition-colors duration-300">
                    {clientId && clientName 
                      ? `From ${clientName} recently responded to` 
                      : isTeamMember 
                        ? 'Recently responded to by your team'
                        : 'Recently responded to'
                    }
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {isLoadingCheckins ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-500 dark:text-gray-400 transition-colors duration-300">Loading checkins...</p>
                </div>
              ) : completedCheckins.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-slate-400 dark:text-gray-500" />
                  <h3 className="text-lg font-medium text-slate-600 dark:text-gray-300 mb-2 transition-colors duration-300">No completed checkins</h3>
                  <p className="text-slate-500 dark:text-gray-400 transition-colors duration-300">Checkins you've responded to will appear here</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {completedCheckins.map((checkin) => (
                    <CheckinCard key={checkin.id} checkin={checkin} isCompleted />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Window Modal */}
      {/* Chat window modal removed - now using dedicated page */}

      {/* Webhook Settings Modal */}
      <CheckinWebhookSettingsModal
        isOpen={showWebhookSettingsModal}
        onClose={() => setShowWebhookSettingsModal(false)}
        onSave={handleWebhookSettingsSaved}
        canEdit={canEditSettings}
      />

      {/* Coach Response Modal */}
      {/* Coach response modal removed - now handled on dedicated page */}
        </div>
      </div>
    </div>
  );
}

export default CheckinAIApp;