import { supabase } from '@/lib/supabase-client';
import { User } from '@/providers/supabase-auth-provider';
import {
  Income,
  Bill,
  Expense,
  Budget,
  Goal,
  BalanceAdjustment,
  FinancialProfile
} from '@/types/financial';
import { v4 as uuidv4 } from 'uuid';

// Helper for creating ISO date strings
const toISOString = (date: Date | string) => {
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date.toISOString();
};

// Get a user's financial profile
export const getFinancialProfile = async (userId: string): Promise<FinancialProfile | null> => {
  try {
    console.log("Getting financial profile for user:", userId);
    
    // Check if user has a financial profile
    const { data: financialProfile, error } = await supabase
      .from('financial_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        console.log("Financial profile not found, creating default");
        
        // Create a default profile
        const defaultProfile: Omit<FinancialProfile, 'id'> = {
          userId,
          currentBalance: 0,
          lastUpdated: new Date().toISOString(),
          currency: 'USD',
          hasCompletedSetup: false
        };
        
        const { data: newProfile, error: insertError } = await supabase
          .from('financial_profiles')
          .insert({
            user_id: userId,
            current_balance: 0,
            last_updated: new Date().toISOString(),
            currency: 'USD',
            has_completed_setup: false
          })
          .select('*')
          .single();
        
        if (insertError) throw insertError;
        
        // Map the database columns to our client-side model
        return {
          id: newProfile.id,
          userId: newProfile.user_id,
          currentBalance: newProfile.current_balance,
          lastUpdated: newProfile.last_updated,
          currency: newProfile.currency,
          hasCompletedSetup: newProfile.has_completed_setup
        };
      }
      throw error;
    }
    
    // Map the database columns to our client-side model
    return {
      id: financialProfile.id,
      userId: financialProfile.user_id,
      currentBalance: financialProfile.current_balance,
      lastUpdated: financialProfile.last_updated,
      currency: financialProfile.currency,
      hasCompletedSetup: financialProfile.has_completed_setup
    };
  } catch (error) {
    console.error('Error getting financial profile:', error);
    
    // Return a default profile rather than throwing
    return {
      id: uuidv4(),
      userId,
      currentBalance: 0,
      lastUpdated: new Date().toISOString(),
      currency: 'USD',
      hasCompletedSetup: false
    };
  }
};

// Update a user's current balance
export const updateBalance = async (
  userId: string, 
  newBalance: number, 
  reason: string
): Promise<FinancialProfile> => {
  try {
    // Get the current profile
    const { data: profile, error: profileError } = await supabase
      .from('financial_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    let previousBalance = 0;
    let profileId: string;
    
    if (profileError) {
      // Create a default profile if it doesn't exist
      const { data: newProfile, error: insertError } = await supabase
        .from('financial_profiles')
        .insert({
          user_id: userId,
          current_balance: newBalance,
          last_updated: new Date().toISOString(),
          currency: 'USD',
          has_completed_setup: true
        })
        .select('id')
        .single();
      
      if (insertError) throw insertError;
      profileId = newProfile.id;
    } else {
      previousBalance = profile.current_balance;
      profileId = profile.id;
      
      // Update the profile
      const { error: updateError } = await supabase
        .from('financial_profiles')
        .update({
          current_balance: newBalance,
          last_updated: new Date().toISOString(),
          has_completed_setup: true
        })
        .eq('id', profileId);
      
      if (updateError) throw updateError;
    }
    
    // Create a balance adjustment record
    const now = new Date().toISOString();
    const { error: adjustmentError } = await supabase
      .from('balance_adjustments')
      .insert({
        user_id: userId,
        name: 'Balance Adjustment',
        amount: newBalance - previousBalance,
        previous_balance: previousBalance,
        new_balance: newBalance,
        reason,
        date: now,
        created_at: now,
        updated_at: now
      });
    
    if (adjustmentError) throw adjustmentError;
    
    // Return the updated profile
    return {
      id: profileId,
      userId,
      currentBalance: newBalance,
      lastUpdated: now,
      currency: 'USD',
      hasCompletedSetup: true
    };
  } catch (error) {
    console.error('Error updating balance:', error);
    throw error;
  }
};

// INCOME OPERATIONS
export const addIncome = async (income: Omit<Income, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string): Promise<Income> => {
  try {
    console.log(`Adding income for user ${userId}:`, income);
    const now = new Date().toISOString();
    
    // Insert into database with snake_case column names
    const { data, error } = await supabase
      .from('incomes')
      .insert({
        user_id: userId,
        name: income.name,
        amount: income.amount,
        date: income.date,
        frequency: income.frequency,
        next_date: income.nextDate,
        category: income.category,
        notes: income.notes,
        is_recurring: income.isRecurring,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`Income added successfully with ID: ${data.id}`);
    
    return {
      id: data.id,
      userId,
      ...income,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error adding income:', error);
    throw error;
  }
};

export const updateIncome = async (income: Partial<Income> & { id: string }, userId: string): Promise<void> => {
  try {
    const { id, ...data } = income;
    
    // Convert camelCase to snake_case for database columns
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.date) updateData.date = data.date;
    if (data.frequency) updateData.frequency = data.frequency;
    if (data.nextDate) updateData.next_date = data.nextDate;
    if (data.category) updateData.category = data.category;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isRecurring !== undefined) updateData.is_recurring = data.isRecurring;
    
    // Always update the updated_at field
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('incomes')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating income:', error);
    throw error;
  }
};

export const deleteIncome = async (id: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting income:', error);
    throw error;
  }
};

export const getIncomes = async (userId: string): Promise<Income[]> => {
  try {
    console.log(`Getting incomes for user ${userId}`);
    
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    // Map the database columns (snake_case) to our client-side model (camelCase)
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      amount: item.amount,
      date: item.date,
      frequency: item.frequency,
      nextDate: item.next_date,
      category: item.category,
      notes: item.notes,
      isRecurring: item.is_recurring,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting incomes:', error);
    
    // Return empty array rather than throwing
    return [];
  }
};

// BILL OPERATIONS
export const addBill = async (bill: Omit<Bill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string): Promise<Bill> => {
  try {
    console.log(`Adding bill for user ${userId}:`, bill);
    const now = new Date().toISOString();
    
    // Insert into database with snake_case column names
    const { data, error } = await supabase
      .from('bills')
      .insert({
        user_id: userId,
        name: bill.name,
        amount: bill.amount,
        due_date: bill.dueDate,
        is_paid: bill.isPaid,
        paid_date: bill.paidDate,
        frequency: bill.frequency,
        next_due_date: bill.nextDueDate,
        end_date: bill.endDate,
        category: bill.category,
        notes: bill.notes,
        is_recurring: bill.isRecurring,
        auto_pay: bill.autoPay,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`Bill added successfully with ID: ${data.id}`);
    
    return {
      id: data.id,
      userId,
      ...bill,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error adding bill:', error);
    throw error;
  }
};

export const updateBill = async (bill: Partial<Bill> & { id: string }, userId: string): Promise<void> => {
  try {
    const { id, ...data } = bill;
    
    // Convert camelCase to snake_case for database columns
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.dueDate) updateData.due_date = data.dueDate;
    if (data.isPaid !== undefined) updateData.is_paid = data.isPaid;
    if (data.paidDate) updateData.paid_date = data.paidDate;
    if (data.frequency) updateData.frequency = data.frequency;
    if (data.nextDueDate) updateData.next_due_date = data.nextDueDate;
    if (data.endDate) updateData.end_date = data.endDate;
    if (data.category) updateData.category = data.category;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isRecurring !== undefined) updateData.is_recurring = data.isRecurring;
    if (data.autoPay !== undefined) updateData.auto_pay = data.autoPay;
    
    // Always update the updated_at field
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('bills')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating bill:', error);
    throw error;
  }
};

export const deleteBill = async (id: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting bill:', error);
    throw error;
  }
};

export const getBills = async (userId: string): Promise<Bill[]> => {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });
    
    if (error) throw error;
    
    // Map the database columns (snake_case) to our client-side model (camelCase)
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      amount: item.amount,
      dueDate: item.due_date,
      isPaid: item.is_paid,
      paidDate: item.paid_date,
      frequency: item.frequency,
      nextDueDate: item.next_due_date,
      endDate: item.end_date,
      category: item.category,
      notes: item.notes,
      isRecurring: item.is_recurring,
      autoPay: item.auto_pay,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting bills:', error);
    
    // Return empty array rather than throwing
    return [];
  }
};

