import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, userService, logService } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  app_role: 'user' | 'coach' | 'admin' | 'super_admin';
  subscription_status: 'free' | 'premium' | 'enterprise';
  subscription_expires_at: string | null;
  has_completed_niche_onboarding: boolean;
  niche_analysis: string | null;
  niche_analysis_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  hasRole: (role: string) => boolean;
  isSuperAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load user profile when user changes
  useEffect(() => {
    const loadUserProfile = async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 [Auth Context] loadUserProfile called with user:', user?.id);
      }
      setIsLoading(true);
      if (user) {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 [Auth Context] Attempting to load user profile...');
          }
          const profile = await userService.getUserProfile();
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 [Auth Context] User profile loaded:', profile?.id);
          }
          setUserProfile(profile);
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [Auth Context] No user, clearing profile');
        }
        setUserProfile(null);
      }
      setIsLoading(false);
    };

    loadUserProfile();
  }, [user]);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [Auth Context] Getting initial session...');
        }
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ [Auth Context] Session error:', error);
          // Clear invalid session data
          setSession(null);
          setUser(null);
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ [Auth Context] Initial session loaded:', session?.user?.id);
          }
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        // Clear session on any error
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Auth state changed:', event);
        }
        setSession(session);
        setUser(session?.user ?? null);
        
        // Ensure loading is false after auth state changes
        setLoading(false);
        
        // Log authentication events (non-blocking)
        if (event === 'SIGNED_IN') {
          logService.logEvent('login', {
            user_id: session?.user?.id,
            email: session?.user?.email
          }).catch(() => {});
        } else if (event === 'SIGNED_OUT') {
          logService.logEvent('logout', {
            user_id: user?.id,
            email: user?.email
          }).catch(() => {});
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email,
        },
      },
    });

    // Log signup attempt (non-blocking)
    if (!error && data.user) {
      logService.logEvent('signup', {
        user_id: data.user.id,
        email: data.user.email
      }).catch(() => {});
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    // Capture user data before sign out for logging
    const currentUser = user;

    // Log logout event before clearing session (non-blocking)
    if (currentUser) {
      logService.logEvent('logout', {
        user_id: currentUser.id,
        email: currentUser.email
      }).catch(() => {});
    }

    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const hasRole = (role: string): boolean => {
    return userProfile?.app_role === role;
  };

  const isSuperAdmin = (): boolean => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [Auth Context] isSuperAdmin check:', {
        hasProfile: !!userProfile,
        appRole: userProfile?.app_role,
        result: userProfile?.app_role === 'super_admin'
      });
    }
    return userProfile?.app_role === 'super_admin';
  };

  const value = {
    user,
    session,
    userProfile,
    isLoading,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    hasRole,
    isSuperAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};