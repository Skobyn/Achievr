'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'sonner';

export default function AuthCallback() {
  const router = useRouter();
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { searchParams } = new URL(window.location.href);
      const code = searchParams.get('code');
      const source = searchParams.get('source');
      
      if (code) {
        try {
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) throw error;
          
          // Set the flag for successful sign-in
          sessionStorage.setItem('just_signed_in', 'true');
          
          if (source === 'verification') {
            setMessage('Email verified successfully! Redirecting to dashboard...');
            toast.success('Email verified successfully!');
          } else {
            setMessage('Authentication successful! Redirecting...');
          }
          
          // Wait a moment to show the success message before redirecting
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        } catch (error: any) {
          console.error('Error exchanging code for session:', error);
          setMessage('Authentication failed. Redirecting to sign in...');
          toast.error('Authentication failed: ' + (error.message || 'Unknown error'));
          
          // Wait a moment to show the error message before redirecting
          setTimeout(() => {
            router.push('/auth/signin?error=Authentication%20failed');
          }, 1500);
        }
      } else {
        router.push('/auth/signin');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">{message}</h2>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
      </div>
    </div>
  );
} 