// EXPENSE OPERATIONS
export const addExpense = async (expense: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string): Promise<Expense> => {
  try {
    console.log(`Adding expense for user ${userId}:`, expense);
    const now = new Date().toISOString();
    
    // Insert into database with snake_case column names
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        name: expense.name,
        amount: expense.amount,
        date: expense.date,
        category: expense.category,
        notes: expense.notes,
        is_planned: expense.isPlanned,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`Expense added successfully with ID: ${data.id}`);
    
    return {
      id: data.id,
      userId,
      ...expense,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
};

export const updateExpense = async (expense: Partial<Expense> & { id: string }, userId: string): Promise<void> => {
  try {
    const { id, ...data } = expense;
    
    // Convert camelCase to snake_case for database columns
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.date) updateData.date = data.date;
    if (data.category) updateData.category = data.category;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isPlanned !== undefined) updateData.is_planned = data.isPlanned;
    
    // Always update the updated_at field
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating expense:', error);
    throw error;
  }
};

export const deleteExpense = async (id: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw error;
  }
};

export const getExpenses = async (userId: string): Promise<Expense[]> => {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    // Map the database columns (snake_case) to our client-side model (camelCase)
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      amount: item.amount,
      date: item.date,
      category: item.category,
      notes: item.notes,
      isPlanned: item.is_planned,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting expenses:', error);
    
    // Return empty array rather than throwing
    return [];
  }
};

// BUDGET OPERATIONS
export const addBudget = async (budget: Omit<Budget, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string): Promise<Budget> => {
  try {
    console.log(`Adding budget for user ${userId}:`, budget);
    const now = new Date().toISOString();
    
    // Insert into database with snake_case column names
    const { data, error } = await supabase
      .from('budgets')
      .insert({
        user_id: userId,
        name: budget.name,
        amount: budget.amount,
        start_date: budget.startDate,
        end_date: budget.endDate,
        period: budget.period,
        category: budget.category,
        current_spent: budget.currentSpent,
        notes: budget.notes,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`Budget added successfully with ID: ${data.id}`);
    
    return {
      id: data.id,
      userId,
      ...budget,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error adding budget:', error);
    throw error;
  }
};

export const updateBudget = async (budget: Partial<Budget> & { id: string }, userId: string): Promise<void> => {
  try {
    const { id, ...data } = budget;
    
    // Convert camelCase to snake_case for database columns
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.startDate) updateData.start_date = data.startDate;
    if (data.endDate) updateData.end_date = data.endDate;
    if (data.period) updateData.period = data.period;
    if (data.category) updateData.category = data.category;
    if (data.currentSpent !== undefined) updateData.current_spent = data.currentSpent;
    if (data.notes !== undefined) updateData.notes = data.notes;
    
    // Always update the updated_at field
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('budgets')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating budget:', error);
    throw error;
  }
};

export const deleteBudget = async (id: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting budget:', error);
    throw error;
  }
};

export const getBudgets = async (userId: string): Promise<Budget[]> => {
  try {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });
    
    if (error) throw error;
    
    // Map the database columns (snake_case) to our client-side model (camelCase)
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      amount: item.amount,
      startDate: item.start_date,
      endDate: item.end_date,
      period: item.period,
      category: item.category,
      currentSpent: item.current_spent,
      notes: item.notes,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting budgets:', error);
    
    // Return empty array rather than throwing
    return [];
  }
};

// GOAL OPERATIONS
export const addGoal = async (goal: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string): Promise<Goal> => {
  try {
    console.log(`Adding goal for user ${userId}:`, goal);
    const now = new Date().toISOString();
    
    // Insert into database with snake_case column names
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        name: goal.name,
        amount: goal.amount,
        target_date: goal.targetDate,
        current_amount: goal.currentAmount,
        category: goal.category,
        notes: goal.notes,
        is_completed: goal.isCompleted,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    console.log(`Goal added successfully with ID: ${data.id}`);
    
    return {
      id: data.id,
      userId,
      ...goal,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error adding goal:', error);
    throw error;
  }
};

export const updateGoal = async (goal: Partial<Goal> & { id: string }, userId: string): Promise<void> => {
  try {
    const { id, ...data } = goal;
    
    // Convert camelCase to snake_case for database columns
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.targetDate) updateData.target_date = data.targetDate;
    if (data.currentAmount !== undefined) updateData.current_amount = data.currentAmount;
    if (data.category) updateData.category = data.category;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isCompleted !== undefined) updateData.is_completed = data.isCompleted;
    
    // Always update the updated_at field
    updateData.updated_at = new Date().toISOString();
    
    const { error } = await supabase
      .from('goals')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating goal:', error);
    throw error;
  }
};

