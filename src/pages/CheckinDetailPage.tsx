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