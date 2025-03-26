/**
 * Financial data models for the application
 */

// Base interface with common fields
export interface BaseItem {
  id: string;
  userId: string;
  name: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

// Income entry
export interface Income extends BaseItem {
  date: string; // ISO date string
  frequency: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
  nextDate?: string; // Only for recurring income
  category: string;
  notes?: string;
  isRecurring: boolean;
}

// Bill/payment
export interface Bill extends BaseItem {
  dueDate: string; // ISO date string
  isPaid: boolean;
  paidDate?: string;
  frequency: 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
  nextDueDate?: string; // Only for recurring bills
  endDate?: string; // Optional end date for recurring bills
  category: string;
  notes?: string;
  isRecurring: boolean;
  autoPay: boolean;
}

// Expense entry
export interface Expense extends BaseItem {
  date: string; // ISO date string
  category: string;
  notes?: string;
  isPlanned: boolean; // Whether this was a planned expense
}

// Budget category
export interface Budget extends BaseItem {
  startDate: string;
  endDate: string;
  period: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  category: string;
  currentSpent: number;
  notes?: string;
}

// Savings goal
export interface Goal extends BaseItem {
  targetDate: string; // ISO date string
  currentAmount: number;
  category: string;
  notes?: string;
  isCompleted: boolean;
}

// Balance adjustment
export interface BalanceAdjustment extends BaseItem {
  date: string;
  previousBalance: number;
  newBalance: number;
  reason: string;
}

// Cash flow forecast item
export interface ForecastItem {
  id?: string;
  itemId?: string;
  date: string;
  balance?: number;
  amount: number;
  category: string;
  name: string;
  type: 'income' | 'bill' | 'expense' | 'balance' | 'adjustment' | 'marker';
  runningBalance?: number;
  description?: string;
  transactions?: {
    id: string;
    type: 'income' | 'bill' | 'expense';
    amount: number;
    name: string;
  }[];
}

// Category types
export const EXPENSE_CATEGORIES = [
  'Housing',
  'Transportation',
  'Food',
  'Utilities',
  'Insurance',
  'Healthcare',
  'Debt Payments',
  'Personal',
  'Entertainment',
  'Education',
  'Clothing',
  'Gifts/Donations',
  'Travel',
  'Miscellaneous'
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Business',
  'Freelance',
  'Investments',
  'Rental',
  'Gifts',
  'Other'
];

export const BILL_CATEGORIES = [
  'Housing',
  'Utilities',
  'Insurance',
  'Subscriptions',
  'Debt',
  'Services',
  'Taxes',
  'Other'
];

export const GOAL_CATEGORIES = [
  'Emergency Fund',
  'Retirement',
  'Home Purchase',
  'Vehicle Purchase',
  'Vacation',
  'Education',
  'Other'
];

// User financial profile with account balances
export interface FinancialProfile {
  userId: string;
  currentBalance: number;
  lastUpdated: string;
  currency: string;
  hasCompletedSetup: boolean;
} 