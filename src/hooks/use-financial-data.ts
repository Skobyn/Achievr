import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/providers/firebase-auth-provider';
import {
  Income, Bill, Expense, Budget, Goal, FinancialProfile
} from '@/types/financial';
import * as FinancialService from '@/services/financial-service';
import { toast } from 'sonner';

// Helper to ensure user data is properly initialized
const ensureUserDataInitialized = async (userId: string) => {
  try {
    // Check if profile exists, create if not
    const profile = await FinancialService.getFinancialProfile(userId);
    
    // Can add more initialization checks here if needed
    return true;
  } catch (error) {
    console.error('Error initializing user data:', error);
    return false;
  }
};

export function useFinancialProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [shouldRetry, setShouldRetry] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // First ensure data is initialized
      await ensureUserDataInitialized(user.uid);
      
      console.log(`Fetching financial profile for user ${user.uid}, retry: ${retryCount}`);
      const data = await FinancialService.getFinancialProfile(user.uid);
      
      if (data) {
        console.log("Financial profile data received:", data);
        setProfile(data);
        setError(null);
      } else {
        console.error("No financial profile data returned");
        setError(new Error("No financial profile data returned"));
        
        // Set a flag to retry instead of directly incrementing the counter
        if (retryCount < 3) {
          setShouldRetry(true);
        }
      }
    } catch (err: any) {
      console.error('Error fetching financial profile:', err);
      setError(err);
      toast.error('Failed to load financial profile. Please refresh the page.');
      
      // Set a flag to retry instead of directly incrementing the counter
      if (retryCount < 3) {
        setShouldRetry(true);
      }
    } finally {
      setLoading(false);
    }
  // Remove retryCount from dependency array to prevent infinite loop
  }, [user]);

  // Separate useEffect for handling retries
  useEffect(() => {
    if (shouldRetry) {
      console.log(`Scheduling retry for financial profile fetch (${retryCount + 1}/3)...`);
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setShouldRetry(false);
        fetchProfile();
      }, 2000);
      
      return () => {
        console.log("Clearing retry timer");
        clearTimeout(timer);
      };
    }
  }, [shouldRetry, fetchProfile, retryCount]);

  const updateBalance = useCallback(async (newBalance: number, reason: string) => {
    if (!user) {
      toast.error('You must be logged in to update your balance');
      return;
    }

    try {
      console.log(`Updating balance for user ${user.uid} to ${newBalance}`);
      const updatedProfile = await FinancialService.updateBalance(user.uid, newBalance, reason);
      console.log("Balance updated successfully:", updatedProfile);
      
      // Don't set state if component is unmounted or if the profile hasn't changed
      if (profile && 
          (profile.currentBalance !== updatedProfile.currentBalance || 
           profile.lastUpdated !== updatedProfile.lastUpdated)) {
        setProfile(updatedProfile);
      }
      
      toast.success('Balance updated successfully');
      return updatedProfile;
    } catch (err: any) {
      console.error('Error updating balance:', err);
      toast.error(err.message || 'Failed to update balance');
      throw err;
    }
  }, [user, profile]);

  useEffect(() => {
    let mounted = true;
    
    const initProfile = async () => {
      try {
        if (mounted) await fetchProfile();
      } catch (err) {
        console.error("Error in initial profile fetch:", err);
      }
    };
    
    initProfile();
    
    // Cleanup function
    return () => {
      mounted = false;
      // Reset retry state on unmount to prevent loops on remount
      setShouldRetry(false);
      setRetryCount(0);
    };
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    updateBalance,
    refetch: fetchProfile
  };
}

