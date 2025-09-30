import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, User, Sparkles, Reply, CheckCircle, Archive, X, ChevronDown, ChevronRight, Clock, AlertTriangle, Lightbulb, Target, MessageCircle, Zap, TrendingUp } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { chatService, checkinService, supabase, teamService, type ChatSession as DBChatSession, type Message as DBMessage, type Checkin } from '../lib/supabase';
import UserMenu from '../components/UserMenu';
import CoachResponseModal from '../components/CoachResponseModal';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface QuickResponseTemplate {
  id: string;
  title: string;
  content: string;
  category: 'encouragement' | 'guidance' | 'adjustment' | 'question';
}


const quickResponseTemplates: QuickResponseTemplate[] = [
  {
    id: '1',
    title: 'Great Progress',
    content: "Fantastic work on your check-in! I can see you're making real progress. Keep up the momentum!",
    category: 'encouragement'
  },
  {
    id: '2',
    title: 'Plan Adjustment',
    content: "Based on your feedback, let's make some adjustments to your plan. Here's what I'm thinking...",
    category: 'adjustment'
  },
  {
    id: '3',
    title: 'Clarifying Questions',
    content: "Thanks for the update! I have a few questions to better understand your situation:",
    category: 'question'
  },
  {
    id: '4',
    title: 'Overcoming Challenges',
    content: "I hear you're facing some challenges. This is completely normal. Let's work through this together.",
    category: 'guidance'
  },
  {
    id: '5',
    title: 'Nutrition Focus',
    content: "Let's focus on your nutrition this week. Here are some specific recommendations:",
    category: 'guidance'
  },
  {
    id: '6',
    title: 'Motivation Boost',
    content: "Remember why you started this journey. You've already come so far, and I believe in you!",
    category: 'encouragement'
  }
];

