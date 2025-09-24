import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, MessageSquare, Calendar, TrendingUp, TrendingDown, Clock, Mail, Phone, MapPin, Target, FileText, Trash2, Archive, Reply, CheckCircle, Minus } from 'lucide-react';
import { clientService, checkinService, supabase, type Client, type Checkin } from '../lib/supabase';
import Navigation from '../components/Navigation';

function ClientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'checkins' | 'analytics'>('overview');

  useEffect(() => {
    if (clientId) {
      loadClientData();
      
      // Set up real-time subscriptions for this specific client
      const clientChannel = supabase
        .channel(`client-${clientId}`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'clients', filter: `id=eq.${clientId}` }, 
          (payload) => {
            console.log('Client profile change detected:', payload);
            loadClientData();
          }
        )
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'checkins', filter: `client_id=eq.${clientId}` }, 
          (payload) => {
            console.log('Client checkin change detected:', payload);
            loadClientData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(clientChannel);
      };
    }
  }, [clientId]);

  const loadClientData = async () => {
    if (!clientId) return;
    
    setIsLoading(true);
    try {
      const [clientData, checkinsData, analyticsData] = await Promise.all([
        clientService.getClientById(clientId),
        clientService.getClientCheckins(clientId),
        clientService.getClientAnalytics(clientId)
      ]);
      
      setClient(clientData);
      setCheckins(checkinsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading client data:', error);
    }
    setIsLoading(false);
  };

  const getEngagementIcon = (level: string) => {
    switch (level) {
      case 'high': return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'low': return <TrendingDown className="w-5 h-5 text-red-600" />;
      default: return <Minus className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCheckinStatusIcon = (status: string) => {
    switch (status) {
      case 'pending_response': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'responded': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'archived': return <Archive className="w-4 h-4 text-gray-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEngagementTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'stable': return <Minus className="w-4 h-4 text-blue-600" />;
      default: return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading client profile...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Client not found</h2>
          <Link to="/clients" className="text-blue-600 hover:text-blue-700">
            ← Back to clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              to="/clients"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Clients
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {client.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{client.full_name}</h1>
                  <div className="flex items-center gap-4 mt-2">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(client.status)}`}>
                      {client.status}
                    </span>
                    <div className="flex items-center gap-2">
                      {getEngagementIcon(client.engagement_level)}
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {client.engagement_level} engagement
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <Link
                to={`/client/${client.id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit Client
              </Link>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Email</p>
                    <p className="font-medium text-slate-900 dark:text-white">{client.email}</p>
                  </div>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Phone</p>
                    <p className="font-medium text-slate-900 dark:text-white">{client.phone}</p>
                  </div>
                </div>
              )}
              {client.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Location</p>
                    <p className="font-medium text-slate-900 dark:text-white">{client.location}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-slate-200 dark:border-slate-700">
            <nav className="flex space-x-8">
              {['overview', 'checkins', 'analytics'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Stats */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{client.total_checkins}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Check-ins</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{analytics?.respondedCheckins || 0}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Responded</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{analytics?.pendingCheckins || 0}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {analytics?.averageResponseTime ? `${Math.round(analytics.averageResponseTime)}h` : 'N/A'}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Avg Response</p>
                  </div>
                </div>
              </div>

              {/* Goals */}
              {client.goals && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-5 h-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Goals</h3>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{client.goals}</p>
                </div>
              )}

              {/* Notes */}
              {client.notes && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notes</h3>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Recent Check-ins */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Check-ins</h3>
                <div className="space-y-3">
                  {checkins.slice(0, 5).map((checkin) => (
                    <Link
                      key={checkin.id}
                      to={`/checkin/${checkin.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {getCheckinStatusIcon(checkin.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {formatDate(checkin.date)}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                          {checkin.status.replace('_', ' ')}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {checkins.length === 0 && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">
                      No check-ins yet
                    </p>
                  )}
                </div>
                {checkins.length > 5 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setActiveTab('checkins')}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View all {checkins.length} check-ins →
                    </button>
                  </div>
                )}
              </div>

              {/* Client Info */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Client Information</h3>
                <div className="space-y-3 text-sm">
                  {client.age && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Age:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{client.age}</span>
                    </div>
                  )}
                  {client.gender && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Gender:</span>
                      <span className="font-medium text-slate-900 dark:text-white capitalize">{client.gender}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Joined:</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatDate(client.created_at)}
                    </span>
                  </div>
                  {client.onboarded_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Onboarded:</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatDate(client.onboarded_at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'checkins' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All Check-ins</h3>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {checkins.map((checkin) => (
                <Link
                  key={checkin.id}
                  to={`/checkin/${checkin.id}`}
                  className="flex items-center gap-4 p-6 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {getCheckinStatusIcon(checkin.status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {formatDate(checkin.date)}
                      </p>
                      <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                        {checkin.status.replace('_', ' ')}
                      </span>
                    </div>
                    {checkin.transcript && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {checkin.transcript.slice(0, 200)}...
                      </p>
                    )}
                  </div>
                </Link>
              ))}
              {checkins.length === 0 && (
                <div className="p-12 text-center">
                  <MessageSquare className="mx-auto w-12 h-12 text-slate-400 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No check-ins yet</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Check-ins from this client will appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Engagement Metrics</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Engagement Trend:</span>
                  <div className="flex items-center gap-2">
                    {getEngagementTrendIcon(analytics.engagementTrend)}
                    <span className="font-medium text-slate-900 dark:text-white capitalize">
                      {analytics.engagementTrend}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Total Check-ins:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {analytics.totalCheckins}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Response Rate:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {analytics.totalCheckins > 0 
                      ? Math.round((analytics.respondedCheckins / analytics.totalCheckins) * 100)
                      : 0
                    }%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Avg Response Time:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {analytics.averageResponseTime ? `${Math.round(analytics.averageResponseTime)} hours` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Activity Summary</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Pending Responses:</span>
                  <span className="font-medium text-orange-600">{analytics.pendingCheckins}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Completed Responses:</span>
                  <span className="font-medium text-green-600">{analytics.respondedCheckins}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Last Check-in:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {analytics.lastCheckinDate 
                      ? formatDate(analytics.lastCheckinDate)
                      : 'Never'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientProfile;