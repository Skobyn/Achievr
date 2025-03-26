import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Middleware to handle auth redirects
export async function middleware(request: NextRequest) {
  // Get the pathname of the request
  const path = request.nextUrl.pathname;

  // Define public paths that don't require authentication
  const isPublicPath = path.startsWith('/auth/') || 
                       path === '/' || 
                       path.startsWith('/api/') ||
                       path.startsWith('/_next/') ||
                       path.includes('favicon.ico');
                       
  // Special case for auth callback page
  if (path === '/auth/callback') {
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
          // We'll only use it to retrieve session data
        },
        remove: (name, options) => {
          // Same as above, not actually removing cookies
        },
      },
    }
  );

  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();

  // Redirect unauthenticated users to signin page
  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (session && path.startsWith('/auth/') && path !== '/auth/callback') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

// Configure paths that should be protected
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