export function useIncomes() {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchIncomes = useCallback(async () => {
    if (!user) {
      setIncomes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await FinancialService.getIncomes(user.uid);
      setIncomes(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching incomes:', err);
      setError(err);
      toast.error('Failed to load income data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addIncome = useCallback(async (income: Omit<Income, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) {
      toast.error('You must be logged in to add income');
      return;
    }

    try {
      // Ensure all required fields exist in the income object
      const formattedIncome = {
        name: income.name,
        amount: typeof income.amount === 'string' ? parseFloat(income.amount) : income.amount,
        date: income.date || new Date().toISOString(),
        frequency: income.frequency || 'monthly',
        category: income.category || 'Salary',
        isRecurring: income.isRecurring ?? (income.frequency !== 'once'),
        notes: income.notes || '',
      };
      
      console.log('Formatted income object for saving:', formattedIncome);
      const newIncome = await FinancialService.addIncome(formattedIncome, user.uid);
      setIncomes(prev => [newIncome, ...prev]);
      toast.success('Income added successfully');
      return newIncome;
    } catch (err: any) {
      console.error('Error adding income:', err);
      toast.error(err.message || 'Failed to add income');
      throw err;
    }
  }, [user]);

  const updateIncome = useCallback(async (income: Partial<Income> & { id: string }) => {
    if (!user) {
      toast.error('You must be logged in to update income');
      return;
    }

    try {
      await FinancialService.updateIncome(income, user.uid);
      setIncomes(prev => prev.map(item => 
        item.id === income.id ? { ...item, ...income, updatedAt: new Date().toISOString() } : item
      ));
      toast.success('Income updated successfully');
    } catch (err: any) {
      console.error('Error updating income:', err);
      toast.error(err.message || 'Failed to update income');
      throw err;
    }
  }, [user]);

  const deleteIncome = useCallback(async (id: string) => {
    if (!user) {
      toast.error('You must be logged in to delete income');
      return;
    }

    try {
      await FinancialService.deleteIncome(id, user.uid);
      setIncomes(prev => prev.filter(item => item.id !== id));
      toast.success('Income deleted successfully');
    } catch (err: any) {
      console.error('Error deleting income:', err);
      toast.error(err.message || 'Failed to delete income');
      throw err;
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      try {
        await fetchIncomes();
      } catch (err) {
        console.error("Error in initial incomes fetch:", err);
      }
    };
    
    initData();
    
    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [fetchIncomes]);

  return {
    incomes,
    loading,
    error,
    addIncome,
    updateIncome,
    deleteIncome,
    refetch: fetchIncomes
  };
}

export function useBills() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setBillsLoading] = useState(true);
  const [error, setFetchError] = useState<any>(null);
  let mounted = true;

  const fetchBills = useCallback(async () => {
    if (!user) {
      console.log("fetchBills: No user logged in");
      return;
    }
    
    setBillsLoading(true);
    setFetchError(null);
    
    try {
      console.log(`Fetching bills for user: ${user.uid}`);
      const userBills = await FinancialService.getBills(user.uid);
      
      if (mounted) {
        setBills(userBills);
        setBillsLoading(false);
        console.log(`Successfully fetched ${userBills.length} bills`);
      }
    } catch (error) {
      console.error("Error fetching bills:", error);
      if (mounted) {
        setFetchError("Failed to fetch bills. Please try again.");
        setBillsLoading(false);
        setBills([]);
      }
    }
  }, [user]);

  const addBill = useCallback(async (bill: Omit<Bill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) {
      toast.error('You must be logged in to add a bill');
      return;
    }

    try {
      const newBill = await FinancialService.addBill(bill, user.uid);
      setBills(prev => [newBill, ...prev].sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      ));
      toast.success('Bill added successfully');
      return newBill;
    } catch (err: any) {
      console.error('Error adding bill:', err);
      toast.error(err.message || 'Failed to add bill');
      throw err;
    }
  }, [user]);

  const updateBill = useCallback(async (bill: Partial<Bill> & { id: string }) => {
    if (!user) {
      toast.error('You must be logged in to update a bill');
      return;
    }

    try {
      await FinancialService.updateBill(bill, user.uid);
      setBills(prev => prev.map(item => 
        item.id === bill.id ? { ...item, ...bill, updatedAt: new Date().toISOString() } : item
      ).sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      ));
      toast.success('Bill updated successfully');
    } catch (err: any) {
      console.error('Error updating bill:', err);
      toast.error(err.message || 'Failed to update bill');
      throw err;
    }
  }, [user]);

  const deleteBill = useCallback(async (id: string) => {
    if (!user) {
      toast.error('You must be logged in to delete a bill');
      return;
    }

    try {
      await FinancialService.deleteBill(id, user.uid);
      setBills(prev => prev.filter(item => item.id !== id));
      toast.success('Bill deleted successfully');
    } catch (err: any) {
      console.error('Error deleting bill:', err);
      toast.error(err.message || 'Failed to delete bill');
      throw err;
    }
  }, [user]);

  const markBillAsPaid = useCallback(async (id: string, paidDate?: string) => {
    if (!user) {
      toast.error('You must be logged in to mark a bill as paid');
      return;
    }

    try {
      await FinancialService.markBillAsPaid(id, user.uid, paidDate);
      setBills(prev => prev.map(item => 
        item.id === id 
          ? { 
              ...item, 
              isPaid: true, 
              paidDate: paidDate || new Date().toISOString(),
              updatedAt: new Date().toISOString() 
            } 
          : item
      ));
      toast.success('Bill marked as paid');
      // Refresh to get any new recurring bills
      fetchBills();
    } catch (err: any) {
      console.error('Error marking bill as paid:', err);
      toast.error(err.message || 'Failed to mark bill as paid');
      throw err;
    }
  }, [user, fetchBills]);

  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      try {
        await fetchBills();
      } catch (err) {
        console.error("Error in initial bills fetch:", err);
      }
    };
    
    initData();
    
    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [fetchBills]);

  return {
    bills,
    loading,
    error,
    addBill,
    updateBill,
    deleteBill,
    markBillAsPaid,
    refetch: fetchBills
  };
}

