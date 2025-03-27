"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { TrendingUp } from "lucide-react";

import { useAuth } from "@/providers/supabase-auth-provider";

// Form validation schema
const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, signInWithGoogle, user } = useAuth();

  // Redirect if already signed in
  useEffect(() => {
    console.log("Sign-in page auth check - User:", user ? "logged in" : "not logged in");
    
    if (user) {
      console.log("User already authenticated, redirecting to dashboard");
      router.push("/dashboard");
    }
    
    // Clear any potential redirect loop blockers
    sessionStorage.removeItem("redirect_loop_blocker");
  }, [user, router]);

  // Create form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true,
    },
    mode: "onChange",
  });

  // Handle form submission
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      await signIn(data.email, data.password);
      
      // Set remember me cookie if selected
      if (data.rememberMe) {
        document.cookie = "remember-me=true; max-age=2592000; path=/"; // 30 days
      }
      
      // Set flag for redirection
      console.log("Setting just_signed_in flag for redirection");
      sessionStorage.setItem("just_signed_in", "true");
      
      // The redirection will be handled by the auth provider
    } catch (error: any) {
      console.error("Sign in error:", error);
      toast.error(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      // The redirection will be handled by the auth provider
    } catch (error) {
      console.error("Google sign-in error:", error);
      // Error already handled by the auth provider with toast
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner message="Signing in..." size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-muted/40">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center space-y-2 mb-6">
          <div className="p-2 bg-indigo-600 text-white rounded-full">
            <TrendingUp className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Achievr</h1>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Sign in</CardTitle>
            <CardDescription className="text-center">
              Enter your email and password to sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" type="email" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="••••••••" type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">Remember me</FormLabel>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full">
                  Sign In
                </Button>
              </form>
            </Form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              type="button" 
              className="w-full" 
              onClick={handleGoogleSignIn}
            >
              <svg
                className="mr-2 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                ></path>
              </svg>
              Sign In with Google
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <div className="text-sm text-center">
              Don&apos;t have an account?{" "}
              <Link href="/auth/signup" className="underline text-primary">
                Sign up
              </Link>
            </div>
            <div className="text-sm text-center">
              <Link href="/auth/reset-password" className="underline text-primary">
                Forgot your password?
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
