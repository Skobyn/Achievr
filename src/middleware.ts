import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Middleware to handle auth redirects
export async function middleware(request: NextRequest) {
  try {
    // Get the pathname of the request
    const path = request.nextUrl.pathname;

    // Define public paths that don't require authentication
    const isPublicPath = path.startsWith('/auth/') || 
                        path === '/' || 
                        path.startsWith('/api/') ||
                        path.startsWith('/_next/') ||
                        path.includes('favicon.ico');
                        
    // Special cases that should always pass through
    if (path === '/auth/callback' || path.startsWith('/_next/') || path.includes('favicon.ico')) {
      return NextResponse.next();
    }

    // Create a Supabase client for the middleware
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => request.cookies.get(name)?.value,
          set: (name, value, options) => {
            // This is just for the middleware and doesn't actually set cookies
          },
          remove: (name, options) => {
            // This is just for the middleware and doesn't actually remove cookies
          },
        },
      }
    );

    try {
      // Check if user is authenticated
      const { data: { session }, error } = await supabase.auth.getSession();

      // If there's an error getting the session, let the request through
      // The client-side auth handling will take care of redirecting if needed
      if (error) {
        console.error('Session check error:', error);
        return NextResponse.next();
      }

      // Check for redirect loop
      const redirectLoopBlocker = request.cookies.get('redirect_loop_blocker')?.value;
      
      // Redirect unauthenticated users to signin page
      if (!session && !isPublicPath) {
        // If we detect a potential redirect loop, let the request through
        if (redirectLoopBlocker === 'true') {
          return NextResponse.next();
        }
        
        // Set redirect loop blocker cookie
        const response = NextResponse.redirect(new URL('/auth/signin', request.url));
        response.cookies.set('redirect_loop_blocker', 'true', { 
          maxAge: 5, // 5 seconds
          path: '/' 
        });
        return response;
      }

      // Clear redirect loop blocker if we have a session
      if (session) {
        const response = NextResponse.next();
        response.cookies.delete('redirect_loop_blocker');
        return response;
      }

      return NextResponse.next();
    } catch (sessionError) {
      // If there's any error checking the session, let the request through
      console.error('Error checking session:', sessionError);
      return NextResponse.next();
    }
  } catch (error) {
    // If there's any error in the middleware, let the request through
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

// Configure paths that should be protected
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
