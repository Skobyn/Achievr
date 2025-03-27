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
    if (path === '/auth/callback' || 
        path.startsWith('/_next/') || 
        path.includes('favicon.ico') ||
        path === '/dashboard') {  // IMPORTANT: Let dashboard requests through
      console.log(`[MIDDLEWARE] Special path detected, passing through`);
      return NextResponse.next();
    }

    // Check cookies
    const justSignedInCookie = request.cookies.get('just_signed_in');
    const redirectLoopBlocker = request.cookies.get('redirect_loop_blocker');
    
    console.log(`[MIDDLEWARE] Cookies: just_signed_in=${justSignedInCookie?.value}, redirect_loop_blocker=${redirectLoopBlocker?.value}`);

    // If redirect loop detected or just signed in, pass through
    if (redirectLoopBlocker?.value === 'true' || justSignedInCookie?.value === 'true') {
      console.log(`[MIDDLEWARE] Auth bypass flag detected, passing through request`);
      return NextResponse.next();
    }

    // Only redirect if we're 100% sure this is a protected path that needs auth
    if (!isPublicPath && path !== '/dashboard') {
      // Create a Supabase client for the middleware
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name) => request.cookies.get(name)?.value,
            set: () => {},
            remove: () => {},
          },
        }
      );

      try {
        // Check if user is authenticated
        const { data: { session }, error } = await supabase.auth.getSession();

        console.log(`[MIDDLEWARE] Auth check result: ${session ? 'Authenticated' : 'Not authenticated'}`);
        
        if (error) {
          console.error('[MIDDLEWARE] Session check error:', error);
          return NextResponse.next(); // Let it through on error
        }

        // Redirect unauthenticated users to signin page, but only if we're confident
        if (!session) {
          console.log(`[MIDDLEWARE] Unauthenticated request to protected path, redirecting to signin`);
          return NextResponse.redirect(new URL('/auth/signin', request.url));
        }
      } catch (sessionError) {
        console.error('[MIDDLEWARE] Error checking session:', sessionError);
        return NextResponse.next(); // Let it through on error
      }
    }

    // Default: let the request through
    console.log(`[MIDDLEWARE] Request allowed through`);
    return NextResponse.next();
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
