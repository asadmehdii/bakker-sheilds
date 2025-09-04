import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, User, Sparkles, Reply, CheckCircle, Archive, X, ChevronDown, ChevronRight, Clock, AlertTriangle, Lightbulb, Target, MessageCircle, Zap, TrendingUp } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { chatService, checkinService, type ChatSession as DBChatSession, type Message as DBMessage, type Checkin } from '../lib/supabase';
import UserMenu from '../components/UserMenu';
import AIDropdown from '../components/AIDropdown';
import CoachResponseModal from '../components/CoachResponseModal';
import { aiTools } from '../config/aiTools';

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

const AI_TYPE = 'checkin-ai';

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

  // Find current AI tool
  const currentAI = aiTools.find(tool => tool.id === AI_TYPE)!;

  useEffect(() => {
    if (checkinId) {
      loadCheckin();
      checkUserPermissions();
    }
  }, [checkinId]);

  const checkUserPermissions = async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !checkinId) return;

      // Check if user is a coach or team member with permissions
      const { teamService } = await import('../lib/supabase');
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
      const sessions = await chatService.getChatSessions(AI_TYPE);
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
      const { supabase } = await import('../lib/supabase');
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
      const { supabase } = await import('../lib/supabase');
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
          message,
          threadId: currentThreadId,
          checkinId: checkin?.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Update thread ID if this is a new conversation
      if (data.threadId && !currentThreadId) {
        setCurrentThreadId(data.threadId);
        
        if (currentSessionId) {
          await chatService.updateChatSession(currentSessionId, {
            thread_id: data.threadId
          });
        }
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.message,
        sender: 'ai',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);

      // Save AI message to database
      if (currentSessionId) {
        await chatService.addMessage(currentSessionId, data.message, 'ai');
        
        const preview = data.message.length > 50 ? data.message.substring(0, 50) + '...' : data.message;
        await chatService.updateChatSession(currentSessionId, {
          last_message_preview: preview
        });
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleSendMessage = async (messageToSend?: string) => {
    const messageContent = messageToSend || inputValue.trim();
    if (!messageContent || isTyping || !checkin) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);
    
    // Save user message to existing session
    if (currentSessionId) {
      try {
        await chatService.addMessage(currentSessionId, messageContent, 'user');
      } catch (error) {
        console.error('Error saving user message:', error);
      }
    }
    
    setInputValue('');
    setIsTyping(true);
    setError(null);

    try {
      await sendToSupabase(messageContent);
    } catch (error) {
      console.error('Error processing message:', error);
      setError(error instanceof Error ? error.message : 'Failed to process message');
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCoachResponseSubmitted = () => {
    // Reload checkin to update status
    loadCheckin();
  };

  const handleMarkAsResponded = async () => {
    if (!checkin) return;
    
    try {
      const success = await checkinService.updateCheckinStatus(checkin.id, 'responded', currentSessionId);
      if (success) {
        // Reload checkin to update status
        await loadCheckin();
      } else {
        setError('Failed to mark checkin as responded');
      }
    } catch (error) {
      console.error('Error marking checkin as responded:', error);
      setError('Failed to mark checkin as responded');
    }
  };

  const handleQuickTemplateSelect = (template: QuickResponseTemplate) => {
    setInputValue(template.content);
    setShowQuickTemplates(false);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const parseAnalysisContent = (content: string) => {
    // Split content into sections based on numbered headings
    const sections = content.split(/(?=\d+\.\s*\*\*[^*]+\*\*)/);
    
    return sections.map((section, index) => {
      if (!section.trim()) return null;
      
      // Extract section title and content
      const titleMatch = section.match(/\d+\.\s*\*\*([^*]+)\*\*/);
      const title = titleMatch ? titleMatch[1] : `Section ${index + 1}`;
      const content = section.replace(/\d+\.\s*\*\*[^*]+\*\*:?\s*/, '').trim();
      
      // Determine icon based on title
      let icon = Lightbulb;
      let iconColor = 'text-blue-500';
      let bgColor = 'bg-blue-50';
      let borderColor = 'border-blue-200';
      
      if (title.toLowerCase().includes('insight') || title.toLowerCase().includes('key')) {
        icon = Target;
        iconColor = 'text-purple-500';
        bgColor = 'bg-purple-50';
        borderColor = 'border-purple-200';
      } else if (title.toLowerCase().includes('pattern') || title.toLowerCase().includes('trend')) {
        icon = TrendingUp;
        iconColor = 'text-green-500';
        bgColor = 'bg-green-50';
        borderColor = 'border-green-200';
      } else if (title.toLowerCase().includes('recommendation') || title.toLowerCase().includes('action')) {
        icon = Lightbulb;
        iconColor = 'text-yellow-500';
        bgColor = 'bg-yellow-50';
        borderColor = 'border-yellow-200';
      } else if (title.toLowerCase().includes('concern') || title.toLowerCase().includes('issue')) {
        icon = AlertTriangle;
        iconColor = 'text-red-500';
        bgColor = 'bg-red-50';
        borderColor = 'border-red-200';
      }
      
      return {
        title,
        content,
        icon,
        iconColor,
        bgColor,
        borderColor
      };
    }).filter(Boolean);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black dark:via-gray-900 dark:to-black flex items-center justify-center transition-colors duration-300">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-gray-400 transition-colors duration-300">Loading check-in...</p>
        </div>
      </div>
    );
  }

  if (error || !checkin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black dark:via-gray-900 dark:to-black flex items-center justify-center transition-colors duration-300">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2 transition-colors duration-300">Check-in Not Found</h1>
          <p className="text-slate-600 dark:text-gray-300 mb-6 transition-colors duration-300">{error || 'The requested check-in could not be found.'}</p>
          <Link
            to="/checkin-ai"
            className="bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors duration-200"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const analysisSection = parseAnalysisContent(aiAnalysis || '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-black dark:via-gray-900 dark:to-black transition-colors duration-300">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 shadow-sm transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                to="/checkin-ai" 
                className="p-2 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
                title="Back to CheckinAI Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-gray-300" />
              </Link>
              <img 
                src="/Copy of ar-logo-black.png" 
                alt="ARFunnel" 
                className="h-8 w-auto dark:hidden"
              />
              <img 
                src="/ar-logo-white (1).png" 
                alt="ARFunnel" 
                className="h-8 w-auto hidden dark:block"
              />
              <AIDropdown currentAI={currentAI} allAITools={aiTools} />
            </div>
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Check-in Details */}
          <div className="space-y-6">
            {/* Sticky Action Bar */}
            <div className="sticky top-4 z-10 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-4 transition-colors duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    {checkin.client_id ? (
                      <Link 
                        to={`/checkin-ai/client/${checkin.client_id}`}
                        className="text-xl font-bold text-slate-800 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors duration-200"
                      >
                        {checkin.client_name}
                      </Link>
                    ) : (
                      <h1 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">{checkin.client_name}</h1>
                    )}
                    <div className="flex items-center space-x-3">
                      <p className="text-sm text-slate-600 dark:text-gray-300 transition-colors duration-300">
                        {new Date(checkin.date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        checkin.status === 'pending_response'
                          ? 'bg-amber-100 text-amber-800'
                          : checkin.status === 'responded'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {checkin.status === 'pending_response' ? 'Pending' : 
                         checkin.status === 'responded' ? 'Responded' : 'Archived'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {checkin.status === 'pending_response' && (
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {Math.floor((Date.now() - new Date(checkin.date).getTime()) / (1000 * 60 * 60))}h ago
                      </span>
                    </div>
                    {canRespond ? (
                      <button
                        onClick={() => setShowCoachResponseModal(true)}
                        className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white px-4 py-2 rounded-lg font-medium hover:from-teal-700 hover:to-emerald-800 transition-all duration-200 flex items-center space-x-2 shadow-md hover:shadow-lg"
                      >
                        <Reply className="w-4 h-4" />
                        <span>Respond</span>
                      </button>
                    ) : (
                      <div className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">
                        {userRole === 'viewer' ? 'Viewers cannot respond to check-ins' : 'No permission to respond'}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* AI Analysis Section */}
            {(checkin.status === 'pending_response' || aiAnalysis) && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6 transition-colors duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center space-x-2 transition-colors duration-300">
                    <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <span>AI Analysis & Recommendations</span>
                  </h2>
                </div>
                
                {isGeneratingAnalysis ? (
                  <div className="flex items-center space-x-3 text-slate-600 dark:text-gray-300 py-8 transition-colors duration-300">
                    <div className="animate-spin w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full"></div>
                    <span className="text-sm">
                      {aiAnalysis ? 'Updating analysis...' : 'Analyzing check-in and generating recommendations...'}
                    </span>
                  </div>
                ) : aiAnalysis ? (
                  <div className="space-y-4">
                    {analysisSection.length > 0 ? (
                      analysisSection.map((section, index) => {
                        const IconComponent = section.icon;
                        return (
                          <div key={index} className={`${section.bgColor} dark:bg-gray-800 ${section.borderColor} dark:border-gray-600 border rounded-lg p-4`}>
                            <div className="flex items-center space-x-2 mb-3">
                              <IconComponent className={`w-5 h-5 ${section.iconColor}`} />
                              <h3 className="font-semibold text-slate-800 dark:text-white transition-colors duration-300">{section.title}</h3>
                            </div>
                            <div className="text-sm text-slate-700 dark:text-gray-200 transition-colors duration-300">
                              <MarkdownRenderer content={section.content} className="prose-sm" />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-slate-700 dark:text-gray-300 max-h-64 overflow-y-auto pr-2 transition-colors duration-300">
                        <MarkdownRenderer content={aiAnalysis} className="prose-sm" />
                      </div>
                    )}
                  </div>
                ) : (
                  checkin.status === 'pending_response' ? (
                    <div className="text-sm text-slate-500 dark:text-gray-400 italic py-8 text-center transition-colors duration-300">
                      AI analysis will appear here when the check-in is processed.
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Raw Check-in Data */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 transition-colors duration-300">
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="w-full p-6 text-left hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors duration-200 flex items-center justify-between"
              >
                <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">Check-in Transcript</h2>
                {showRawData ? (
                  <ChevronDown className="w-5 h-5 text-slate-600 dark:text-gray-300" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-600 dark:text-gray-300" />
                )}
              </button>
              {showRawData && (
                <div className="px-6 pb-6">
                  <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-gray-700 transition-colors duration-300">
                    <div className="text-sm text-slate-700 dark:text-gray-300 max-h-64 overflow-y-auto transition-colors duration-300">
                      <p className="whitespace-pre-wrap leading-relaxed">{checkin.transcript || 'No transcript available'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Coach Response */}
            {checkin.coach_response && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6 transition-colors duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">Coach Response</h2>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      checkin.response_type === 'written' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {checkin.response_type === 'written' ? 'Written' : 'Video Transcript'}
                    </span>
                    {checkin.response_submitted_at && (
                      <span className="text-xs text-slate-500 dark:text-gray-400 transition-colors duration-300">
                        {new Date(checkin.response_submitted_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-gray-700 transition-colors duration-300">
                  <div className="text-sm text-slate-700 dark:text-gray-300 max-h-64 overflow-y-auto transition-colors duration-300">
                    <p className="whitespace-pre-wrap leading-relaxed">{checkin.coach_response}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Chat Interface */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 flex flex-col h-[800px] transition-colors duration-300">
            {/* Chat Header */}
            <div className="p-6 border-b border-slate-200 dark:border-gray-700 transition-colors duration-300">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors duration-300">CheckinAI Assistant</h2>
              <p className="text-sm text-slate-600 dark:text-gray-300 mt-1 transition-colors duration-300">
                Analyzing check-in from {checkin.client_name} with smart recall technology
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start space-x-3 max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.sender === 'user' 
                        ? 'bg-slate-300' 
                        : 'bg-gradient-to-r from-teal-500 to-emerald-600'
                    }`}>
                      {message.sender === 'user' ? (
                        <span className="text-slate-600 text-sm font-medium">U</span>
                      ) : (
                        <currentAI.icon className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                      message.sender === 'user'
                        ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white'
                        : 'bg-white text-slate-800 border border-slate-200'
                    }`}>
                      {message.sender === 'ai' ? (
                        <MarkdownRenderer 
                          content={message.content} 
                          className="text-sm leading-relaxed"
                        />
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      )}
                      <p className={`text-xs mt-2 ${
                        message.sender === 'user' ? 'text-teal-100' : 'text-slate-500'
                      }`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-3 max-w-3xl">
                    <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-emerald-600 rounded-full flex items-center justify-center">
                      <currentAI.icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white text-slate-800 border border-slate-200 px-4 py-3 rounded-2xl shadow-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Response Templates */}
            {showQuickTemplates && (
              <div className="border-t border-slate-200 dark:border-gray-700 p-4 bg-slate-50 dark:bg-gray-800 transition-colors duration-300">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300 transition-colors duration-300">Quick Response Templates</h3>
                  <button
                    onClick={() => setShowQuickTemplates(false)}
                    className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-400 transition-colors duration-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {quickResponseTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleQuickTemplateSelect(template)}
                      className="text-left p-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg hover:border-teal-300 dark:hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all duration-200 group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-800 dark:text-white group-hover:text-teal-800 dark:group-hover:text-teal-300 transition-colors duration-200">
                          {template.title}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          template.category === 'encouragement' ? 'bg-green-100 text-green-700' :
                          template.category === 'guidance' ? 'bg-blue-100 text-blue-700' :
                          template.category === 'adjustment' ? 'bg-orange-100 text-orange-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {template.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-gray-300 line-clamp-2 transition-colors duration-300">{template.content}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="p-6 border-t border-slate-200 dark:border-gray-700 transition-colors duration-300">
              <div className="flex items-end space-x-3">
                <div className="flex-1 relative">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={`Ask about ${checkin.client_name}'s check-in...`}
                    className="w-full px-4 py-3 pr-12 border border-slate-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none min-h-[44px] max-h-32 transition-all duration-200 bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
                    rows={1}
                    disabled={isTyping}
                  />
                </div>

                <button
                  onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    showQuickTemplates 
                      ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' 
                      : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700'
                  }`}
                  title="Quick response templates"
                >
                  <Zap className="w-5 h-5" />
                </button>

                {canRespond && (
                  <button
                    onClick={() => handleMarkAsResponded()}
                    className="bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 px-3 py-2 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-gray-700 transition-all duration-200 text-sm"
                  >
                    Mark as Responded
                  </button>
                )}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isTyping}
                  className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white p-3 rounded-xl hover:from-teal-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:transform-none"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coach Response Modal */}
      <CoachResponseModal
        isOpen={showCoachResponseModal}
        onClose={() => setShowCoachResponseModal(false)}
        checkin={checkin}
        onResponseSubmitted={handleCoachResponseSubmitted}
      />
    </div>
  );
}

export default CheckinDetailPage;