export function useExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setExpensesLoading] = useState(true);
  const [error, setFetchError] = useState<any>(null);
  let mounted = true;

  const fetchExpenses = useCallback(async () => {
    if (!user) {
      console.log("fetchExpenses: No user logged in");
      return;
    }
    
    setExpensesLoading(true);
    setFetchError(null);
    
    try {
      console.log(`Fetching expenses for user: ${user.uid}`);
      const userExpenses = await FinancialService.getExpenses(user.uid);
      
      if (mounted) {
        setExpenses(userExpenses);
        setExpensesLoading(false);
        console.log(`Successfully fetched ${userExpenses.length} expenses`);
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
      if (mounted) {
        setFetchError("Failed to fetch expenses. Please try again.");
        setExpensesLoading(false);
        setExpenses([]);
      }
    }
  }, [user]);

  const addExpense = useCallback(async (expense: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) {
      toast.error('You must be logged in to add an expense');
      return;
    }

    try {
      const newExpense = await FinancialService.addExpense(expense, user.uid);
      setExpenses(prev => [newExpense, ...prev]);
      toast.success('Expense added successfully');
      return newExpense;
    } catch (err: any) {
      console.error('Error adding expense:', err);
      toast.error(err.message || 'Failed to add expense');
      throw err;
    }
  }, [user]);

  const updateExpense = useCallback(async (expense: Partial<Expense> & { id: string }) => {
    if (!user) {
      toast.error('You must be logged in to update an expense');
      return;
    }

    try {
      await FinancialService.updateExpense(expense, user.uid);
      setExpenses(prev => prev.map(item => 
        item.id === expense.id ? { ...item, ...expense, updatedAt: new Date().toISOString() } : item
      ));
      toast.success('Expense updated successfully');
    } catch (err: any) {
      console.error('Error updating expense:', err);
      toast.error(err.message || 'Failed to update expense');
      throw err;
    }
  }, [user]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!user) {
      toast.error('You must be logged in to delete an expense');
      return;
    }

    try {
      await FinancialService.deleteExpense(id, user.uid);
      setExpenses(prev => prev.filter(item => item.id !== id));
      toast.success('Expense deleted successfully');
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      toast.error(err.message || 'Failed to delete expense');
      throw err;
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      try {
        await fetchExpenses();
      } catch (err) {
        console.error("Error in initial expenses fetch:", err);
      }
    };
    
    initData();
    
    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [fetchExpenses]);

  return {
    expenses,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    refetch: fetchExpenses
  };
}

