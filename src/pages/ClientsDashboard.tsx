import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Search, TrendingUp, TrendingDown, Minus, Calendar, MessageSquare, Clock, Filter, Bell } from 'lucide-react';
import { clientService, checkinService, supabase, type Client } from '../lib/supabase';
import Navigation from '../components/Navigation';

function ClientsDashboard() {
  console.log('🚀 [ClientsDashboard] Component mounting...');
  
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [displayedClients, setDisplayedClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'paused'>('all');
  const [engagementFilter, setEngagementFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [viewMode, setViewMode] = useState<'recent' | 'all'>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingCheckinsCount, setPendingCheckinsCount] = useState(0);
  const clientsPerPage = 12;

  useEffect(() => {
    console.log('🔍 [ClientsDashboard] useEffect running, calling loadClients...');
    loadClients(true); // Force initial load
    loadPendingCheckinsCount();
    
    // Set up real-time subscriptions (optimized)
    const clientsChannel = supabase
      .channel('clients-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'clients' }, 
        (payload) => {
          console.log('Client change detected:', payload);
          // Only reload if it affects the current user's clients
          loadClients();
        }
      )
      .subscribe();

    return () => {
      console.log('🔍 [ClientsDashboard] useEffect cleanup, removing channel');
      supabase.removeChannel(clientsChannel);
    };
  }, []);

  useEffect(() => {
    // Debounce search to improve performance
    const timeoutId = setTimeout(() => {
      filterAndPaginateClients();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [clients, searchQuery, statusFilter, engagementFilter, viewMode, currentPage]);

  const loadClients = async (force = false) => {
    if (isLoading && !force) {
      console.log('🚫 [ClientsDashboard] Already loading, skipping...');
      return; // Prevent multiple simultaneous loads
    }
    
    console.log('🔍 [ClientsDashboard] Starting to load clients...');
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔍 [ClientsDashboard] Calling clientService.getClients()...');
      const data = await clientService.getClients();
      console.log('✅ [ClientsDashboard] Loaded clients:', data.length, 'clients');
      setClients(data);
    } catch (error) {
      console.error('❌ [ClientsDashboard] Error loading clients:', error);
      setError('Failed to load clients. Please try refreshing the page.');
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingCheckinsCount = async () => {
    try {
      const count = await checkinService.getPendingCheckinsCount();
      setPendingCheckinsCount(count);
    } catch (err) {
      console.error('❌ [ClientsDashboard] Error loading pending check-ins count:', err);
    }
  };

  const filterAndPaginateClients = () => {
    let filtered = clients;

    // Apply view mode filter first
    if (viewMode === 'recent') {
      // Show only clients with recent activity (last 30 days) or top 20 most recent
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentClients = filtered.filter(client => 
        client.last_checkin_at && new Date(client.last_checkin_at) >= thirtyDaysAgo
      );
      
      // If less than 12 recent clients, show top clients by total checkins
      if (recentClients.length < 12) {
        filtered = filtered
          .sort((a, b) => (b.total_checkins || 0) - (a.total_checkins || 0))
          .slice(0, 20);
      } else {
        filtered = recentClients;
      }
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(client =>
        client.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (client.email && client.email.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(client => client.status === statusFilter);
    }

    // Apply engagement filter
    if (engagementFilter !== 'all') {
      filtered = filtered.filter(client => client.engagement_level === engagementFilter);
    }

    setFilteredClients(filtered);

    // Apply pagination
    const startIndex = (currentPage - 1) * clientsPerPage;
    const endIndex = startIndex + clientsPerPage;
    setDisplayedClients(filtered.slice(startIndex, endIndex));
  };

  const totalPages = Math.ceil(filteredClients.length / clientsPerPage);

  const getEngagementIcon = (level: string) => {
    switch (level) {
      case 'high': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'low': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700 border border-green-200';
      case 'inactive': return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'paused': return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      default: return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const formatLastCheckin = (date: string | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const checkinDate = new Date(date);
    const diffInDays = Math.floor((now.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clients...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="p-4 bg-red-50 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Users className="w-10 h-10 text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => loadClients()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Try Again
          </button>
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                My Clients
              </h1>
              <p className="mt-2 text-gray-600">
                Manage and track your client relationships
              </p>
            </div>
            <Link
              to="/clients/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Client
            </Link>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Clients</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {clients.filter(c => c.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 bg-purple-50 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Check-ins</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {clients.reduce((sum, client) => sum + client.total_checkins, 0)}
                  </p>
                </div>
              </div>
            </div>
            
            <Link to="/checkins" className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="p-3 bg-orange-50 rounded-lg">
                  <Bell className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending Check-ins</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">{pendingCheckinsCount}</p>
                    {pendingCheckinsCount > 0 && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                        Needs Response
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-sm">
          <div className="flex flex-wrap gap-4 items-center">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setViewMode('recent');
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'recent'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Recent Activity
              </button>
              <button
                onClick={() => {
                  setViewMode('all');
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Clients
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            {/* Engagement Filter */}
            <div>
              <select
                value={engagementFilter}
                onChange={(e) => setEngagementFilter(e.target.value as any)}
                className="px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="all">All Engagement</option>
                <option value="high">High Engagement</option>
                <option value="medium">Medium Engagement</option>
                <option value="low">Low Engagement</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        {viewMode === 'recent' && filteredClients.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Showing {filteredClients.length} clients with recent activity (last 30 days)
            </p>
          </div>
        )}

        {/* Clients Grid */}
        {filteredClients.length === 0 ? (
          <div className="text-center py-16">
            <div className="p-4 bg-gray-50 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <Users className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {clients.length === 0 ? 'No clients yet' : 'No clients match your filters'}
            </h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              {clients.length === 0 
                ? 'Get started by adding your first client and begin tracking their progress' 
                : 'Try adjusting your search or filter criteria to find the clients you\'re looking for'
              }
            </p>
            {clients.length === 0 && (
              <Link
                to="/clients/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                Add Your First Client
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedClients.map((client) => (
              <Link
                key={client.id}
                to={`/client/${client.id}`}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {client.full_name}
                    </h3>
                    {client.email && (
                      <p className="text-sm text-gray-500 mt-1">{client.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {getEngagementIcon(client.engagement_level)}
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(client.status)}`}>
                      {client.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Check-ins:</span>
                    <span className="font-semibold text-gray-900">{client.total_checkins}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Last Check-in:</span>
                    <span className="font-semibold text-gray-900">{formatLastCheckin(client.last_checkin_at)}</span>
                  </div>
                </div>

                {client.goals && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      <span className="font-medium text-gray-800">Goals:</span> {client.goals}
                    </p>
                  </div>
                )}
              </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8">
                <div className="text-sm text-gray-700">
                  Showing {((currentPage - 1) * clientsPerPage) + 1} to {Math.min(currentPage * clientsPerPage, filteredClients.length)} of {filteredClients.length} clients
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ClientsDashboard;