import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Middleware to handle auth redirects
export async function middleware(request: NextRequest) {
  try {
    // Get the pathname of the request
    const path = request.nextUrl.pathname;

    console.log(`[MIDDLEWARE] Processing request for path: ${path}`);

    // Define public paths that don't require authentication
    const isPublicPath = path.startsWith('/auth/') || 
                        path === '/' || 
                        path.startsWith('/api/') ||
                        path.startsWith('/_next/') ||
                        path.includes('favicon.ico');
    
    console.log(`[MIDDLEWARE] Is public path: ${isPublicPath}`);
                        
    // Special cases that should always pass through
    if (path === '/auth/callback' || path.startsWith('/_next/') || path.includes('favicon.ico')) {
      console.log(`[MIDDLEWARE] Special path detected, passing through`);
      return NextResponse.next();
    }

    // Let's check for the debugging cookies
    const justSignedInCookie = request.cookies.get('just_signed_in');
    const redirectLoopBlocker = request.cookies.get('redirect_loop_blocker');
    
    console.log(`[MIDDLEWARE] Cookies: just_signed_in=${justSignedInCookie?.value}, redirect_loop_blocker=${redirectLoopBlocker?.value}`);

    // If we detect a potential redirect loop, just pass through
    if (redirectLoopBlocker?.value === 'true') {
      console.log(`[MIDDLEWARE] Redirect loop detected, passing through request`);
      
      // Create a response that clears the blocker
      const response = NextResponse.next();
      response.cookies.set('redirect_loop_blocker', 'false', { maxAge: 0, path: '/' });
      return response;
    }

    // Check if the just_signed_in cookie is set
    if (justSignedInCookie?.value === 'true') {
      console.log(`[MIDDLEWARE] Just signed in flag detected, bypassing auth check`);
      return NextResponse.next();
    }

    try {
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

      // Check if user is authenticated
      const { data: { session }, error } = await supabase.auth.getSession();

      console.log(`[MIDDLEWARE] Auth check result: ${session ? 'Authenticated' : 'Not authenticated'}`);
      
      if (error) {
        console.error('[MIDDLEWARE] Session check error:', error);
        
        // Set a redirect loop blocker cookie and pass through
        const response = NextResponse.next();
        response.cookies.set('redirect_loop_blocker', 'true', { maxAge: 60, path: '/' });
        return response;
      }

      // Redirect unauthenticated users to signin page
      if (!session && !isPublicPath) {
        console.log(`[MIDDLEWARE] Unauthenticated request to protected path, redirecting to signin`);
        
        // Set redirect loop blocker cookie
        const response = NextResponse.redirect(new URL('/auth/signin', request.url));
        response.cookies.set('redirect_loop_blocker', 'true', { maxAge: 5, path: '/' });
        return response;
      }

      // For authenticated users going to auth pages, redirect to dashboard
      if (session && path.startsWith('/auth/') && path !== '/auth/callback') {
        console.log(`[MIDDLEWARE] Authenticated user accessing auth page, redirecting to dashboard`);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      // Allow the request through otherwise
      console.log(`[MIDDLEWARE] Request passed authentication check, proceeding`);
      return NextResponse.next();
    } catch (sessionError) {
      // If there's any error checking the session, let the request through
      console.error('[MIDDLEWARE] Error checking session:', sessionError);
      return NextResponse.next();
    }
  } catch (error) {
    // If there's any error in the middleware, let the request through
    console.error('[MIDDLEWARE] Middleware error:', error);
    return NextResponse.next();
  }
}

// Configure paths that should be protected
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
