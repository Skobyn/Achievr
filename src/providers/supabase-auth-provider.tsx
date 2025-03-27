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
  debugForceLogin: () => Promise<void>;
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
  updateUserInfo: async () => {},
  debugForceLogin: async () => {}
});

// Initialize user profile in database if needed
const initializeUserProfile = async (supabaseUser: SupabaseUser) => {
  try {
    console.log("Checking profile for user:", supabaseUser.id);
    
    // Check if user has a profile already
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
      
      if (profileError) {
        if (profileError.code === 'PGRST116') {
          // Profile not found - normal for new users
          console.log("Profile not found for user, will create one");
        } else {
          // Other error
          console.error("Error fetching profile:", profileError);
        }
      } else if (profile) {
        console.log("User profile already exists");
        return true;
      }
      
      // Profile doesn't exist, create one
      console.log("Creating profile for user:", supabaseUser.id);
      
      // Get user metadata
      const metadata = supabaseUser.user_metadata || {};
      
      // Insert profile
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: supabaseUser.id,
          email: supabaseUser.email,
          display_name: metadata.full_name || metadata.name || supabaseUser.email?.split('@')[0] || 'User',
          avatar_url: metadata.avatar_url
        });
      
      if (error) {
        // Ignore errors for now - table might not exist yet
        console.warn("Could not create profile, table may not exist yet:", error.message);
      } else {
        console.log("Profile created successfully");
      }
    } catch (profileError) {
      console.error("Profile check/create failed:", profileError);
    }
    
    // Check if user has a household - try/catch to handle missing table
    try {
      const { data: households, error: householdError } = await supabase
        .from('households')
        .select('id')
        .eq('created_by', supabaseUser.id);
      
      if (householdError) {
        console.warn("Could not check households, table may not exist yet:", householdError.message);
      } else if (!households || households.length === 0) {
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
        
        if (createError) {
          console.warn("Could not create household, table may not exist yet:", createError.message);
        } else if (household) {
          // Add user as household owner
          try {
            const { error: memberError } = await supabase
              .from('household_members')
              .insert({
                household_id: household.id,
                profile_id: supabaseUser.id,
                role: 'owner'
              });
            
            if (memberError) {
              console.warn("Could not create household member, table may not exist yet:", memberError.message);
            } else {
              console.log("Household created successfully");
            }
          } catch (memberError) {
            console.warn("Failed to create household member:", memberError);
          }
        }
      } else {
        console.log("User already has a household");
      }
    } catch (householdError) {
      // Households table may not exist yet - that's okay
      console.warn("Could not check or create household - tables may not exist yet:", householdError);
    }
    
    // Always return true to not block authentication
    return true;
  } catch (error) {
    console.error("Error initializing user profile:", error);
    // Return true anyway to not block authentication
    return true;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Listen for auth state changes
  useEffect(() => {
    console.log("Setting up Supabase auth state listener with DEBUG mode");
    
    // Add debug logging
    if (typeof window !== 'undefined') {
      console.log("DEBUG: Current pathname:", window.location.pathname);
      console.log("DEBUG: just_signed_in flag:", sessionStorage.getItem('just_signed_in'));
      console.log("DEBUG: redirect_loop_blocker:", sessionStorage.getItem('redirect_loop_blocker'));
    }
    
    const loadUserProfile = async (supabaseUser: SupabaseUser) => {
      try {
        console.log("DEBUG: Loading user profile for ID:", supabaseUser.id);
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
        console.log("DEBUG: Auth state change event:", event);
        setLoading(true);
        
        try {
          if (session?.user) {
            console.log("DEBUG: Session found with user ID:", session.user.id);
            const userProfile = await loadUserProfile(session.user);
            setUser(userProfile);
            console.log("User authenticated:", userProfile.displayName);
            
            // Function to get a cookie value
            const getCookie = (name: string) => {
              if (typeof document === 'undefined') return null;
              const value = `; ${document.cookie}`;
              const parts = value.split(`; ${name}=`);
              if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
              return null;
            };
            
            // Check if we need to redirect to dashboard - check both sessionStorage and cookies
            const justSignedInStorage = sessionStorage.getItem('just_signed_in');
            const justSignedInCookie = getCookie('just_signed_in');
            
            console.log("DEBUG: just_signed_in flags - Storage:", justSignedInStorage, "Cookie:", justSignedInCookie);
            
            if (justSignedInStorage === 'true' || justSignedInCookie === 'true') {
              console.log("Just signed in flag detected, redirecting to dashboard");
              // Clear flags from both storage and cookies
              sessionStorage.removeItem('just_signed_in');
              document.cookie = 'just_signed_in=; max-age=0; path=/';
              sessionStorage.removeItem('redirect_loop_blocker');
              document.cookie = 'redirect_loop_blocker=; max-age=0; path=/';
              
              // Use router for client-side navigation if we're not already on dashboard
              if (window.location.pathname !== '/dashboard') {
                console.log("DEBUG: Redirecting to dashboard from path:", window.location.pathname);
                router.push('/dashboard');
              }
            }
          } else {
            console.log("DEBUG: No session or user found");
            setUser(null);
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
        console.log("DEBUG: Performing initial auth check");
        setLoading(true);
        
        const { data: { user: currentUser }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error("DEBUG: Error getting current user:", error);
        }
        
        if (currentUser) {
          console.log("DEBUG: Initial check found user ID:", currentUser.id);
          const userProfile = await loadUserProfile(currentUser);
          setUser(userProfile);
        } else {
          console.log("DEBUG: Initial check found no user");
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
      console.log('Starting sign in process for email:', email);
      
      // First, clear all auth state
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.removeItem('just_signed_in');
      sessionStorage.removeItem('redirect_loop_blocker');
      sessionStorage.removeItem('auth_attempted');
      
      // Clear cookies
      document.cookie = "just_signed_in=; max-age=0; path=/";
      document.cookie = "redirect_loop_blocker=; max-age=0; path=/";
      document.cookie = "auth_attempted=; max-age=0; path=/";
      
      // Sign out completely first
      await supabase.auth.signOut();
      console.log('Cleared any existing sessions');
      
      // Now attempt to sign in - use the basic version first
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('Sign in error:', error);
        throw error;
      }
      
      if (!data.session) {
        console.error('No session returned after sign in');
        throw new Error('No session returned');
      }
      
      console.log('Sign in successful, session established');
      console.log('User ID:', data.session.user.id);
      console.log('Access token received, length:', data.session.access_token.length);
      
      // Store the user data in localStorage for persistence
      localStorage.setItem('supabase.auth.user', JSON.stringify(data.user));
      
      // Set the user directly rather than waiting for the auth state change
      const userProfile = mapSupabaseUser(data.user);
      setUser(userProfile);
      
      toast.success('Signed in successfully');
      
      // Direct navigation to dashboard
      console.log('Redirecting to dashboard via direct navigation');
      window.location.href = '/dashboard';
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
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?source=verification`
        }
      });
      
      if (error) throw error;
      
      // Check if email confirmation is required
      if (data?.user?.identities?.length === 0) {
        // User already exists but hasn't confirmed email
        toast.error('An account with this email already exists but is not confirmed. Please check your email for the confirmation link.');
        return;
      }
      
      if (data?.user?.confirmed_at) {
        // User is already confirmed, we can log them in immediately
        toast.success('Account created and verified successfully!');
        sessionStorage.setItem('just_signed_in', 'true');
        router.push('/dashboard');
      } else {
        // Email confirmation required
        toast.success('Account created successfully. Please check your email for verification.');
      }
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

  // FOR DEBUGGING - Add a debug login function 
  const debugForceLogin = async () => {
    if (process.env.NODE_ENV !== 'production') {
      try {
        setLoading(true);
        console.log('DEBUG: Creating test user session');
        
        // Force create a test user
        const testUser = {
          id: 'test-user-id',
          uid: 'test-user-id',
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: null
        };
        
        // Set the user state directly
        setUser(testUser);
        
        // Store in localStorage for persistence
        localStorage.setItem('supabase.auth.user', JSON.stringify(testUser));
        
        console.log('DEBUG: Test user created and session established');
        console.log('DEBUG: User:', testUser);
        
        // Don't return the user object to match the Promise<void> return type
      } catch (error) {
        console.error('DEBUG: Error creating test session:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        updateUserInfo,
        debugForceLogin
      }}
    >
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