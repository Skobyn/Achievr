import { Income, Bill, Expense, Budget, ForecastItem, BalanceAdjustment } from '@/types/financial';

/**
 * Calculates the next occurrence of a date based on a recurrence pattern
 */
export function calculateNextOccurrence(startDate: string, frequency: string): string {
  try {
    const date = new Date(startDate);
    const now = new Date();
    
    // If the date is in the future, return it
    if (date > now) {
      return date.toISOString();
    }

    // Normalize frequency to ensure consistent handling
    let normalizedFrequency = frequency.toLowerCase().trim();
    
    // Handle variant spellings of biweekly
    if (normalizedFrequency === 'bi-weekly' || normalizedFrequency === 'bi weekly') {
      normalizedFrequency = 'biweekly';
    }
    
    // Log for debugging frequency issues
    console.log(`Calculating next occurrence after ${date.toLocaleDateString()} with frequency '${normalizedFrequency}'`);

    // Calculate the next occurrence based on frequency
    let nextDate = new Date(date);
    
    // Prevention: If date is invalid, reset to today
    if (isNaN(nextDate.getTime())) {
      console.warn(`Invalid date detected in calculateNextOccurrence: ${startDate}, using today instead`);
      return new Date().toISOString();
    }
    
    // Memory optimization: limit recursion for very old dates
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    // If date is very old, fast forward to reduce recursion
    if (nextDate < twoYearsAgo) {
      // Log that we're fast-forwarding
      console.log(`Date ${date.toLocaleDateString()} is > 2 years old, fast-forwarding to near current date`);
      
      switch (normalizedFrequency) {
        case 'daily':
          nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() - 1);
          break;
        case 'weekly':
          nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() - 7);
          break;
        case 'biweekly':
          nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() - 14);
          break;
        case 'monthly':
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() - 1);
          break;
        case 'quarterly':
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() - 3);
          break;
        case 'semiannually':
          nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() - 6);
          break;
        case 'annually':
          nextDate = new Date(now);
          nextDate.setFullYear(nextDate.getFullYear() - 1);
          break;
        default:
          console.warn(`Unknown frequency '${normalizedFrequency}', defaulting to today`);
          return now.toISOString();
      }
    }
    
    // Apply the frequency increment
    const originalDate = new Date(nextDate);
    switch (normalizedFrequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'biweekly': // Ensure this is exactly 14 days
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'semiannually':
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case 'annually':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        // If no recognized recurrence, return the original date
        console.warn(`Unrecognized frequency: '${normalizedFrequency}', returning original date`);
        return date.toISOString();
    }

    // If the calculated date is still in the past, recursively calculate the next one
    // using iterative approach to prevent stack overflow
    if (nextDate <= now) {
      // Log that we're fast-forwarding
      console.log(`Calculated date ${nextDate.toLocaleDateString()} is still in the past, fast-forwarding`);
      
      // Fast forward algorithm to reduce recursion depth
      let iterations = 0;
      const maxIterations = 100; // Safety limit
      
      while (nextDate <= now && iterations < maxIterations) {
        iterations++;
        
        const previousDate = new Date(nextDate);
        
        switch (normalizedFrequency) {
          case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
          case 'semiannually':
            nextDate.setMonth(nextDate.getMonth() + 6);
            break;
          case 'annually':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        }
        
        // Debug every few iterations
        if (iterations <= 2 || iterations % 10 === 0 || iterations >= maxIterations - 1) {
          console.log(`Fast-forward iteration ${iterations}: ${previousDate.toLocaleDateString()} -> ${nextDate.toLocaleDateString()}`);
        }
      }
      
      // If we hit the iteration limit, log a warning
      if (iterations >= maxIterations) {
        console.warn(`Hit maximum iterations (${maxIterations}) when calculating next occurrence for frequency '${normalizedFrequency}'`);
      }
      
      // If we still couldn't get a future date, just return tomorrow
      if (nextDate <= now) {
        console.warn(`Failed to find future date after ${maxIterations} iterations, defaulting to tomorrow`);
        nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }
    
    // Log the result
    const dayDiff = Math.round((nextDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`Next occurrence calculated: ${originalDate.toLocaleDateString()} -> ${nextDate.toLocaleDateString()} (${dayDiff} days, frequency: '${normalizedFrequency}')`);
    
    return nextDate.toISOString();
  } catch (error) {
    console.error("Error in calculateNextOccurrence:", error);
    // Return tomorrow as a fallback
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }
}

