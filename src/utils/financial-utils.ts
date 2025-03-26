import { Income, Bill, Expense, Budget, ForecastItem, BalanceAdjustment } from '@/types/financial';

/**
 * Calculates the next occurrence of a date based on a recurrence pattern
 */
export function calculateNextOccurrence(startDate: string, frequency: string): string {
  const date = new Date(startDate);
  const now = new Date();
  
  // If the date is in the future, return it
  if (date > now) {
    return date.toISOString();
  }

  // Otherwise, calculate the next occurrence
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'semiannually':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      // If no recurrence, return the original date
      return date.toISOString();
  }

  return date.toISOString();
}

/**
 * Generates all future occurrences of a recurring item for the next specified days
 */
export function generateOccurrences<T extends { id: string; frequency: string; amount: number }>(
  item: T, 
  dateField: keyof T, 
  days: number = 90
): Array<ForecastItem> {
  if (!item.frequency || item.frequency === 'once') {
    return [{
      itemId: item.id,
      date: item[dateField] as string,
      amount: item.amount,
      category: (item as any).category || 'unknown',
      name: (item as any).name || 'Unnamed Item',
      type: item.amount >= 0 ? 'income' : 'expense'
    }];
  }

  const occurrences: ForecastItem[] = [];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  let currentDate = new Date(item[dateField] as string);
  
  while (currentDate <= endDate) {
    occurrences.push({
      itemId: item.id,
      date: currentDate.toISOString(),
      amount: item.amount,
      category: (item as any).category || 'unknown',
      name: (item as any).name || 'Unnamed Item',
      type: item.amount >= 0 ? 'income' : 'expense'
    });
    
    currentDate = new Date(calculateNextOccurrence(currentDate.toISOString(), item.frequency));
  }
  
  return occurrences;
}

/**
 * Generates a cash flow forecast for the specified number of days
 * with optimizations to prevent performance issues
 */