export function useBudgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setBudgetsLoading] = useState(true);
  const [error, setFetchError] = useState<any>(null);
  let mounted = true;

  const fetchBudgets = useCallback(async () => {
    if (!user) {
      console.log("fetchBudgets: No user logged in");
      return;
    }
    
    setBudgetsLoading(true);
    setFetchError(null);
    
    try {
      console.log(`Fetching budgets for user: ${user.uid}`);
      const userBudgets = await FinancialService.getBudgets(user.uid);
      
      if (mounted) {
        setBudgets(userBudgets);
        setBudgetsLoading(false);
        console.log(`Successfully fetched ${userBudgets.length} budgets`);
      }
    } catch (error) {
      console.error("Error fetching budgets:", error);
      if (mounted) {
        setFetchError("Failed to fetch budgets. Please try again.");
        setBudgetsLoading(false);
        setBudgets([]);
      }
    }
  }, [user]);

  const addBudget = useCallback(async (budget: any) => {
    if (!user) {
      toast.error('You must be logged in to add a budget');
      return;
    }

    try {
      const newBudget = await FinancialService.addBudget(budget, user.uid);
      setBudgets(prev => [newBudget, ...prev]);
      toast.success('Budget added successfully');
      return newBudget;
    } catch (err: any) {
      console.error('Error adding budget:', err);
      toast.error(err.message || 'Failed to add budget');
      throw err;
    }
  }, [user]);

  const updateBudget = useCallback(async (budget: any) => {
    if (!user) {
      toast.error('You must be logged in to update a budget');
      return;
    }

    try {
      await FinancialService.updateBudget(budget, user.uid);
      setBudgets(prev => prev.map(item => 
        item.id === budget.id ? { ...item, ...budget, updatedAt: new Date().toISOString() } : item
      ));
      toast.success('Budget updated successfully');
    } catch (err: any) {
      console.error('Error updating budget:', err);
      toast.error(err.message || 'Failed to update budget');
      throw err;
    }
  }, [user]);

  const deleteBudget = useCallback(async (id: string) => {
    if (!user) {
      toast.error('You must be logged in to delete a budget');
      return;
    }

    try {
      await FinancialService.deleteBudget(id, user.uid);
      setBudgets(prev => prev.filter(item => item.id !== id));
      toast.success('Budget deleted successfully');
    } catch (err: any) {
      console.error('Error deleting budget:', err);
      toast.error(err.message || 'Failed to delete budget');
      throw err;
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      try {
        await fetchBudgets();
      } catch (err) {
        console.error("Error in initial budgets fetch:", err);
      }
    };
    
    initData();
    
    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [fetchBudgets]);

  return {
    budgets,
    loading,
    error,
    addBudget,
    updateBudget,
    deleteBudget,
    refetch: fetchBudgets
  };
}

export function useGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setGoalsLoading] = useState(true);
  const [error, setFetchError] = useState<any>(null);
  let mounted = true;

  const fetchGoals = useCallback(async () => {
    if (!user) {
      console.log("fetchGoals: No user logged in");
      return;
    }
    
    setGoalsLoading(true);
    setFetchError(null);
    
    try {
      console.log(`Fetching goals for user: ${user.uid}`);
      const userGoals = await FinancialService.getGoals(user.uid);
      
      if (mounted) {
        setGoals(userGoals);
        setGoalsLoading(false);
        console.log(`Successfully fetched ${userGoals.length} goals`);
      }
    } catch (error) {
      console.error("Error fetching goals:", error);
      if (mounted) {
        setFetchError("Failed to fetch goals. Please try again.");
        setGoalsLoading(false);
        setGoals([]);
      }
    }
  }, [user]);

  const addGoal = useCallback(async (goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) {
      toast.error('You must be logged in to add a goal');
      return;
    }

    try {
      const newGoal = await FinancialService.addGoal(goal, user.uid);
      setGoals(prev => [newGoal, ...prev].sort((a, b) => 
        new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
      ));
      toast.success('Goal added successfully');
      return newGoal;
    } catch (err: any) {
      console.error('Error adding goal:', err);
      toast.error(err.message || 'Failed to add goal');
      throw err;
    }
  }, [user]);

  const updateGoal = useCallback(async (goal: Partial<Goal> & { id: string }) => {
    if (!user) {
      toast.error('You must be logged in to update a goal');
      return;
    }

    try {
      await FinancialService.updateGoal(goal, user.uid);
      setGoals(prev => prev.map(item => 
        item.id === goal.id ? { ...item, ...goal, updatedAt: new Date().toISOString() } : item
      ).sort((a, b) => 
        new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
      ));
      toast.success('Goal updated successfully');
    } catch (err: any) {
      console.error('Error updating goal:', err);
      toast.error(err.message || 'Failed to update goal');
      throw err;
    }
  }, [user]);

  const deleteGoal = useCallback(async (id: string) => {
    if (!user) {
      toast.error('You must be logged in to delete a goal');
      return;
    }

    try {
      await FinancialService.deleteGoal(id, user.uid);
      setGoals(prev => prev.filter(item => item.id !== id));
      toast.success('Goal deleted successfully');
    } catch (err: any) {
      console.error('Error deleting goal:', err);
      toast.error(err.message || 'Failed to delete goal');
      throw err;
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      try {
        await fetchGoals();
      } catch (err) {
        console.error("Error in initial goals fetch:", err);
      }
    };
    
    initData();
    
    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [fetchGoals]);

  return {
    goals,
    loading,
    error,
    addGoal,
    updateGoal,
    deleteGoal,
    refetch: fetchGoals
  };
}