/**
 * Generates all future occurrences of a recurring item for the next specified days
 * Optimized to prevent memory issues
 */
export function generateOccurrences<T extends { id: string; frequency: string; amount: number; endDate?: string }>(
  item: T, 
  dateField: keyof T, 
  days: number = 90
): Array<ForecastItem> {
  try {
    // For non-recurring items, just return the single occurrence
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

    // Log for debugging frequency issues
    console.log(`Generating occurrences for item ${item.id} with frequency '${item.frequency}' and ${(item as any).name || 'unnamed'}`);
    
    // Ensure frequency is correctly normalized
    // This helps ensure case consistency and handling for 'bi-weekly' vs 'biweekly' variations
    let normalizedFrequency = item.frequency.toLowerCase().trim();
    if (normalizedFrequency === 'bi-weekly' || normalizedFrequency === 'bi weekly') {
      normalizedFrequency = 'biweekly';
    }
    
    const occurrences: ForecastItem[] = [];
    
    // More reasonable limit for occurrences based on forecast length
    // Longer forecast periods should allow more occurrences
    const MAX_OCCURRENCES = Math.min(days, 365);
    
    // Set end date to now + days for the forecast period
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    // Start from the original date or today if it's in the past
    let currentDate = new Date(item[dateField] as string);
    if (currentDate < startDate) {
      // If the original date is in the past, calculate the next occurrence from today
      currentDate = new Date(calculateNextOccurrence(startDate.toISOString(), normalizedFrequency));
      console.log(`Item ${(item as any).name || item.id} starting from calculated next date: ${currentDate.toLocaleDateString()}`);
    }
    
    // Generate occurrences until we reach the end date
    let count = 0;
    let lastDate: Date | null = null;
    
    while (currentDate <= endDate && count < MAX_OCCURRENCES) {
      // Add occurrence to the list
      occurrences.push({
        itemId: item.id,
        date: currentDate.toISOString(),
        amount: item.amount,
        category: (item as any).category || 'unknown',
        name: (item as any).name || 'Unnamed Item',
        type: item.amount >= 0 ? 'income' : 'expense',
        // Add frequency to description for clarity in forecast displays
        description: `${(item as any).name || 'Item'} (${normalizedFrequency})`
      });
      
      // Log gap between occurrences if we have more than one
      if (lastDate) {
        const daysBetween = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if ((normalizedFrequency === 'biweekly' && daysBetween !== 14) || 
            (normalizedFrequency === 'weekly' && daysBetween !== 7)) {
          console.warn(`Warning: '${normalizedFrequency}' item ${(item as any).name || item.id} has ${daysBetween} days between occurrences, expected ${normalizedFrequency === 'biweekly' ? 14 : 7}`);
        }
      }
      
      lastDate = new Date(currentDate);
      
      // Calculate the next occurrence based on the frequency - use normalized frequency
      const nextDate = new Date(calculateNextOccurrence(currentDate.toISOString(), normalizedFrequency));
      
      // Prevent infinite loop in case calculateNextOccurrence returns same date
      if (nextDate.getTime() === currentDate.getTime()) {
        console.warn(`Preventing infinite loop in generateOccurrences: next date equals current date for item ${item.id}`);
        nextDate.setDate(nextDate.getDate() + (normalizedFrequency === 'biweekly' ? 14 : 
                                              normalizedFrequency === 'weekly' ? 7 : 1));
      }
      
      // Log the interval
      const dayInterval = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (count < 2 || count % 5 === 0) { // Only log a subset to avoid console spam
        console.log(`Occurrence ${count+1} for ${(item as any).name || item.id}: ${currentDate.toLocaleDateString()} -> ${nextDate.toLocaleDateString()} (${dayInterval} days)`);
      }
      
      currentDate = nextDate;
      count++;
    }
    
    // Log summary
    console.log(`Generated ${occurrences.length} occurrences for ${(item as any).name || item.id} with frequency '${normalizedFrequency}'`);
    if (occurrences.length > 1) {
      const firstDate = new Date(occurrences[0].date);
      const lastOccurrence = new Date(occurrences[occurrences.length - 1].date);
      const totalDays = Math.round((lastOccurrence.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      const avgInterval = totalDays / (occurrences.length - 1);
      console.log(`Average interval: ${avgInterval.toFixed(1)} days for '${normalizedFrequency}' frequency`);
    }
    
    // If we didn't generate any occurrences but should have, add at least one
    if (occurrences.length === 0 && startDate <= endDate) {
      console.warn(`No occurrences generated for item ${item.id}, adding one at forecast start`);
      occurrences.push({
        itemId: item.id,
        date: startDate.toISOString(),
        amount: item.amount,
        category: (item as any).category || 'unknown',
        name: (item as any).name || 'Unnamed Item',
        type: item.amount >= 0 ? 'income' : 'expense',
        description: `${(item as any).name || 'Item'} (${normalizedFrequency})`
      });
    }
    
    return occurrences;
  } catch (error) {
    console.error("Error in generateOccurrences:", error);
    return [];
  }
}

/**
 * Generates a cash flow forecast for the specified number of days
 * with optimizations to prevent performance issues
 */
export function generateCashFlowForecast(
  currentBalance: number,
  incomes: Income[] = [],
  bills: Bill[] = [],
  expenses: Expense[] = [],
  balanceAdjustments: BalanceAdjustment[] = [],
  days: number = 90
): ForecastItem[] {
  try {
    // Performance guard: cap maximum days to prevent browser crashes
    const MAX_FORECAST_DAYS = 365;
    
    // Normalize all inputs to prevent errors
    const normalizedBalance = isNaN(currentBalance) ? 0 : currentBalance;
    const normalizedDays = (!days || isNaN(days) || days <= 0) ? 90 : Math.min(days, MAX_FORECAST_DAYS);
    
    // Ensure arrays are valid and limit their size to prevent processing too much
    // More balanced limits to ensure we have enough data for accurate forecasting
    const MAX_ITEMS = Math.min(normalizedDays * 2, 200); // Scale with forecast length, up to 200
    
    const validIncomes = Array.isArray(incomes) ? incomes.slice(0, MAX_ITEMS) : [];
    const validBills = Array.isArray(bills) ? bills.slice(0, MAX_ITEMS) : [];
    const validExpenses = Array.isArray(expenses) ? expenses.slice(0, MAX_ITEMS) : [];
    const validAdjustments = Array.isArray(balanceAdjustments) ? balanceAdjustments.slice(0, 50) : [];
    
    console.log('Generating forecast with:', {
      balance: normalizedBalance,
      incomes: validIncomes.length,
      bills: validBills.length,
      expenses: validExpenses.length,
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
      runningBalance: normalizedBalance,
      description: 'Starting balance'
    }];
    
    // Memory guard: cap total forecast items but ensure we have enough data points
    // Scale with forecast period - longer periods need more points
    const MAX_FORECAST_ITEMS = Math.min(normalizedDays * 10, 2000); // Scale with period length
    
    // Add some future data points to ensure the forecast extends properly
    // This ensures we have at least some data points spread across the forecast period
    if (normalizedDays > 1) {
      // Add data points at regular intervals to ensure forecast visually extends to the end date
      const forecastEndDate = new Date();
      forecastEndDate.setDate(forecastEndDate.getDate() + normalizedDays);
      
      // Add mid-point and end-point markers (even if they're empty)
      // This ensures the chart extends visually to the forecast end date
      if (normalizedDays > 30) {
        const midPoint = new Date();
        midPoint.setDate(midPoint.getDate() + Math.floor(normalizedDays / 2));
        
        forecast.push({
          itemId: 'mid-point-marker',
          date: midPoint.toISOString(),
          amount: 0,
          category: 'marker',
          name: 'Forecast Mid-point',
          type: 'marker',
          runningBalance: normalizedBalance, // Will be recalculated
          description: 'Forecast mid-point marker'
        });
      }
      
      forecast.push({
        itemId: 'end-point-marker',
        date: forecastEndDate.toISOString(),
        amount: 0,
        category: 'marker',
        name: 'Forecast End',
        type: 'marker',
        runningBalance: normalizedBalance, // Will be recalculated
        description: 'Forecast end date marker'
      });
    }
    
    // Function to safely add items to forecast
    const safelyAddItems = (
      items: any[], 
      processItem: (item: any) => ForecastItem | ForecastItem[] | null,
      itemType: string
    ) => {
      let processed = 0;
      
      // Performance optimization: stop adding more items if we're over the limit
      if (forecast.length >= MAX_FORECAST_ITEMS) {
        console.warn(`Maximum forecast items (${MAX_FORECAST_ITEMS}) reached. Skipping remaining ${itemType} items.`);
        return;
      }
      
      for (const item of items) {
        try {
          const result = processItem(item);
          
          if (Array.isArray(result)) {
            // Only add as many items as we can fit under the limit
            const canAdd = Math.min(result.length, MAX_FORECAST_ITEMS - forecast.length);
            if (canAdd > 0) {
              forecast.push(...result.slice(0, canAdd));
              processed += canAdd;
            }
          } else if (result && forecast.length < MAX_FORECAST_ITEMS) {
            forecast.push(result);
            processed++;
          }
          
          // Stop if we've reached the limit
          if (forecast.length >= MAX_FORECAST_ITEMS) {
            console.warn(`Maximum forecast items (${MAX_FORECAST_ITEMS}) reached during ${itemType} processing.`);
            break;
          }
          
          // Performance safeguard: don't process too many items
          if (processed > MAX_FORECAST_ITEMS / 2) {
            console.warn(`Processing limit reached for ${itemType}. Some items may be omitted.`);
            break;
          }
        } catch (error) {
          console.error(`Error processing ${itemType} item:`, error);
          // Skip this item and continue with others
        }
      }
    };
    
    // For very short forecast periods (≤ 14 days), use a simpler approach to prevent memory issues
    const isShortForecast = normalizedDays <= 14;
    
    // Process incomes with proper recurring handling based on forecast length
    safelyAddItems(validIncomes, (income) => {
      // Skip invalid income items to prevent errors
      if (!income || !income.id || !income.date || isNaN(income.amount)) return null;
      
      // Performance optimization: skip $0 incomes
      if (income.amount === 0) return null;
      
      try {
        // Log the income being processed for debugging
        console.log(`Processing income: ${income.name}, Amount: ${income.amount}, Frequency: ${income.frequency}, Recurring: ${income.isRecurring}`);
        
        // Normalize the frequency
        let normalizedFrequency = income.frequency?.toLowerCase().trim() || 'once';
        if (normalizedFrequency === 'bi-weekly' || normalizedFrequency === 'bi weekly') {
          normalizedFrequency = 'biweekly';
          console.log(`Normalized income frequency from ${income.frequency} to 'biweekly'`);
        }
        
        const currentDate = new Date();
        const forecastEndDate = new Date();
        forecastEndDate.setDate(forecastEndDate.getDate() + normalizedDays);
        const incomeDate = new Date(income.date);
        
        // For recurring items in short forecasts, only generate if they occur in the period
        if (income.isRecurring && normalizedFrequency && normalizedFrequency !== 'once' && !isShortForecast) {
          // Only generate occurrences starting from now or the most recent occurrence if in the past
          const startDate = new Date(Math.max(currentDate.getTime(), incomeDate.getTime()));
          
          // Create a copy with normalized frequency
          const normalizedIncome = {
            ...income,
            id: income.id,
            frequency: normalizedFrequency,
            amount: income.amount,
            date: startDate.toISOString() // Use current date as starting point for future occurrences
          };
          
          console.log(`Generating recurring income occurrences for ${income.name} with frequency '${normalizedFrequency}' starting from ${startDate.toLocaleDateString()}`);
          
          return generateOccurrences(
            normalizedIncome,
            'date',
            normalizedDays
          );
        } else if (income.isRecurring && normalizedFrequency && normalizedFrequency !== 'once' && isShortForecast) {
          // For short forecasts, only include if the next occurrence is within the forecast period
          // If income date is in the past, calculate next occurrence from current date
          const baseDate = incomeDate < currentDate ? currentDate : incomeDate;
          const nextDate = new Date(calculateNextOccurrence(baseDate.toISOString(), normalizedFrequency));
          
          if (nextDate <= forecastEndDate) {
            console.log(`Adding single occurrence for short forecast income ${income.name} on ${nextDate.toLocaleDateString()}`);
            
            return {
              itemId: income.id,
              date: nextDate.toISOString(),
              amount: income.amount,
              category: income.category || 'Income',
              name: income.name || 'Income',
              type: 'income',
              runningBalance: 0, // Will be calculated later
              description: `${income.name} (${income.category}) - Next occurrence (${normalizedFrequency})`
            };
          }
          return null;
        }
        
        // For non-recurring items, just add the single occurrence if within forecast period
        // Only include future-dated items and very recent past items (last 7 days)
        if (
          (incomeDate >= currentDate && incomeDate <= forecastEndDate) || 
          (incomeDate < currentDate && 
           Math.abs(currentDate.getTime() - incomeDate.getTime()) < (7 * 24 * 60 * 60 * 1000))
        ) {
          console.log(`Adding non-recurring income ${income.name} on ${incomeDate.toLocaleDateString()}`);
          
          return {
            itemId: income.id,
            date: income.date,
            amount: income.amount,
            category: income.category || 'Income',
            name: income.name || 'Income',
            type: 'income',
            runningBalance: 0, // Will be calculated later
            description: `${income.name} (${income.category}) - One-time`
          };
        }
        
        // Log skipped incomes for debugging
        if (incomeDate < currentDate) {
          console.log(`Skipping past income ${income.name} from ${incomeDate.toLocaleDateString()} (too old)`);
        }
        
      } catch (error) {
        console.error(`Error processing income item ${income.name || income.id}:`, error);
      }
      return null;
    }, 'income');
    
    // Process bills with proper recurring handling based on forecast length
    safelyAddItems(validBills, (bill) => {
      // Skip paid bills
      if (bill.isPaid) return null;
      
      // Only process valid bill items
      if (!bill.id || !bill.dueDate || isNaN(bill.amount)) return null;
      
      try {
        // Log the bill being processed for debugging
        console.log(`Processing bill: ${bill.name}, Amount: ${bill.amount}, Frequency: ${bill.frequency}, Recurring: ${bill.isRecurring}`);
        
        // Normalize the frequency
        let normalizedFrequency = bill.frequency?.toLowerCase().trim() || 'once';
        if (normalizedFrequency === 'bi-weekly' || normalizedFrequency === 'bi weekly') {
          normalizedFrequency = 'biweekly';
          console.log(`Normalized bill frequency from ${bill.frequency} to 'biweekly'`);
        }
        
        const currentDate = new Date();
        const forecastEndDate = new Date();
        forecastEndDate.setDate(forecastEndDate.getDate() + normalizedDays);
        const dueDate = new Date(bill.dueDate);
        
        // For recurring bills in short forecasts, only generate if they occur in the period
        if (bill.isRecurring && normalizedFrequency && normalizedFrequency !== 'once' && !isShortForecast) {
          // Only generate occurrences starting from now or the most recent due date if in the past
          const startDate = new Date(Math.max(currentDate.getTime(), dueDate.getTime()));
          
          // Create a copy with normalized frequency
          const normalizedBill = {
            ...bill,
            id: bill.id,
            frequency: normalizedFrequency,
            amount: -Math.abs(bill.amount),
            date: startDate.toISOString() // Use current/adjusted date as starting point for future occurrences
          };
          
          console.log(`Generating recurring bill occurrences for ${bill.name} with frequency '${normalizedFrequency}' starting from ${startDate.toLocaleDateString()}`);
          
          return generateOccurrences(
            normalizedBill,
            'date',
            normalizedDays
          ).map(item => ({
            ...item,
            type: 'bill',
            description: `${bill.name} (${bill.category}) - Due${bill.autoPay ? ' - AutoPay' : ''} (${normalizedFrequency})`
          }));
        } else if (bill.isRecurring && normalizedFrequency && normalizedFrequency !== 'once' && isShortForecast) {
          // For short forecasts, only include if the next occurrence is within the forecast period
          // If bill due date is in the past, calculate next occurrence from current date
          const baseDate = dueDate < currentDate ? currentDate : dueDate;
          const nextDate = new Date(calculateNextOccurrence(baseDate.toISOString(), normalizedFrequency));
          
          if (nextDate <= forecastEndDate) {
            console.log(`Adding single occurrence for short forecast bill ${bill.name} on ${nextDate.toLocaleDateString()}`);
            
            return {
              itemId: bill.id,
              date: nextDate.toISOString(),
              amount: -Math.abs(bill.amount),
              category: bill.category || 'Expense',
              name: bill.name || 'Bill',
              type: 'bill',
              runningBalance: 0, // Will be calculated later
              description: `${bill.name} (${bill.category}) - Due${bill.autoPay ? ' - AutoPay' : ''} (${normalizedFrequency})`
            };
          }
          return null;
        }
        
        // For non-recurring bills, just add the single occurrence if within forecast period
        // Only include future bills and recently due bills (last 7 days)
        if (
          (dueDate >= currentDate && dueDate <= forecastEndDate) || 
          (dueDate < currentDate && 
           Math.abs(currentDate.getTime() - dueDate.getTime()) < (7 * 24 * 60 * 60 * 1000))
        ) {
          console.log(`Adding non-recurring bill ${bill.name} on ${dueDate.toLocaleDateString()}`);
          
          return {
            itemId: bill.id,
            date: bill.dueDate,
            amount: -Math.abs(bill.amount), // Ensure bills are negative
            category: bill.category || 'Expense',
            name: bill.name || 'Bill',
            type: 'bill',
            runningBalance: 0, // Will be calculated later
            description: `${bill.name} (${bill.category}) - Due${bill.autoPay ? ' - AutoPay' : ''} - One-time`
          };
        }
        
        // Log skipped bills for debugging
        if (dueDate < currentDate) {
          console.log(`Skipping past bill ${bill.name} from ${dueDate.toLocaleDateString()} (too old)`);
        }
        
        return null;
      } catch (error) {
        console.error(`Error processing bill item ${bill.name || bill.id}:`, error);
      }
      return null;
    }, 'bill');

    // Process expenses as one-time bills (always include in forecast regardless of date)
    safelyAddItems(validExpenses, (expense) => {
      // Only process valid expense items
      if (!expense.id || !expense.date || isNaN(expense.amount)) return null;
      
      try {
        // Log the expense being processed for debugging
        console.log(`Processing expense: ${expense.name}, Amount: ${expense.amount}, Treating as one-time expense`);
        
        const expenseDate = new Date(expense.date);
        const currentDate = new Date();
        const forecastEndDate = new Date();
        forecastEndDate.setDate(forecastEndDate.getDate() + normalizedDays);
        
        // Only include expenses within the forecast period - but be stricter about dates
        // We want expenses either in the future or recent past within forecast period
        if (
          // Include future expenses within forecast window
          (expenseDate >= currentDate && expenseDate <= forecastEndDate) || 
          // Include very recent past expenses (last 7 days) but not older ones to avoid inflation
          (expenseDate < currentDate && 
           Math.abs(currentDate.getTime() - expenseDate.getTime()) < (7 * 24 * 60 * 60 * 1000))
        ) {
          console.log(`Adding expense ${expense.name} on ${expenseDate.toLocaleDateString()}`);
          
          // Create an expense item with proper type
          return {
            itemId: expense.id,
            date: expense.date,
            amount: -Math.abs(expense.amount), // Ensure expenses are negative
            category: expense.category || 'Expense',
            name: expense.name || 'Expense',
            type: 'expense', // Use 'expense' type instead of 'bill'
            runningBalance: 0, // Will be calculated later
            description: `${expense.name} (${expense.category}) - One-time expense`
          };
        }
        
        // Log skipped expenses for debugging
        if (expenseDate < currentDate) {
          console.log(`Skipping past expense ${expense.name} from ${expenseDate.toLocaleDateString()} (too old)`);
        }
        
        return null;
      } catch (error) {
        console.error(`Error processing expense item ${expense.name || expense.id}:`, error);
      }
      return null;
    }, 'expense');
    
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
        runningBalance: 0, // Will be calculated later
        description: `Balance adjusted by ${formatCurrency(adjustment.amount)} - ${adjustment.reason || 'No reason provided'}`
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
      runningBalance: isNaN(currentBalance) ? 0 : currentBalance,
      description: 'Starting balance'
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