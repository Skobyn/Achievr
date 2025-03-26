'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// User type that maps Supabase user properties
export type User = {
  id: string;
  uid: string; // Keep for backward compatibility
  email: string;
  displayName: string;
  photoURL?: string | null;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserInfo: (userInfo: Partial<User>) => Promise<void>;
}

// Convert SupabaseUser to our User type
const mapSupabaseUser = (supabaseUser: SupabaseUser): User => {
  const userData = supabaseUser.user_metadata || {};
  
  return {
    id: supabaseUser.id,
    uid: supabaseUser.id, // Keep uid for backward compatibility
    email: supabaseUser.email || '',
    displayName: userData.full_name || userData.name || supabaseUser.email?.split('@')[0] || 'User',
    photoURL: userData.avatar_url || null
  };
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  updateUserInfo: async () => {}
});

// Initialize user profile in database if needed
const initializeUserProfile = async (supabaseUser: SupabaseUser) => {
  try {
    console.log("Checking profile for user:", supabaseUser.id);
    
    // Check if user has a profile already
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();
    
    if (profileError || !profile) {
      console.log("Creating profile for user:", supabaseUser.id);
      
      // Get user metadata
      const metadata = supabaseUser.user_metadata || {};
      
      // Insert profile
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: supabaseUser.id,
          email: supabaseUser.email,
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          avatar_url: metadata.avatar_url
        });
      
      if (error) throw error;
      console.log("Profile created successfully");
    } else {
      console.log("User profile already exists");
    }
    
    // Check if user has a household
    const { data: households, error: householdError } = await supabase
      .from('households')
      .select('id')
      .eq('created_by', supabaseUser.id);
    
    if (!householdError && (!households || households.length === 0)) {
      console.log("Creating default household for user:", supabaseUser.id);
      
      // Create default household
      const { data: household, error: createError } = await supabase
        .from('households')
        .insert({
          name: 'My Household',
          created_by: supabaseUser.id
        })
        .select('id')
        .single();
      
      if (createError) throw createError;
      
      // Add user as household owner
      if (household) {
        const { error: memberError } = await supabase
          .from('household_members')
          .insert({
            household_id: household.id,
            profile_id: supabaseUser.id,
            role: 'owner'
          });
        
        if (memberError) throw memberError;
      }
      
      console.log("Household created successfully");
    }
    
    return true;
  } catch (error) {
    console.error("Error initializing user profile:", error);
    throw error;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Listen for auth state changes
  useEffect(() => {
    console.log("Setting up Supabase auth state listener");
    
    const loadUserProfile = async (supabaseUser: SupabaseUser) => {
      try {
        // Map basic Supabase user info
        const mappedUser = mapSupabaseUser(supabaseUser);
        
        // Initialize user profile if needed
        await initializeUserProfile(supabaseUser);
        
        return mappedUser;
      } catch (error) {
        console.error("Error loading user profile:", error);
        return mapSupabaseUser(supabaseUser);
      }
    };
    
    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);
        
        try {
          if (session?.user) {
            const userProfile = await loadUserProfile(session.user);
            setUser(userProfile);
            console.log("User authenticated:", userProfile.displayName);
            
            // Check if we need to redirect to dashboard
            const justSignedIn = sessionStorage.getItem('just_signed_in');
            if (justSignedIn === 'true') {
              console.log("Just signed in flag detected, redirecting to dashboard");
              sessionStorage.removeItem('just_signed_in');
              sessionStorage.removeItem('redirect_loop_blocker'); // Clear any redirect loop blockers
              
              // Use router for client-side navigation if we're not already on dashboard
              if (window.location.pathname !== '/dashboard') {
                router.push('/dashboard');
              }
            }
          } else {
            setUser(null);
            console.log("No user authenticated");
          }
        } catch (error) {
          console.error("Auth error:", error);
          setUser(null);
        } finally {
          setLoading(false);
        }
      }
    );
    
    // Initial auth check
    const checkCurrentUser = async () => {
      try {
        setLoading(true);
        
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        
        if (currentUser) {
          const userProfile = await loadUserProfile(currentUser);
          setUser(userProfile);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error checking current user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    checkCurrentUser();
    
    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // Set flag that we just signed in to trigger redirect in auth state listener
      sessionStorage.setItem('just_signed_in', 'true');
      
      toast.success('Signed in successfully');
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast.error(error.message || 'Failed to sign in');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) throw error;
      
      // The redirect happens automatically, but we set the flag for when we return
      sessionStorage.setItem('just_signed_in', 'true');
    } catch (error: any) {
      console.error('Google sign in error:', error);
      toast.error(error.message || 'Failed to sign in with Google');
      setLoading(false);
      throw error;
    }
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName
          }
        }
      });
      
      if (error) throw error;
      
      toast.success('Account created successfully. Please check your email for verification.');
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast.error(error.message || 'Failed to create account');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      router.push('/auth/signin');
      toast.success('Signed out successfully');
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast.error(error.message || 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  // Update user info (display name, photo URL)
  const updateUserInfo = async (userInfo: Partial<User>) => {
    try {
      setLoading(true);
      
      if (!user) throw new Error('No user signed in');
      
      // Update auth metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: userInfo.displayName,
          avatar_url: userInfo.photoURL
        }
      });
      
      if (updateError) throw updateError;
      
      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: userInfo.displayName?.split(' ')[0],
          last_name: userInfo.displayName?.split(' ').slice(1).join(' ') || '',
          avatar_url: userInfo.photoURL || null
        })
        .eq('id', user.id);
      
      if (profileError) throw profileError;
      
      // Update local user state
      setUser(prev => prev ? { ...prev, ...userInfo } : null);
      
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Update user info error:', error);
      toast.error(error.message || 'Failed to update profile');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      updateUserInfo
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 