'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'sonner';

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      setStatus('Processing authentication callback...');
      
      try {
        // Clear any existing redirect loop blockers
        document.cookie = 'redirect_loop_blocker=; Max-Age=0; path=/';
        
        const { searchParams } = new URL(window.location.href);
        const code = searchParams.get('code');
        
        if (!code) {
          setError('No authentication code provided');
          setStatus('Authentication failed');
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }
        
        setStatus('Exchanging code for session...');
        console.log('Exchanging auth code for session');
        
        const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        
        if (sessionError) {
          console.error('Session exchange error:', sessionError);
          setError(sessionError.message);
          setStatus('Authentication failed');
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }
        
        if (!data.session) {
          console.error('No session data returned');
          setError('No session data returned');
          setStatus('Authentication failed');
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }
        
        // Verify the session was properly set
        const { data: { session }, error: verifyError } = await supabase.auth.getSession();
        
        if (verifyError || !session) {
          console.error('Session verification failed:', verifyError);
          setError('Failed to verify session');
          setStatus('Authentication failed');
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }
        
        console.log('Auth successful, user ID:', session.user.id);
        setStatus('Authentication successful! Redirecting...');
        
        // Set the flag for successful sign-in in both sessionStorage and cookies
        console.log('Setting authentication success flags');
        sessionStorage.setItem('just_signed_in', 'true');
        document.cookie = 'just_signed_in=true; path=/';
        document.cookie = 'redirect_loop_blocker=false; max-age=0; path=/';
        
        // Add a timeout to ensure we don't get stuck
        setTimeout(() => {
          console.log('Redirecting to dashboard');
          router.push('/dashboard');
        }, 1500);
      } catch (error: any) {
        console.error('Uncaught error in auth callback:', error);
        setError(error.message || 'Unknown error');
        setStatus('Authentication failed');
        toast.error(`Authentication error: ${error.message || 'Unknown error'}`);
        
        // Redirect back to sign-in after delay
        setTimeout(() => {
          router.push('/auth/signin?error=Authentication%20failed');
        }, 2000);
      }
    };

    handleAuthCallback();
    
    // Failsafe: If we're still on this page after 10 seconds, redirect to sign-in
    const timeout = setTimeout(() => {
      console.warn('Auth callback timeout - redirecting to sign-in');
      router.push('/auth/signin');
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <div className="flex h-screen flex-col items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <h2 className="text-2xl font-semibold mb-4">{status}</h2>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
        
        <p className="text-muted-foreground text-sm">
          If you are not redirected automatically, 
          <button 
            onClick={() => router.push('/dashboard')} 
            className="text-primary underline ml-1"
          >
            click here
          </button>
        </p>
      </div>
    </div>
  );
} 