export function generateCashFlowForecast(
  currentBalance: number,
  incomes: Income[] = [],
  bills: Bill[] = [],
  balanceAdjustments: BalanceAdjustment[] = [],
  days: number = 90
): ForecastItem[] {
  try {
    // Normalize all inputs to prevent errors
    const normalizedBalance = isNaN(currentBalance) ? 0 : currentBalance;
    const normalizedDays = (!days || isNaN(days) || days <= 0 || days > 365) ? 90 : days;
    
    // Ensure arrays are valid and limit their size to prevent processing too much
    const validIncomes = Array.isArray(incomes) ? incomes.slice(0, 100) : [];
    const validBills = Array.isArray(bills) ? bills.slice(0, 100) : [];
    const validAdjustments = Array.isArray(balanceAdjustments) ? balanceAdjustments.slice(0, 50) : [];
    
    console.log('Generating forecast with:', {
      balance: normalizedBalance,
      incomes: validIncomes.length,
      bills: validBills.length,
      adjustments: validAdjustments.length,
      days: normalizedDays
    });
    
    // Initialize forecast with current balance
    const forecast: ForecastItem[] = [{
      itemId: 'initial-balance',
      date: new Date().toISOString(),
      amount: normalizedBalance,
      category: 'balance',
      name: 'Current Balance',
      type: 'balance',
      runningBalance: normalizedBalance
    }];
    
    // Function to safely add items to forecast
    const safelyAddItems = (
      items: any[], 
      processItem: (item: any) => ForecastItem | ForecastItem[] | null,
      itemType: string
    ) => {
      let processed = 0;
      
      for (const item of items) {
        try {
          const result = processItem(item);
          
          if (Array.isArray(result)) {
            forecast.push(...result);
            processed += result.length;
          } else if (result) {
            forecast.push(result);
            processed++;
          }
          
          // Performance safeguard: don't process too many items
          if (processed > 1000) {
            console.warn(`Processing limit reached for ${itemType}. Some items may be omitted.`);
            break;
          }
        } catch (error) {
          console.error(`Error processing ${itemType} item:`, error);
          // Skip this item and continue with others
        }
      }
    };
    
    // Process incomes - simpler version that avoids complex calculations
    safelyAddItems(validIncomes, (income) => {
      // Only process valid income items
      if (!income.id || !income.date || isNaN(income.amount)) return null;
      
      // For recurring items, we'll just simplify to one occurrence
      // This prevents exponential growth of forecast items
      return {
        itemId: income.id,
        date: income.date,
        amount: income.amount,
        category: income.category || 'Income',
        name: income.name || 'Income',
        type: 'income',
        runningBalance: 0 // Will be calculated later
      };
    }, 'income');
    
    // Process bills - simplified to avoid excessive items
    safelyAddItems(validBills, (bill) => {
      // Skip paid bills
      if (bill.isPaid) return null;
      
      // Only process valid bill items
      if (!bill.id || !bill.dueDate || isNaN(bill.amount)) return null;
      
      return {
        itemId: bill.id,
        date: bill.dueDate,
        amount: -Math.abs(bill.amount), // Ensure bills are negative
        category: bill.category || 'Expense',
        name: bill.name || 'Bill',
        type: 'expense',
        runningBalance: 0 // Will be calculated later
      };
    }, 'bill');
    
    // Process balance adjustments
    safelyAddItems(validAdjustments, (adjustment) => {
      if (!adjustment.id || !adjustment.date || isNaN(adjustment.amount)) return null;
      
      return {
        itemId: adjustment.id,
        date: adjustment.date,
        amount: adjustment.amount,
        category: 'adjustment',
        name: adjustment.reason || 'Balance Adjustment',
        type: 'adjustment',
        runningBalance: 0 // Will be calculated later
      };
    }, 'adjustment');
    
    // Sort by date
    forecast.sort((a, b) => {
      try {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } catch (error) {
        return 0; // Default to equal if error parsing dates
      }
    });
    
    // Limit the number of items for performance
    const maxItems = Math.min(forecast.length, 365); // Reasonable limit
    const trimmedForecast = forecast.slice(0, maxItems);
    
    // Calculate running balance in a single pass
    let runningBalance = normalizedBalance;
    for (let i = 0; i < trimmedForecast.length; i++) {
      const item = trimmedForecast[i];
      
      if (item.type === 'balance') {
        runningBalance = item.amount;
      } else if (!isNaN(item.amount)) {
        runningBalance += item.amount;
      }
      
      item.runningBalance = runningBalance;
    }
    
    console.log(`Generated forecast with ${trimmedForecast.length} items`);
    return trimmedForecast;
    
  } catch (error) {
    console.error('Critical error in generateCashFlowForecast:', error);
    // Return minimal valid forecast with the current balance
    return [{
      itemId: 'initial-balance',
      date: new Date().toISOString(),
      amount: isNaN(currentBalance) ? 0 : currentBalance,
      category: 'balance',
      name: 'Current Balance',
      type: 'balance',
      runningBalance: isNaN(currentBalance) ? 0 : currentBalance
    }];
  }
}

/**
 * Formats a number as currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  if (isNaN(amount)) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Formats a date in a user-friendly format
 */
export function formatDate(dateString: string, format: 'short' | 'long' = 'short'): string {
  const date = new Date(dateString);
  if (format === 'short') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(date);
  }
  
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

/**
 * Calculates budget utilization percentages
 */
export function calculateBudgetUtilization(budget: Budget, expenses: Expense[]): number {
  const relevantExpenses = expenses.filter(expense => 
    expense.category === budget.category &&
    new Date(expense.date) >= new Date(budget.startDate) &&
    new Date(expense.date) <= new Date(budget.endDate)
  );
  
  const totalSpent = relevantExpenses.reduce((total, expense) => total + expense.amount, 0);
  const percentage = (totalSpent / budget.amount) * 100;
  
  return Math.min(percentage, 100); // Cap at 100%
}

/**
 * Calculates goal progress percentage
 */
