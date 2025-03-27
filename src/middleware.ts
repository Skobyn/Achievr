import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware to handle auth redirects
export async function middleware(request: NextRequest) {
  try {
    // Get the pathname of the request
    const path = request.nextUrl.pathname;

    console.log(`[MIDDLEWARE] Processing request for path: ${path}`);

    // For now, bypass all auth checks - let all requests through
    // This allows us to troubleshoot the authentication issues
    console.log(`[MIDDLEWARE] TEMPORARY: Bypassing all authentication checks`);
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
