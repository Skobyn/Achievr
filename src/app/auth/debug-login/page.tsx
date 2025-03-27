'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function DebugLoginPage() {
  useEffect(() => {
    // This is a special debug page only for development
    if (process.env.NODE_ENV === 'production') {
      window.location.href = '/auth/signin';
      return;
    }
    
    // Clear any existing session data
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear cookies
    document.cookie.split(";").forEach(function(c) {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    console.log('DEBUG: All storage and cookies cleared');
  }, []);
  
  const handleDirectLogin = () => {
    try {
      console.log('DEBUG: Creating test user directly');
      
      // Create test user data
      const testUser = {
        id: 'test-user-id',
        uid: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null
      };
      
      // Store in localStorage directly
      localStorage.setItem('supabase.auth.user', JSON.stringify(testUser));
      
      console.log('DEBUG: Test user created in localStorage');
      
      // Redirect to dashboard
      console.log('DEBUG: Redirecting to dashboard');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('DEBUG: Error during direct login:', error);
    }
  };
  
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner message="Redirecting..." />
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-[350px] shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">DEBUG MODE</CardTitle>
          <CardDescription className="text-center">
            Special debug login page for development
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-center text-muted-foreground">
              This page creates a test user directly in localStorage,
              completely bypassing the Supabase authentication.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handleDirectLogin}>
            Create Debug User & Enter Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 