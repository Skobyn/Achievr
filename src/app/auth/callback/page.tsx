'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { searchParams } = new URL(window.location.href);
      const code = searchParams.get('code');
      
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
          
          // Set the flag for successful sign-in
          sessionStorage.setItem('just_signed_in', 'true');
          
          // Redirect to dashboard
          router.push('/dashboard');
        } catch (error) {
          console.error('Error exchanging code for session:', error);
          router.push('/auth/signin?error=Authentication%20failed');
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
        <h2 className="text-2xl font-semibold mb-4">Completing sign in...</h2>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
      </div>
    </div>
  );
} 