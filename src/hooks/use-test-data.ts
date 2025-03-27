'use client';

/**
 * This hook provides test data for development,
 * allowing the app to function without a real database connection.
 */

import { useState, useEffect } from 'react';

export function useTestData() {
  const [isTestUser, setIsTestUser] = useState(false);
  
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      try {
        const userStr = localStorage.getItem('supabase.auth.user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.id === 'test-user-id') {
            console.log('DEBUG: Test user detected in useTestData');
            setIsTestUser(true);
          }
        }
      } catch (e) {
        console.error('Error checking for test user in useTestData:', e);
      }
    }
  }, []);
  
  const getTestProfile = () => {
    if (!isTestUser) return null;
    
    return {
      id: 'test-user-id',
      first_name: 'Test',
      last_name: 'User',
      display_name: 'Test User',
      email: 'test@example.com',
      has_completed_setup: true,
      created_at: new Date().toISOString()
    };
  };
  
  const getTestHouseholds = () => {
    if (!isTestUser) return [];
    
    return [{
      id: 'test-household-id',
      name: 'Test Household',
      created_by: 'test-user-id',
      created_at: new Date().toISOString()
    }];
  };
  
  const getTestIncomes = () => {
    if (!isTestUser) return [];
    
    return [
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
    ];
  };
  
  const getTestBills = () => {
    if (!isTestUser) return [];
    
    return [
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
    ];
  };
  
  const getTestExpenses = () => {
    if (!isTestUser) return [];
    
    return [
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
    ];
  };
  
  return {
    isTestUser,
    getTestProfile,
    getTestHouseholds,
    getTestIncomes,
    getTestBills,
    getTestExpenses
  };
} 