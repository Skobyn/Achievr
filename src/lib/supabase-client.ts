import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Log the environment variables to help debug
if (typeof window !== 'undefined') {
  console.log('Supabase configuration:');
  console.log('- URL defined:', !!supabaseUrl);
  console.log('- Key defined:', !!supabaseKey);
  console.log('- URL prefix:', supabaseUrl.substring(0, 15) + '...');
  console.log('- Key length:', supabaseKey.length);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

// Create the Supabase client with enhanced session handling
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'supabase.auth.token',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    debug: true // Add debug mode to see more auth details
  }
});

// Test the connection
if (typeof window !== 'undefined') {
  // Only run in browser
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Supabase Auth State Change:', event);
    console.log('Session present:', !!session);
  });
}

// Helper functions for common database operations
export const getUser = async () => {
  try {
    console.log('Fetching current user...');
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error('getUser error:', error);
      throw error;
    }
    console.log('User fetched:', !!data?.user);
    return data?.user;
  } catch (e) {
    console.error('getUser exception:', e);
    return null;
  }
};

export const getUserById = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('getUserById error:', error);
      throw error;
    }
    return data;
  } catch (e) {
    console.error('getUserById exception:', e);
    return null;
  }
}; 