// Helper hook to fetch all financial data at once
export function useFinancialData() {
  const profile = useFinancialProfile();
  const incomes = useIncomes();
  const bills = useBills();
  const expenses = useExpenses();
  const budgets = useBudgets();
  const goals = useGoals();
  
  // Use useMemo to memoize the loading state to prevent unnecessary rerenders
  const loading = useMemo(() => 
    profile.loading || 
    incomes.loading || 
    bills.loading || 
    expenses.loading || 
    budgets.loading ||
    goals.loading,
  [
    profile.loading, 
    incomes.loading, 
    bills.loading, 
    expenses.loading, 
    budgets.loading,
    goals.loading
  ]);
  
  const refetchAll = useCallback(() => {
    // Don't refetch if already loading to prevent chain reactions
    if (loading) {
      console.log("Skipping refetchAll because already loading");
      return;
    }
    
    console.log("Refetching all financial data");
    
    // Use a more controlled approach with individual try/catch blocks
    const safeRefetch = async (name: string, refetchFn: Function) => {
      try {
        await refetchFn();
      } catch (err) {
        console.error(`Error refetching ${name}:`, err);
      }
    };
    
    // Execute refetches with a slight delay between each
    setTimeout(() => safeRefetch('profile', profile.refetch), 0);
    setTimeout(() => safeRefetch('incomes', incomes.refetch), 100);
    setTimeout(() => safeRefetch('bills', bills.refetch), 200);
    setTimeout(() => safeRefetch('expenses', expenses.refetch), 300);
    setTimeout(() => safeRefetch('budgets', budgets.refetch), 400);
    setTimeout(() => safeRefetch('goals', goals.refetch), 500);
    
  }, [
    loading,
    profile.refetch, 
    incomes.refetch, 
    bills.refetch, 
    expenses.refetch, 
    budgets.refetch, 
    goals.refetch
  ]);
  
  // Use useMemo to memoize the return object to prevent unnecessary rerenders
  return useMemo(() => ({
    profile: {
      profile: profile.profile || null,
      loading: profile.loading,
      error: profile.error,
      refetch: profile.refetch,
      updateBalance: profile.updateBalance
    },
    incomes: {
      incomes: incomes.incomes || [],
      loading: incomes.loading,
      error: incomes.error,
      refetch: incomes.refetch,
      addIncome: incomes.addIncome,
      updateIncome: incomes.updateIncome,
      deleteIncome: incomes.deleteIncome
    },
    bills: {
      bills: bills.bills || [],
      loading: bills.loading,
      error: bills.error,
      refetch: bills.refetch
    },
    expenses: {
      expenses: expenses.expenses || [],
      loading: expenses.loading,
      error: expenses.error,
      refetch: expenses.refetch,
      addExpense: expenses.addExpense
    },
    budgets: {
      budgets: budgets.budgets || [],
      loading: budgets.loading,
      error: budgets.error,
      refetch: budgets.refetch
    },
    goals: {
      goals: goals.goals || [],
      loading: goals.loading,
      error: goals.error,
      refetch: goals.refetch
    },
    loading,
    refetchAll,
    updateFinancialBalance: profile.updateBalance,
    addIncome: incomes.addIncome,
    addExpense: expenses.addExpense
  }), [
    profile,
    incomes,
    bills,
    expenses,
    budgets,
    goals,
    loading,
    refetchAll
  ]);
} 