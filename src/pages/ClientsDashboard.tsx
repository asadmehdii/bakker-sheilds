import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Search, TrendingUp, TrendingDown, Minus, Calendar, MessageSquare, Clock, Filter } from 'lucide-react';
import { clientService, supabase, type Client } from '../lib/supabase';

function ClientsDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'paused'>('all');
  const [engagementFilter, setEngagementFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    loadClients();
    
    // Set up real-time subscriptions
    const clientsChannel = supabase
      .channel('clients-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'clients' }, 
        (payload) => {
          console.log('Client change detected:', payload);
          // Reload clients when any client changes
          loadClients();
        }
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'checkins' }, 
        (payload) => {
          console.log('Checkin change detected:', payload);
          // Reload clients when checkins change (affects client stats)
          loadClients();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
    };
  }, []);

  useEffect(() => {
    filterClients();
  }, [clients, searchQuery, statusFilter, engagementFilter]);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const data = await clientService.getClients();
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
    setIsLoading(false);
  };

  const filterClients = () => {
    let filtered = clients;

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
  };

  const getEngagementIcon = (level: string) => {
    switch (level) {
      case 'high': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'low': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-yellow-600" />;
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading clients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                My Clients
              </h1>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <Users className="w-8 h-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Clients</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{clients.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Active Clients</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {clients.filter(c => c.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <MessageSquare className="w-8 h-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Check-ins</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {clients.reduce((sum, client) => sum + client.total_checkins, 0)}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <Clock className="w-8 h-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Recent Activity</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {clients.filter(c => c.last_checkin_at && 
                      new Date(c.last_checkin_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
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
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Engagement</option>
                <option value="high">High Engagement</option>
                <option value="medium">Medium Engagement</option>
                <option value="low">Low Engagement</option>
              </select>
            </div>
          </div>
        </div>

        {/* Clients Grid */}
        {filteredClients.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto w-12 h-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              {clients.length === 0 ? 'No clients yet' : 'No clients match your filters'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {clients.length === 0 
                ? 'Get started by adding your first client' 
                : 'Try adjusting your search or filter criteria'
              }
            </p>
            {clients.length === 0 && (
              <Link
                to="/clients/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Your First Client
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <Link
                key={client.id}
                to={`/client/${client.id}`}
                className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {client.full_name}
                    </h3>
                    {client.email && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">{client.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getEngagementIcon(client.engagement_level)}
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(client.status)}`}>
                      {client.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Total Check-ins:</span>
                    <span className="font-medium">{client.total_checkins}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Last Check-in:</span>
                    <span className="font-medium">{formatLastCheckin(client.last_checkin_at)}</span>
                  </div>
                </div>

                {client.goals && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      <span className="font-medium">Goals:</span> {client.goals}
                    </p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientsDashboard;