"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import { MainLayout } from "@/components/layout/main-layout";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { IncomeList } from "@/components/dashboard/income-list";
import { BillsList } from "@/components/dashboard/bills-list";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SetupGuide } from "@/components/onboarding/setup-guide";
import { useFinancialProfile, useIncomes, useBills, useExpenses } from "@/hooks/use-financial-data";
import { FinancialProfile, Bill, Expense, Income } from "@/types/financial";
import { ArrowRight, X } from "lucide-react";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { toast } from "sonner";
import { initializeCollections } from '@/utils/database-debug';
import { DebugPanel } from "@/components/dashboard/debug-panel";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function formatCashFlowEvents(bills: Bill[], expenses: Expense[], incomes: Income[]) {
  const events = [
    ...bills.map(bill => ({
      type: 'bill' as const,
      amount: bill.amount,
      date: new Date(bill.dueDate),
      description: bill.name,
      category: bill.category,
      recurring: bill.isRecurring || false
    })),
    ...expenses.map(expense => ({
      type: 'expense' as const,
      amount: expense.amount,
      date: new Date(expense.date),
      description: expense.name,
      category: expense.category,
      recurring: false // Expenses don't have recurring property
    })),
    ...incomes.map(inc => ({
      type: 'income' as const,
      amount: inc.amount,
      date: new Date(inc.date),
      description: inc.name,
      category: inc.category || 'Income',
      recurring: inc.isRecurring || false
    }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  return events.map(event => {
    if (event.type === 'income') {
      balance += event.amount;
    } else {
      balance -= event.amount;
    }
    return {
      ...event,
      balance
    };
  });
}

// Utility function to get user from localStorage
const getLocalUser = () => {
  if (typeof window === 'undefined') return null;
  
  try {
    const localUserStr = localStorage.getItem('supabase.auth.user');
    if (localUserStr) {
      return JSON.parse(localUserStr);
    }
  } catch (e) {
    console.error('Error parsing local user:', e);
  }
  return null;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, updateBalance } = useFinancialProfile();
  const { incomes, loading: incomesLoading, error: incomesError, updateIncome, deleteIncome } = useIncomes();
  const { bills, loading: billsLoading } = useBills();
  const { expenses, loading: expensesLoading } = useExpenses();
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();

  // Initialize localUser state
  const [localUser, setLocalUser] = useState<any>(null);

  // Add this useEffect to load the local user
  useEffect(() => {
    const local = getLocalUser();
    if (local) {
      console.log('Found user in localStorage:', local);
      setLocalUser(local);
    }
  }, []);

  // Early check for debug localStorage user without waiting for auth
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const localStorageUser = localStorage.getItem('supabase.auth.user');
        if (localStorageUser) {
          const userObj = JSON.parse(localStorageUser);
          console.log("DEBUG: Found direct user in localStorage:", userObj.displayName);
          setLocalUser(userObj);
          setAuthChecked(true);
          setTimeout(() => {
            initializeUserCollections(userObj.uid);
          }, 100);
        }
      } catch (e) {
        console.error("Error checking localStorage for user:", e);
      }
    }
  }, []);

  const cashFlowEvents = useMemo(() => {
    return formatCashFlowEvents(bills || [], expenses || [], incomes);
  }, [bills, expenses, incomes]);

  // Modify the auth check to use localUser as a fallback
  useEffect(() => {
    console.log("Dashboard auth check - Loading:", loading, "User:", user ? "logged in" : "not logged in", "LocalUser:", localUser ? "present" : "not present");
    
    // If auth is still loading, wait
    if (loading) return;
    
    // If we have an authenticated user, proceed
    if (user) {
      console.log("User authenticated:", user.displayName);
      setAuthChecked(true);
      initializeUserCollections(user.uid);
      return;
    }
    
    // If no authenticated user but we have a localStorage user, use that
    if (!user && localUser) {
      console.log("Using localStorage user:", localUser.displayName);
      setAuthChecked(true);
      initializeUserCollections(localUser.uid);
      return;
    }
    
    // No user at all, redirect to signin
    console.log("No user found, redirecting to sign in");
    const hasAttemptedAuth = sessionStorage.getItem("auth_attempted");
    
    if (hasAttemptedAuth === "true") {
      console.log("Auth already attempted, showing error instead of redirecting");
      toast.error("Authentication issue detected. Please try signing in again.");
      sessionStorage.removeItem("auth_attempted");
    } else {
      sessionStorage.setItem("auth_attempted", "true");
      router.push("/auth/signin");
    }
  }, [user, loading, localUser, router]);

  // Check if it's a new user to show setup guide
  useEffect(() => {
    if (user && profile && !profileLoading) {
      // Show setup guide for new users or if they haven't completed setup
      const isFirstVisit = !localStorage.getItem("has_visited_dashboard");
      const hasCompletedSetup = profile.hasCompletedSetup;
      
      if (isFirstVisit || !hasCompletedSetup) {
        setShowSetupGuide(true);
        localStorage.setItem("has_visited_dashboard", "true");
      }
    }
  }, [user, profile, profileLoading]);

  // Function to initialize necessary collections
  const initializeUserCollections = async (userId: string) => {
    if (!db) return;
    
    console.log("Ensuring collections are initialized for user:", userId);
    
    try {
      // Create financial profile if it doesn't exist yet
      const profileRef = doc(db, 'financialProfiles', userId);
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        // Create default financial profile
        const defaultProfile: FinancialProfile = {
          userId,
          currentBalance: 0,
          lastUpdated: new Date().toISOString(),
          currency: 'USD',
          hasCompletedSetup: false
        };
        
        await setDoc(profileRef, defaultProfile);
        console.log("Created default financial profile");
      } else {
        console.log("Financial profile already exists for user:", userId);
      }
      
      // Create empty collections if they don't exist
      const collectionsToCreate = [
        { name: 'incomes', path: `users/${userId}/incomes` },
        { name: 'bills', path: `users/${userId}/bills` },
        { name: 'expenses', path: `users/${userId}/expenses` },
        { name: 'budgets', path: `users/${userId}/budgets` },
        { name: 'goals', path: `users/${userId}/goals` },
        { name: 'balanceAdjustments', path: `users/${userId}/balanceAdjustments` }
      ];
      
      // Create a placeholder document in each collection
      for (const collectionInfo of collectionsToCreate) {
        try {
          const collectionRef = collection(db, collectionInfo.path);
          const docsSnapshot = await getDocs(collectionRef);
          
          // If collection is empty (except for potential _metadata), create placeholder
          if (docsSnapshot.docs.length === 0 || (docsSnapshot.docs.length === 1 && docsSnapshot.docs[0].id === '_metadata')) {
            const placeholderRef = doc(db, collectionInfo.path, '_metadata');
            await setDoc(placeholderRef, { 
              created: new Date().toISOString(),
              note: 'This document ensures the collection exists'
            }, { merge: true });
            console.log(`Initialized collection: ${collectionInfo.name}`);
          } else {
            console.log(`Collection ${collectionInfo.name} already has data`);
          }
        } catch (err) {
          console.error(`Error initializing collection ${collectionInfo.name}:`, err);
        }
      }
    } catch (error) {
      console.error("Error initializing collections:", error);
    }
  };

  // Function to handle balance update
  const handleUpdateBalance = async (amount: number) => {
    try {
      await updateBalance(amount, "Initial setup");
      toast.success(`Balance updated to $${amount.toFixed(2)}`);
      // Mark that setup has begun but don't close the guide
      // Allow the user to continue with the next steps
    } catch (error) {
      console.error("Error updating balance:", error);
      toast.error("Failed to update balance");
    }
  };

  // Handle closing setup guide with transition
  const handleCloseSetupGuide = () => {
    // Set transitioning to prevent component thrashing
    setIsTransitioning(true);
    
    // Close the setup guide immediately
    setShowSetupGuide(false);
    
    // Add a delayed state reset to ensure components have time to unmount properly
    setTimeout(() => {
      // Clear any loading states
      const clearLoadingState = () => {
        setIsTransitioning(false);
      };
      
      // Put this on a timer to prevent immediate execution
      setTimeout(clearLoadingState, 1000);
    }, 500);
  };

  // Add this function to set up test data for development
  const initializeTestData = () => {
    if (process.env.NODE_ENV !== 'production' && localUser?.id === 'test-user-id') {
      console.log('DEBUG: Setting up test data for development');
      
      // Create test data in local state
      setProfile({
        id: 'test-user-id',
        first_name: 'Test',
        last_name: 'User',
        display_name: 'Test User',
        email: 'test@example.com',
        has_completed_setup: true,
        created_at: new Date().toISOString()
      });
      
      setHouseholds([{
        id: 'test-household-id',
        name: 'Test Household',
        created_by: 'test-user-id',
        created_at: new Date().toISOString()
      }]);
      
      // Set some test incomes
      setIncomes([
        {
          id: 'income-1',
          name: 'Salary',
          amount: 5000,
          frequency: 'monthly',
          category: 'salary',
          next_date: new Date().toISOString(),
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        },
        {
          id: 'income-2',
          name: 'Side Gig',
          amount: 1000,
          frequency: 'monthly',
          category: 'freelance',
          next_date: new Date().toISOString(),
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        }
      ]);
      
      // Set some test bills
      setBills([
        {
          id: 'bill-1',
          name: 'Rent',
          amount: 1500,
          due_date: new Date().toISOString(),
          frequency: 'monthly',
          category: 'housing',
          is_paid: false,
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        },
        {
          id: 'bill-2',
          name: 'Utilities',
          amount: 200,
          due_date: new Date().toISOString(),
          frequency: 'monthly',
          category: 'utilities',
          is_paid: false,
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        }
      ]);
      
      // Set some test expenses
      setExpenses([
        {
          id: 'expense-1',
          name: 'Groceries',
          amount: 500,
          date: new Date().toISOString(),
          category: 'food',
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        },
        {
          id: 'expense-2',
          name: 'Entertainment',
          amount: 150,
          date: new Date().toISOString(),
          category: 'entertainment',
          user_id: 'test-user-id',
          created_at: new Date().toISOString()
        }
      ]);
      
      setProfileLoading(false);
      setHouseholdsLoading(false);
      setIncomesLoading(false);
      setBillsLoading(false);
      setExpensesLoading(false);
      
      console.log('DEBUG: Test data initialization complete');
    }
  };

  // Call this after setting the local user
  useEffect(() => {
    if (localUser?.id === 'test-user-id') {
      console.log('DEBUG: Detected test user, initializing test data');
      initializeTestData();
    }
  }, [localUser]);

  // If the component is transitioning, show a loading state
  if (isTransitioning) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <LoadingSpinner size="lg" message="Preparing dashboard..." />
        </div>
      </MainLayout>
    );
  }

  // Show loading state while checking authentication or loading profile
  if (loading || (!authChecked && !user && !localUser)) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <LoadingSpinner size="lg" message="Verifying authentication..." />
        </div>
      </MainLayout>
    );
  }

  // Show loading state while loading financial data
  if (profileLoading || incomesLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <LoadingSpinner size="lg" message="Loading your financial data..." />
        </div>
      </MainLayout>
    );
  }

  // This should never render due to the redirect in useEffect
  if (!user && !localUser) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Session expired</h2>
            <p className="mb-4">Your session has expired or you are not logged in.</p>
            <Button onClick={() => router.push("/auth/signin")}>
              Go to Sign In
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Financial Dashboard</h1>
          
          <div className="flex items-center gap-2">
            {!showSetupGuide && (
              <Button 
                variant="outline" 
                onClick={() => setShowSetupGuide(true)}
              >
                Open Setup Guide
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {process.env.NODE_ENV !== 'production' && user && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const debugSection = document.getElementById('debug-section');
                  if (debugSection) {
                    debugSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                Debug Tools
              </Button>
            )}
          </div>
        </div>
        
        {showSetupGuide ? (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Welcome to Achievr!</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseSetupGuide}
              >
                <X className="h-4 w-4 mr-2" />
                Close Setup Guide
              </Button>
            </div>
            <SetupGuide
              onClose={handleCloseSetupGuide}
              onSetBalance={handleUpdateBalance}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <BalanceCard onUpdateBalance={handleUpdateBalance} />
              <CashFlowChart days={14} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <IncomeList 
                incomes={incomes} 
                onEdit={updateIncome} 
                onDelete={deleteIncome}
                loading={incomesLoading}
                error={incomesError}
              />
              <BillsList />
            </div>
            
            {process.env.NODE_ENV !== 'production' && user && (
              <div id="debug-section">
                <DebugPanel userId={user.uid} />
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
