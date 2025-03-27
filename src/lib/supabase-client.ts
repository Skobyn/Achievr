import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing Supabase environment variables');
}

// Create the Supabase client with enhanced session handling
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'supabase.auth.token',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

// Helper functions for common database operations
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user;
};

export const getUserById = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}; 