function CheckinDetailPage() {
  const { checkinId } = useParams<{ checkinId: string }>();
  const navigate = useNavigate();
  
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCoachResponseModal, setShowCoachResponseModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  
  // Chat state
  const [userRole, setUserRole] = useState<string | null>(null);
  const [canRespond, setCanRespond] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (checkinId) {
      loadCheckin();
      checkUserPermissions();
    }
  }, [checkinId]);

  const checkUserPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !checkinId) return;

      // Check if user is a coach or team member with permissions
      const effectiveCoachId = await teamService.getEffectiveCoachId();
      const isTeamMember = await teamService.isTeamMember();
      const teamMemberRole = await teamService.getTeamMemberRole();
      
      if (isTeamMember && teamMemberRole) {
        setUserRole(teamMemberRole);
        setCanRespond(teamMemberRole === 'assistant_coach' || teamMemberRole === 'admin');
      } else {
        setUserRole('coach');
        setCanRespond(true);
      }
    } catch (error) {
      console.error('Error checking user permissions:', error);
    }
  };

  const loadCheckin = async () => {
    if (!checkinId) return;
    
    setLoading(true);
    try {
      const checkinData = await checkinService.getCheckinById(checkinId);
      if (checkinData) {
        setCheckin(checkinData);
        
        // Set cached AI analysis if available
        if (checkinData.ai_analysis) {
          setAiAnalysis(checkinData.ai_analysis);
        }
        
        // Generate AI analysis if not cached and status is pending
        if (checkinData.status === 'pending_response' && !checkinData.ai_analysis) {
          await generateAIAnalysis(checkinData);
        } else if (checkinData.status === 'pending_response' && checkinData.ai_analysis) {
          // Check if cached analysis is older than 1 hour, regenerate if so
          const analysisAge = new Date().getTime() - new Date(checkinData.ai_analysis_generated_at || 0).getTime();
          const oneHour = 60 * 60 * 1000;
          
          if (analysisAge > oneHour) {
            // Regenerate analysis in background
            setTimeout(() => generateAIAnalysis(checkinData), 100);
          }
        }
        
        // Load existing chat session if it exists
        await loadChatSession(checkinData);
      } else {
        setError('Check-in not found');
      }
    } catch (error) {
      console.error('Error loading check-in:', error);
      setError('Failed to load check-in');
    } finally {
      setLoading(false);
    }
  };

  const loadChatSession = async (checkinData: Checkin) => {
    try {
      // Check if there's already a chat session for this checkin
      const sessions = await chatService.getChatSessions('checkin-ai');
      const existingSession = sessions.find(session => session.checkin_id === checkinData.id);
      
      if (existingSession) {
        // Load existing session
        setCurrentSessionId(existingSession.id);
        setCurrentThreadId(existingSession.thread_id || null);
        
        // Load messages for this session
        const dbMessages = await chatService.getMessages(existingSession.id);
        const formattedMessages: Message[] = dbMessages.map(msg => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: new Date(msg.created_at)
        }));
        
        setMessages(formattedMessages);
      } else {
        // Create new session for this checkin
        const newSession = await checkinService.createCheckinChatSession(checkinData.id);
        if (newSession) {
          setCurrentSessionId(newSession.id);
          setCurrentThreadId(null);
          
          // Start with a contextual message about the checkin
          setMessages([
            {
              id: Date.now().toString(),
              content: `I'm ready to help you analyze and respond to ${checkinData.client_name}'s check-in from ${new Date(checkinData.date).toLocaleDateString()}. I have access to their transcript and can provide insights based on similar past sessions. What would you like to know or how would you like to respond?`,
              sender: 'ai',
              timestamp: new Date(),
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error loading chat session:', error);
    }
  };

  const generateAIAnalysis = async (checkinData: Checkin) => {
    setIsGeneratingAnalysis(true);
    setAiAnalysis(null);
    
    try {
      // Get current user session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('User not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL missing');
      }

      const apiUrl = `${supabaseUrl}/functions/v1/openai-checkin-analysis`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkinId: checkinData.id,
          clientName: checkinData.client_name,
          transcript: checkinData.transcript,
          tags: checkinData.tags
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate AI analysis: ${response.status}`);
      }

      const data = await response.json();
      const analysis = data.analysis;
      setAiAnalysis(analysis);
      
      // Cache the analysis in the database
      await checkinService.updateCheckinAIAnalysis(checkinData.id, analysis);
    } catch (error) {
      console.error('Error generating AI analysis:', error);
      setAiAnalysis('Unable to generate analysis at this time. Please try again later.');
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const sendToSupabase = async (message: string) => {
    try {
      // Get current user session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('User not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL missing. Please set up your Supabase project.');
      }

      const apiUrl = `${supabaseUrl}/functions/v1/openai-checkin-chat`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message
        }),
      });
    } catch (error) {
      console.error('Error sending message to Supabase:', error);
      throw error;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      // Save user message to database
      await chatService.saveMessage(currentSessionId, userMessage.content, 'user');

      // Send to AI and get response
      await sendToSupabase(userMessage.content);

      // For now, add a placeholder AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm analyzing your message and will provide insights about this check-in shortly.",
        sender: 'ai',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      await chatService.saveMessage(currentSessionId, aiMessage.content, 'ai');
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I encountered an error. Please try again.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickResponse = (template: QuickResponseTemplate) => {
    setInputValue(template.content);
    setShowQuickTemplates(false);
  };

  const handleMarkAsResponded = async () => {
    if (!checkin) return;
    
    try {
      await checkinService.updateCheckinStatus(checkin.id, 'responded');
      setCheckin({ ...checkin, status: 'responded' });
    } catch (error) {
      console.error('Error updating checkin status:', error);
    }
  };

  const handleArchive = async () => {
    if (!checkin) return;
    
    try {
      await checkinService.updateCheckinStatus(checkin.id, 'archived');
      navigate('/checkins');
    } catch (error) {
      console.error('Error archiving checkin:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading check-in...</p>
        </div>
      </div>
    );
  }

  if (error || !checkin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Check-in</h2>
          <p className="text-gray-600 mb-4">{error || 'Check-in not found'}</p>
          <Link
            to="/checkins"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Check-ins
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_response':
        return 'bg-yellow-100 text-yellow-800';
      case 'responded':
        return 'bg-green-100 text-green-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'encouragement':
        return <Sparkles className="h-4 w-4" />;
      case 'guidance':
        return <Lightbulb className="h-4 w-4" />;
      case 'adjustment':
        return <Target className="h-4 w-4" />;
      case 'question':
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'encouragement':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'guidance':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'adjustment':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'question':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link
                to="/checkins"
                className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {checkin.client_name}'s Check-in
                </h1>
                <p className="text-sm text-gray-500">
                  {new Date(checkin.date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(checkin.status)}`}>
                {checkin.status === 'pending_response' && <Clock className="h-3 w-3 mr-1" />}
                {checkin.status === 'responded' && <CheckCircle className="h-3 w-3 mr-1" />}
                {checkin.status === 'archived' && <Archive className="h-3 w-3 mr-1" />}
                {checkin.status.replace('_', ' ')}
              </span>
              <UserMenu />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Check-in Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Transcript */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-medium text-gray-900">Check-in Transcript</h2>
              </div>
              <div className="px-6 py-4">
                <div className="prose max-w-none">
                  <MarkdownRenderer content={checkin.transcript} />
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center">
                    <Zap className="h-5 w-5 mr-2 text-indigo-600" />
                    AI Analysis
                  </h2>
                  {checkin.status === 'pending_response' && (
                    <button
                      onClick={() => generateAIAnalysis(checkin)}
                      disabled={isGeneratingAnalysis}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-50"
                    >
                      {isGeneratingAnalysis ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b border-indigo-600 mr-1"></div>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Refresh Analysis
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="px-6 py-4">
                {isGeneratingAnalysis ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3"></div>
                    <span className="text-gray-600">Generating AI analysis...</span>
                  </div>
                ) : aiAnalysis ? (
                  <div className="prose max-w-none">
                    <MarkdownRenderer content={aiAnalysis} />
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No AI analysis available yet.</p>
                )}
              </div>
            </div>

            {/* Raw Data Toggle */}
            <div className="bg-white rounded-lg shadow-sm border">
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Raw Data</h3>
                {showRawData ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </button>
              {showRawData && (
                <div className="px-6 py-4 border-t bg-gray-50">
                  <pre className="text-xs text-gray-600 overflow-x-auto">
                    {JSON.stringify(checkin, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Chat Interface */}
          <div className="space-y-6">
            {/* Action Buttons */}
            {canRespond && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowCoachResponseModal(true)}
                    className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    Send Response
                  </button>
                  
                  {checkin.status === 'pending_response' && (
                    <button
                      onClick={handleMarkAsResponded}
                      className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark as Responded
                    </button>
                  )}
                  
                  <button
                    onClick={handleArchive}
                    className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </button>
                </div>
              </div>
            )}

            {/* AI Chat Interface */}
            <div className="bg-white rounded-lg shadow-sm border flex flex-col h-96">
              <div className="px-4 py-3 border-b">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <User className="h-5 w-5 mr-2 text-indigo-600" />
                  AI Assistant
                </h3>
              </div>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.sender === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'
                      }`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {/* Input */}
              <div className="border-t p-4">
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask about this check-in..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                
                {/* Quick Response Templates */}
                {showQuickTemplates && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-md">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Responses</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {quickResponseTemplates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleQuickResponse(template)}
                          className={`text-left p-2 rounded border text-xs hover:bg-white transition-colors ${getCategoryColor(template.category)}`}
                        >
                          <div className="flex items-center mb-1">
                            {getCategoryIcon(template.category)}
                            <span className="ml-1 font-medium">{template.title}</span>
                          </div>
                          <p className="text-xs opacity-75 line-clamp-2">{template.content}</p>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowQuickTemplates(false)}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-3 w-3 inline mr-1" />
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coach Response Modal */}
      {showCoachResponseModal && (
        <CoachResponseModal
          checkin={checkin}
          onClose={() => setShowCoachResponseModal(false)}
          onSent={() => {
            setShowCoachResponseModal(false);
            handleMarkAsResponded();
          }}
        />
      )}
    </div>
  );
  };
}

export default CheckinDetailPage;