export function calculateGoalProgress(goal: { currentAmount: number; targetAmount: number }): number {
  if (goal.targetAmount <= 0) {
    return 0;
  }
  
  const percentage = (goal.currentAmount / goal.targetAmount) * 100;
  return Math.min(percentage, 100); // Cap at 100%
}

/**
 * Groups expenses by category and calculates totals
 */
export function groupExpensesByCategory(expenses: Expense[]): { category: string; total: number; count: number }[] {
  const grouped = expenses.reduce((acc, expense) => {
    const category = expense.category;
    if (!acc[category]) {
      acc[category] = { total: 0, count: 0 };
    }
    acc[category].total += expense.amount;
    acc[category].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);
  
  return Object.entries(grouped).map(([category, data]) => ({
    category,
    total: data.total,
    count: data.count
  })).sort((a, b) => b.total - a.total);
}

/**
 * Calculates monthly spending trends
 */
export function calculateMonthlySpending(expenses: Expense[], months: number = 6): { month: string; total: number }[] {
  const now = new Date();
  const result: { month: string; total: number }[] = [];
  
  for (let i = 0; i < months; i++) {
    const targetMonth = new Date(now);
    targetMonth.setMonth(now.getMonth() - i);
    
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
    
    const monthlyExpenses = expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      return expenseDate >= monthStart && expenseDate <= monthEnd;
    });
    
    const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    result.push({
      month: targetMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      total
    });
  }
  
  return result.reverse(); // Most recent last
}

/**
 * Determines if a date is upcoming based on days threshold
 */
export function isUpcoming(dateString: string, daysThreshold: number = 7): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 && diffDays <= daysThreshold;
}

/**
 * Determines if a date is overdue
 */
export function isOverdue(dateString: string): boolean {
  const date = new Date(dateString);
  date.setHours(23, 59, 59, 999); // End of the day
  const now = new Date();
  
  return date < now;
}

/**
 * Gets upcoming bills
 */
export function getUpcomingBills(bills: Bill[], days: number = 7): Bill[] {
  return bills
    .filter(bill => !bill.isPaid && isUpcoming(bill.dueDate, days))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

/**
 * Gets overdue bills
 */
export function getOverdueBills(bills: Bill[]): Bill[] {
  return bills
    .filter(bill => !bill.isPaid && isOverdue(bill.dueDate))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

/**
 * Calculates days until a date
 */
export function daysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(diffDays, 0); // Don't return negative days
}

/**
 * Exports data to a CSV file
 * @param data Array of objects to export
 * @param fileName Name of the file to download
 */
export function exportToCSV(data: any[], fileName: string): void {
  // Get headers from first row
  const headers = Object.keys(data[0] || {});
  
  // Convert data to CSV rows
  const csvRows = [
    // Header row
    headers.join(','),
    // Data rows
    ...data.map(row => 
      headers.map(header => {
        // Handle values with commas by wrapping in quotes
        const value = row[header] === null || row[header] === undefined ? '' : row[header];
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];
  
  // Create blob and download link
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Create temporary link and trigger download
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Parses a CSV string into an array of objects
 * @param csvString The CSV string to parse
 * @returns Array of objects with headers as keys
 */
export function parseCSV(csvString: string): any[] {
  // Split into lines and handle empty input
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return [];
  
  // Parse headers from first line
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, any> = {};
    const values = parseCSVLine(lines[i]);
    
    if (values.length === headers.length) {
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[j] === '' ? null : values[j];
      }
      result.push(obj);
    }
  }
  
  return result;
}

/**
 * Parse a single CSV line, handling quoted values with commas
 * @param line CSV line to parse
 * @returns Array of values from the line
 */
function parseCSVLine(line: string): string[] {
  const result = [];
  let currentValue = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Check if this is an escaped quote
      if (i + 1 < line.length && line[i + 1] === '"') {
        currentValue += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of value
      result.push(currentValue);
      currentValue = '';
    } else {
      // Normal character
      currentValue += char;
    }
  }
  
  // Add the last value
  result.push(currentValue);
  
  return result;
} 