export const deleteGoal = async (id: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting goal:', error);
    throw error;
  }
};

export const getGoals = async (userId: string): Promise<Goal[]> => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('target_date', { ascending: true });
    
    if (error) throw error;
    
    // Map the database columns (snake_case) to our client-side model (camelCase)
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      amount: item.amount,
      targetDate: item.target_date,
      currentAmount: item.current_amount,
      category: item.category,
      notes: item.notes,
      isCompleted: item.is_completed,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting goals:', error);
    
    // Return empty array rather than throwing
    return [];
  }
};

// FORECASTING OPERATIONS
export const getForecastMetrics = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('forecast_metrics')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw error;
    
    return data.map(item => ({
      id: item.id,
      metricName: item.metric_name,
      description: item.description,
      createdAt: item.created_at
    }));
  } catch (error) {
    console.error('Error getting forecast metrics:', error);
    return [];
  }
};

export const getForecastingData = async (userId: string): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('forecasting_data')
      .select('*, forecast_metrics(metric_name, description)')
      .eq('user_id', userId)
      .order('forecast_date', { ascending: true });
    
    if (error) throw error;
    
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      forecastDate: item.forecast_date,
      metricValue: item.metric_value,
      metricId: item.metric_id,
      metricName: item.forecast_metrics?.metric_name,
      description: item.forecast_metrics?.description,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (error) {
    console.error('Error getting forecasting data:', error);
    return [];
  }
};

export const createForecastingData = async (userId: string, forecastData: any): Promise<any> => {
  try {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('forecasting_data')
      .insert({
        user_id: userId,
        forecast_date: forecastData.forecastDate,
        metric_value: forecastData.metricValue,
        metric_id: forecastData.metricId,
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      userId,
      forecastDate: forecastData.forecastDate,
      metricValue: forecastData.metricValue,
      metricId: forecastData.metricId,
      createdAt: now,
      updatedAt: now
    };
  } catch (error) {
    console.error('Error creating forecasting data:', error);
    throw error;
  }
};

// Cashflow forecast calculation is done client-side using getIncomes, getBills, getExpenses
// but we can provide a helper here to get the data for a specific date range
export const getCashFlowData = async (userId: string, startDate: string, endDate: string): Promise<any> => {
  try {
    // Get incomes, bills, and expenses for the date range
    const [incomes, bills, expenses] = await Promise.all([
      // Get incomes
      supabase
        .from('incomes')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data.map(item => ({
            id: item.id,
            userId: item.user_id,
            name: item.name,
            amount: item.amount,
            date: item.date,
            category: item.category,
            isRecurring: item.is_recurring,
            type: 'income'
          }));
        }),
      
      // Get bills
      supabase
        .from('bills')
        .select('*')
        .eq('user_id', userId)
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data.map(item => ({
            id: item.id,
            userId: item.user_id,
            name: item.name,
            amount: item.amount,
            date: item.due_date,
            category: item.category,
            isPaid: item.is_paid,
            isRecurring: item.is_recurring,
            type: 'bill'
          }));
        }),
      
      // Get expenses
      supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data.map(item => ({
            id: item.id,
            userId: item.user_id,
            name: item.name,
            amount: item.amount,
            date: item.date,
            category: item.category,
            isPlanned: item.is_planned,
            type: 'expense'
          }));
        })
    ]);
    
    // Get current balance
    const { data: profile, error: profileError } = await supabase
      .from('financial_profiles')
      .select('current_balance')
      .eq('user_id', userId)
      .single();
    
    if (profileError) throw profileError;
    
    return {
      incomes,
      bills,
      expenses,
      currentBalance: profile.current_balance
    };
  } catch (error) {
    console.error('Error getting cash flow data:', error);
    throw error;
  }
}; 