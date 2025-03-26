"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CircleDollarSign,
  ArrowUp,
  ArrowDown,
  Calendar,
  LineChart,
  TrendingUp,
  Settings,
  AlertCircle,
  Wallet,
  Plus,
  Edit,
  Check,
  CalendarClock,
  CreditCard,
  CalendarCheck
} from "lucide-react";
import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ForecastChart } from "@/components/reports/forecast-chart";
import { useAuth } from "@/providers/firebase-auth-provider";
import { useFinancialData } from "@/hooks/use-financial-data";
import { generateCashFlowForecast } from "@/utils/financial-utils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatCurrency } from "@/utils/financial-utils";
import { ForecastItem } from "@/types/financial";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

// Types for our forecast data
type ExpectedIncome = {
  id: number;
  name: string;
  amount: number;
  frequency: 'once' | 'weekly' | 'biweekly' | 'monthly';
  date: string;
  isPredicted: boolean;
};

type MandatoryExpense = {
  id: number;
  name: string;
  amount: number;
  frequency: 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  date: string;
  category: string;
  isPredicted: boolean;
};

type OptionalExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  likelihood: number; // 0-100%
  isPriority: boolean;
};

type MonthlyForecast = {
  month: string;
  income: number;
  mandatoryExpenses: number;
  optionalExpenses: number;
  netCashFlow: number;
  scenarioIncome?: number;
  scenarioMandatoryExpenses?: number;
  scenarioOptionalExpenses?: number;
  scenarioNetCashFlow?: number;
};

// Add these types near the top with other type definitions
type BalanceEdit = {
  date: string;
  oldBalance: number;
  newBalance: number;
  note?: string;
};

// Add type definition for the forecast period
type ForecastPeriod = "1m" | "3m" | "6m" | "12m";

export default function ForecastingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const financialData = useFinancialData();
  const [forecastData, setForecastData] = useState<ForecastItem[]>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyForecast[]>([]);

  // Various state for scenario mode
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [scenarioName, setScenarioName] = useState("Default Scenario");
  const [incomeAdjustment, setIncomeAdjustment] = useState(0);
  const [expensesAdjustment, setExpensesAdjustment] = useState(0);
  const [savingsAdjustment, setSavingsAdjustment] = useState(0);
  const [unexpectedExpense, setUnexpectedExpense] = useState(0);
  const [unexpectedExpenseDate, setUnexpectedExpenseDate] = useState<Date | undefined>(undefined);
  const [scenarioForecast, setScenarioForecast] = useState<ForecastItem[]>([]);
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [newBalance, setNewBalance] = useState(0);
  const [balanceNote, setBalanceNote] = useState("");
  const [balanceEdits, setBalanceEdits] = useState<BalanceEdit[]>([]);
  
  // State for forecast period selection
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>("3m");
  
  // State for filters and optional expenses
  const [includeOptionalExpenses, setIncludeOptionalExpenses] = useState(true);
  const [openAddIncomeDialog, setOpenAddIncomeDialog] = useState(false);
  const [openAddExpenseDialog, setOpenAddExpenseDialog] = useState(false);
  
  // Use ref to track last successful generation to prevent infinite loops
  const lastGenerationRef = useRef<{
    balanceId: string | null;
    incomesCount: number;
    billsCount: number;
    expensesCount: number;
    forecastPeriod: string;
  }>({
    balanceId: null,
    incomesCount: 0,
    billsCount: 0,
    expensesCount: 0,
    forecastPeriod: "3m"
  });
  
  // Placeholder for optional expenses - in the future, this would come from the database
  const optionalExpenses: OptionalExpense[] = [
    {
      id: '1',
      name: 'Entertainment',
      amount: 150,
      category: 'Entertainment',
      likelihood: 90,
      isPriority: false,
    },
    {
      id: '2',
      name: 'Shopping',
      amount: 200,
      category: 'Shopping',
      likelihood: 60,
      isPriority: false,
    }
  ];

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
    }
  }, [authLoading, user, router]);

  // Generate forecast data
  useEffect(() => {
    if (!financialData.profileData || !financialData.incomesData || !financialData.billsData || !financialData.expensesData) return;

    const currentBalance = financialData.profileData;
    const incomes = financialData.incomesData;
    const bills = financialData.billsData;
    const expenses = financialData.expensesData;
    const balanceAdjustments: any[] = [];
    
    // Check if we need to regenerate the forecast
    const balanceId = currentBalance.lastUpdated || Date.now().toString();
    const shouldRegenerateForcecast = 
      lastGenerationRef.current.balanceId !== balanceId ||
      lastGenerationRef.current.incomesCount !== incomes.length ||
      lastGenerationRef.current.billsCount !== bills.length ||
      lastGenerationRef.current.expensesCount !== expenses.length ||
      lastGenerationRef.current.forecastPeriod !== forecastPeriod;
    
    // Skip generation if data is the same as before
    if (!shouldRegenerateForcecast && forecastData.length > 0) {
      return;
    }
    
    // Calculate days based on forecastPeriod
    let forecastDays = 90;
    if (forecastPeriod === "1m") forecastDays = 30;
    else if (forecastPeriod === "3m") forecastDays = 90;
    else if (forecastPeriod === "6m") forecastDays = 180;
    else if (forecastPeriod === "12m") forecastDays = 365;

    // Log recurring items counts for debugging
    console.log("Forecasting with:", {
      totalIncomes: incomes.length,
      recurringIncomes: incomes.filter(i => i.isRecurring).length,
      totalBills: bills.length,
      recurringBills: bills.filter(b => b.isRecurring).length,
      totalExpenses: expenses.length,
      plannedExpenses: expenses.filter(e => e.isPlanned).length,
      totalItems: incomes.length + bills.length + expenses.length,
      forecastDays
    });
    
    try {
      // Always clear existing data first to prevent stale data display
      setForecastData([]);
      setScenarioForecast([]);
      
      // Generate forecast with the selected period
      const forecast = generateCashFlowForecast(
        currentBalance.currentBalance,
        incomes,
        bills,
        expenses,
        balanceAdjustments,
        forecastDays
      );
        
      // Check if the forecast was generated properly
      if (!forecast || forecast.length === 0) {
        console.error("No forecast data was generated");
        return;
      }
      
      // Ensure we have a proper date range by examining the data
      const sortedByDate = [...forecast].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      if (sortedByDate.length > 0) {
        const firstDate = new Date(sortedByDate[0].date);
        const lastDate = new Date(sortedByDate[sortedByDate.length - 1].date);
        const dayRange = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`Generated forecast spans ${dayRange} days, from ${firstDate.toLocaleDateString()} to ${lastDate.toLocaleDateString()}`);
        
        // If the forecast doesn't span the expected number of days, add marker points
        if (dayRange < forecastDays * 0.9) { // Allow for a 10% margin of error
          console.warn(`Forecast doesn't span full period (${dayRange} vs ${forecastDays} days), adding end marker`);
          
          // Add a marker at the end date
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + forecastDays);
          
          sortedByDate.push({
            itemId: 'end-marker',
            date: endDate.toISOString(),
            amount: 0,
            category: 'marker',
            name: 'End of Forecast Period',
            type: 'marker',
            runningBalance: sortedByDate[sortedByDate.length - 1].runningBalance,
            description: 'End of forecast period marker'
          });
        }
      }

      // Use the sorted data to ensure timeline consistency
      setForecastData(sortedByDate);

      // Log resulting forecast size
      console.log(`Generated ${sortedByDate.length} forecast items`);

      // Generate monthly breakdown from forecast data
      const monthlyData = generateMonthlyBreakdown(sortedByDate, scenarioForecast);
      setMonthlyBreakdown(monthlyData);

      // Generate scenario forecast if simulation mode is enabled
      if (isSimulationMode) {
        generateScenarioForecast();
      } else {
        setScenarioForecast([]);
      }

      // Update last generation reference to track state
      lastGenerationRef.current = {
        balanceId,
        incomesCount: incomes.length,
        billsCount: bills.length,
        expensesCount: expenses.length,
        forecastPeriod
      };
    } catch (error) {
      console.error("Error generating forecast:", error);
      setForecastData([]);
      setScenarioForecast([]);
    }
  }, [financialData.profileData, financialData.incomesData, financialData.billsData, financialData.expensesData, forecastPeriod, isSimulationMode]);

  // Function to generate scenario forecast
  const generateScenarioForecast = useCallback(() => {
    if (!financialData.profileData || !financialData.incomesData || !financialData.billsData || !financialData.expensesData) return;

    // Calculate days based on forecastPeriod
    let forecastDays = 90;
    if (forecastPeriod === "1m") forecastDays = 30;
    else if (forecastPeriod === "3m") forecastDays = 90;
    else if (forecastPeriod === "6m") forecastDays = 180;
    else if (forecastPeriod === "12m") forecastDays = 365;

    try {
      const currentBalance = financialData.profileData.currentBalance || 0;
      const incomesArray = financialData.incomesData || [];
      const billsArray = financialData.billsData || [];
      const expensesArray = financialData.expensesData || [];

      // Apply income adjustment to all incomes
      const adjustedIncomes = incomesArray.map(income => ({
        ...income,
        amount: income.amount * (1 + incomeAdjustment / 100)
      }));
      
      // Apply expense adjustment to all bills and expenses
      const adjustedBills = billsArray.map(bill => ({
        ...bill,
        amount: bill.amount * (1 + expensesAdjustment / 100)
      }));

      const adjustedExpenses = expensesArray.map(expense => ({
        ...expense,
        amount: expense.amount * (1 + expensesAdjustment / 100)
      }));
      
      // Add monthly savings increase if specified
      const balanceAdjustments: any[] = [];
      if (savingsAdjustment > 0) {
        // Create an adjustment for each month in the forecast period
        const monthsInForecast = Math.min(Math.ceil(forecastDays / 30), 12); // Cap at 12 months
        for (let i = 0; i < monthsInForecast; i++) {
          const date = new Date();
          date.setDate(1); // First day of the month
          date.setMonth(date.getMonth() + i + 1); // Add months
          
          balanceAdjustments.push({
            id: `savings-increase-${i}`,
            date: date.toISOString(),
            amount: savingsAdjustment,
            category: 'Income',
            name: 'Monthly Savings Increase',
            type: 'income',
            description: 'Monthly Savings Increase'
          });
        }
      }
      
      // Add unexpected expense if specified
      if (unexpectedExpense > 0 && unexpectedExpenseDate) {
        balanceAdjustments.push({
          id: `unexpected-${Date.now()}`,
          date: unexpectedExpenseDate.toISOString(),
          amount: -unexpectedExpense,
          category: 'Unexpected',
          name: 'Unexpected Expense',
          type: 'expense',
          description: 'Unexpected Expense'
        });
      }
      
      // Clear existing data before generating new scenario
      setScenarioForecast([]);
      
      // Generate forecast with consistent approach
      const scenarioForecast = generateCashFlowForecast(
        currentBalance,
        adjustedIncomes,
        adjustedBills,
        adjustedExpenses,
        balanceAdjustments,
        forecastDays
      );
      
      // Ensure we have a good date span
      if (scenarioForecast.length > 0) {
        const sortedScenario = [...scenarioForecast].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        // Check if the forecast spans the whole period
        const firstDate = new Date(sortedScenario[0].date);
        const lastDate = new Date(sortedScenario[sortedScenario.length - 1].date);
        const dayRange = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`Scenario forecast spans ${dayRange} days, from ${firstDate.toLocaleDateString()} to ${lastDate.toLocaleDateString()}`);
        
        // If forecast doesn't span the expected range, add an end marker
        if (dayRange < forecastDays * 0.9) {
          console.log(`Adding end marker to scenario forecast`);
          
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + forecastDays);
          
          sortedScenario.push({
            itemId: 'scenario-end-marker',
            date: endDate.toISOString(),
            amount: 0,
            category: 'marker',
            name: 'End of Scenario Period',
            type: 'marker',
            runningBalance: sortedScenario[sortedScenario.length - 1].runningBalance,
            description: 'End of scenario period marker'
          });
        }
        
        setScenarioForecast(sortedScenario);
        console.log(`Generated ${sortedScenario.length} scenario forecast items`);
      } else {
        console.warn("No scenario forecast data was generated");
        setScenarioForecast([]);
      }
    } catch (error) {
      console.error("Error generating scenario forecast:", error);
      setScenarioForecast([]);
    }
  }, [financialData.profileData, financialData.incomesData, financialData.billsData, financialData.expensesData, forecastPeriod, incomeAdjustment, expensesAdjustment, savingsAdjustment, unexpectedExpense, unexpectedExpenseDate]);

  // Function to generate monthly breakdown from forecast data
  const generateMonthlyBreakdown = (forecast: ForecastItem[], scenarioForecast: ForecastItem[] = []) => {
    // Skip if no forecast data
    if (!forecast || forecast.length === 0) {
      console.log("No forecast data to generate monthly breakdown");
      return [];
    }
    
    // Initialize map to track monthly data
    const monthlyData = new Map<string, {
      month: string;
      income: number;
      mandatoryExpenses: number;
      optionalExpenses: number;
      netCashFlow: number;
      scenarioIncome?: number;
      scenarioMandatoryExpenses?: number;
      scenarioOptionalExpenses?: number;
      scenarioNetCashFlow?: number;
    }>();
    
    try {
      // Process items in chunks to prevent UI freezing for large forecasts
      const processItems = (items: ForecastItem[], isScenario: boolean = false) => {
        // Define which categories are optional expenses
        const optionalCategories = ['Entertainment', 'Personal', 'Dining', 'Shopping'];
        
        // Set a hard limit on items to process to prevent browser crashes
        const MAX_ITEMS_TO_PROCESS = 500;
        
        // If we have more items than the limit, we'll sample them
        let itemsToProcess: ForecastItem[];
        
        if (items.length > MAX_ITEMS_TO_PROCESS) {
          console.warn(`Monthly breakdown processing limited from ${items.length} to ${MAX_ITEMS_TO_PROCESS} items`);
          
          // Keep first month of data (approximately)
          const firstMonthCutoff = new Date(items[0].date);
          firstMonthCutoff.setMonth(firstMonthCutoff.getMonth() + 1);
          
          // Get items from first month (or at least 50 items)
          const firstMonth = items.filter(item => new Date(item.date) < firstMonthCutoff).slice(0, 100);
          
          // For remaining periods, sample at regular intervals
          const remainingItems = items.filter(item => new Date(item.date) >= firstMonthCutoff);
          const samplingRate = Math.max(1, Math.floor(remainingItems.length / (MAX_ITEMS_TO_PROCESS - firstMonth.length)));
          
          const sampledItems = [];
          for (let i = 0; i < remainingItems.length; i += samplingRate) {
            sampledItems.push(remainingItems[i]);
          }
          
          itemsToProcess = [...firstMonth, ...sampledItems];
        } else {
          itemsToProcess = items;
        }
        
        // Process in batches to prevent UI freezing
        const batchSize = 100;
        const totalBatches = Math.ceil(itemsToProcess.length / batchSize);
        
        // Process initial batch immediately
        processBatch(0);
        
        // Function to process a batch of items
        function processBatch(batchIndex: number) {
          if (batchIndex >= totalBatches) return;
          
          const startIdx = batchIndex * batchSize;
          const endIdx = Math.min(startIdx + batchSize, itemsToProcess.length);
          const batch = itemsToProcess.slice(startIdx, endIdx);
          
          for (const item of batch) {
            try {
              if (!item.date) continue;
              
              // Convert date to month key (YYYY-MM)
              const date = new Date(item.date);
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              
              // Create or update monthly data
              if (!monthlyData.has(monthKey)) {
                monthlyData.set(monthKey, {
                  month: monthLabel,
                  income: 0,
                  mandatoryExpenses: 0,
                  optionalExpenses: 0,
                  netCashFlow: 0,
                  scenarioIncome: 0,
                  scenarioMandatoryExpenses: 0,
                  scenarioOptionalExpenses: 0,
                  scenarioNetCashFlow: 0
                });
              }
              
              const monthData = monthlyData.get(monthKey)!;
              
              // Add to the appropriate category based on item type
              if (item.type === 'income') {
                if (isScenario) {
                  monthData.scenarioIncome = (monthData.scenarioIncome || 0) + item.amount;
                  monthData.scenarioNetCashFlow = (monthData.scenarioNetCashFlow || 0) + item.amount;
                } else {
                  monthData.income += item.amount;
                  monthData.netCashFlow += item.amount;
                }
              } else if (item.type === 'expense' || item.type === 'bill') {
                const expenseAmount = Math.abs(item.amount);
                
                // Categorize as mandatory or optional expense
                if (optionalCategories.includes(item.category)) {
                  if (isScenario) {
                    monthData.scenarioOptionalExpenses = (monthData.scenarioOptionalExpenses || 0) + expenseAmount;
                    monthData.scenarioNetCashFlow = (monthData.scenarioNetCashFlow || 0) - expenseAmount;
                  } else {
                    monthData.optionalExpenses += expenseAmount;
                    monthData.netCashFlow -= expenseAmount;
                  }
                } else {
                  if (isScenario) {
                    monthData.scenarioMandatoryExpenses = (monthData.scenarioMandatoryExpenses || 0) + expenseAmount;
                    monthData.scenarioNetCashFlow = (monthData.scenarioNetCashFlow || 0) - expenseAmount;
                  } else {
                    monthData.mandatoryExpenses += expenseAmount;
                    monthData.netCashFlow -= expenseAmount;
                  }
                }
              }
              
              // Update the map
              monthlyData.set(monthKey, monthData);
            } catch (err) {
              console.warn("Error processing item for monthly breakdown:", err);
            }
          }
          
          // Schedule next batch with small delay to allow UI to update
          if (batchIndex < totalBatches - 1) {
            setTimeout(() => processBatch(batchIndex + 1), 0);
          }
        }
      };
      
      // Process baseline forecast
      processItems(forecast);
      
      // Process scenario forecast if available
      if (scenarioForecast && scenarioForecast.length > 0) {
        processItems(scenarioForecast, true);
      }
      
      // Convert map to array and sort by date
      const result = Array.from(monthlyData.values()).sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA.getTime() - dateB.getTime();
      });
      
      return result;
    } catch (error) {
      console.error("Error generating monthly breakdown:", error);
      return [];
    }
  };

  // Add this function to handle balance updates
  const handleBalanceUpdate = async () => {
    if (!user || !financialData.profileData) return;

    const oldBalance = financialData.profileData.currentBalance;
    const edit: BalanceEdit = {
      date: new Date().toISOString(),
      oldBalance,
      newBalance,
      note: balanceNote
    };

    setBalanceEdits(prev => [...prev, edit]);
    // Here you would also update the balance in your database
    // await updateBalance(newBalance);
    
    setIsEditingBalance(false);
    setBalanceNote("");
  };

  // Modify the applyScenario function
  const applyScenario = () => {
    if (authLoading || !isSimulationMode) return;
    
    try {
      generateScenarioForecast();
    } catch (error) {
      console.error("Error applying scenario:", error);
      toast.error("Failed to apply scenario adjustments");
    }
  };
  
  // Modify the resetScenario function
  const resetScenario = () => {
    setIncomeAdjustment(0);
    setExpensesAdjustment(0);
    setSavingsAdjustment(0);
    setUnexpectedExpense(0);
    setUnexpectedExpenseDate(undefined);
    setScenarioName("Default Scenario");
    setScenarioForecast([]);
  };

  if (authLoading || financialData.loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-muted-foreground">Loading your financial data...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return null;
  }

  // Calculate totals based on the forecast data
  const getPeriodTotals = () => {
    if (!forecastData.length) {
      return {
        projectedIncome: "0.00",
        projectedExpenses: "0.00",
        endingBalance: financialData.profileData?.currentBalance?.toFixed(2) || "0.00"
      };
    }

    try {
      // Get starting balance (current balance)
      const startingBalance = financialData.profileData?.currentBalance || 0;
      
      // Calculate projected income (sum of all positive amounts)
      // Optimize by using reduce only once with a condition
      const { totalIncome, totalExpenses, optionalExpenses } = forecastData.reduce(
        (acc, item) => {
          if (item.type === 'income') {
            acc.totalIncome += item.amount;
          } else if (item.type === 'expense' || item.type === 'bill') {
            const expenseAmount = Math.abs(item.amount);
            acc.totalExpenses += expenseAmount;
            
            // Track optional expenses separately
            const optionalCategories = ['Entertainment', 'Personal', 'Dining', 'Shopping'];
            if (optionalCategories.includes(item.category)) {
              acc.optionalExpenses += expenseAmount;
            }
          }
          return acc;
        },
        { totalIncome: 0, totalExpenses: 0, optionalExpenses: 0 }
      );
      
      // Calculate adjusted expenses based on optional expenses filter
      const adjustedExpenses = includeOptionalExpenses ? 
        totalExpenses : 
        totalExpenses - optionalExpenses;
      
      // Get ending balance (last item's running balance)
      // Handle case where running balance might not be calculated
      let endingBalance: number;
      if (forecastData.length > 0) {
        const lastItem = forecastData[forecastData.length - 1];
        if (lastItem.runningBalance !== undefined) {
          endingBalance = lastItem.runningBalance;
        } else {
          // If running balance not calculated, estimate it
          endingBalance = startingBalance + totalIncome - adjustedExpenses;
        }
      } else {
        endingBalance = startingBalance;
      }
      
      return {
        projectedIncome: totalIncome.toFixed(2),
        projectedExpenses: adjustedExpenses.toFixed(2),
        endingBalance: endingBalance.toFixed(2)
      };
    } catch (error) {
      console.error("Error calculating period totals:", error);
      return {
        projectedIncome: "0.00",
        projectedExpenses: "0.00",
        endingBalance: financialData.profileData?.currentBalance?.toFixed(2) || "0.00"
      };
    }
  };

  // Format the data for the chart
  const getForecastChartData = () => {
    try {
      // Limit the maximum number of data points based on forecast period
      let maxDataPoints = 100;
      switch (forecastPeriod) {
        case "1m": maxDataPoints = 60; break; // 2 points per day
        case "3m": maxDataPoints = 100; break; // ~1 point per day
        case "6m": maxDataPoints = 120; break; // ~0.6 points per day  
        case "12m": maxDataPoints = 180; break; // ~0.5 points per day
        default: maxDataPoints = 100;
      }
      
      // If no data, return empty array
      if (!forecastData || forecastData.length === 0) {
        return [];
      }
      
      // For very large datasets, sample the data to prevent performance issues
      let dataToProcess = forecastData;
      
      if (forecastData.length > maxDataPoints) {
        console.log(`Sampling chart data from ${forecastData.length} to ${maxDataPoints} points`);
        
        // Always keep first and last points for accurate visualization
        const first = forecastData.slice(0, 1);
        const last = forecastData.slice(-1);
        
        // For the middle points, use a smart sampling approach
        // that preserves important events (big income/expense changes)
        const middle = forecastData.slice(1, -1);
        
        // First, identify significant events (large balance changes)
        const significantThreshold = 0.05; // 5% change in balance
        const startBalance = first[0].runningBalance || 0;
        const significantEvents = middle.filter((item, index) => {
          if (index === 0) return false;
          
          const prevBalance = middle[index - 1].runningBalance || 0;
          const currBalance = item.runningBalance || 0;
          
          // Calculate percentage change relative to start balance
          const change = Math.abs(currBalance - prevBalance);
          const percentChange = startBalance > 0 ? change / startBalance : 0;
          
          return percentChange > significantThreshold;
        });
        
        // Take up to 20% of points as significant events
        const maxSignificantEvents = Math.ceil(maxDataPoints * 0.2);
        const selectedSignificantEvents = significantEvents.slice(0, maxSignificantEvents);
        
        // Distribute remaining points evenly
        const remainingPointsCount = maxDataPoints - first.length - last.length - selectedSignificantEvents.length;
        const step = Math.max(1, Math.floor(middle.length / remainingPointsCount));
        
        const sampledMiddle = [];
        for (let i = 0; i < middle.length; i += step) {
          // Skip if this point is already included as a significant event
          if (!selectedSignificantEvents.some(event => event === middle[i])) {
            sampledMiddle.push(middle[i]);
            
            // Stop if we've collected enough points
            if (sampledMiddle.length >= remainingPointsCount) break;
          }
        }
        
        // Combine all points and sort by date
        const allSampledPoints = [...first, ...selectedSignificantEvents, ...sampledMiddle, ...last];
        
        // Sort by date to ensure correct order
        dataToProcess = allSampledPoints.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        // Cap at maximum data points if we still have too many
        if (dataToProcess.length > maxDataPoints) {
          dataToProcess = dataToProcess.slice(0, maxDataPoints);
        }
      }
      
      // Transform the data for the chart in an optimized way
      return dataToProcess.map(item => {
        const optionalCategories = ['Entertainment', 'Personal', 'Dining', 'Shopping'];
        const isOptionalExpense = item.type === 'expense' && optionalCategories.includes(item.category);
        const isMandatoryExpense = item.type === 'expense' && !optionalCategories.includes(item.category);
        
        return {
          date: new Date(item.date).toLocaleDateString(),
          balance: item.runningBalance || 0,
          income: item.type === 'income' ? item.amount : 0,
          mandatoryExpenses: isMandatoryExpense ? Math.abs(item.amount) : 0,
          optionalExpenses: isOptionalExpense ? Math.abs(item.amount) : 0,
          projectedBalance: item.runningBalance || 0
        };
      });
    } catch (error) {
      console.error("Error generating chart data:", error);
      return [];
    }
  };

  const totals = getPeriodTotals();
  const chartData = getForecastChartData();

  // Calculate the forecast period end date
  const getEndDateLabel = () => {
    const date = new Date();
    let months = 3;

    switch (forecastPeriod) {
      case "1m": months = 1; break;
      case "3m": months = 3; break;
      case "6m": months = 6; break;
      case "12m": months = 12; break;
    }

    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold mb-2">Cash Flow Forecasting</h1>
          
          <Tabs defaultValue="chart" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="chart">Forecast View</TabsTrigger>
              <TabsTrigger value="monthly">Monthly Breakdown</TabsTrigger>
              <TabsTrigger value="items">Recurring Items</TabsTrigger>
            </TabsList>
            
            <TabsContent value="chart">
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Cash Flow Projection</CardTitle>
                      <CardDescription>Forecast of your account balance including all expenses, bills, and incomes</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Select 
                        value={forecastPeriod}
                        onValueChange={(value) => setForecastPeriod(value as ForecastPeriod)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Time Period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1 Month</SelectItem>
                          <SelectItem value="3m">3 Months</SelectItem>
                          <SelectItem value="6m">6 Months</SelectItem>
                          <SelectItem value="12m">12 Months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {financialData.loading || forecastData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px]">
                      <LoadingSpinner size="lg" />
                      <p className="text-sm text-muted-foreground mt-2">Generating forecast...</p>
                    </div>
                  ) : (
                    <div className="h-[400px]">
                      <ForecastChart 
                        baselineData={forecastData} 
                        scenarioData={isSimulationMode ? scenarioForecast : undefined} 
                        timeFrame={forecastPeriod}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ForecastBalanceCard 
                  forecastData={forecastData} 
                  scenarioData={isSimulationMode ? scenarioForecast : undefined}
                />
                
                <ForecastActionsCard 
                  openAddIncomeDialog={() => setOpenAddIncomeDialog(true)}
                  openAddExpenseDialog={() => setOpenAddExpenseDialog(true)}
                  onToggleSimulation={() => setIsSimulationMode(!isSimulationMode)}
                  isSimulationMode={isSimulationMode}
                />
                
                <ForecastRiskAssessmentCard forecastData={forecastData} />
              </div>
            </TabsContent>
            
            <TabsContent value="monthly">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Breakdown</CardTitle>
                  <CardDescription>Forecast of monthly income, expenses, and net cash flow</CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlyBreakdown.length > 0 ? (
                    <div className="space-y-4">
                      {monthlyBreakdown.map((month, index) => (
                        <MonthlyForecastCard 
                          key={month.month} 
                          monthData={month}
                          isScenario={isSimulationMode}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No monthly data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="items">
              <Card>
                <CardHeader>
                  <CardTitle>Recurring Items in Forecast</CardTitle>
                  <CardDescription>Overview of recurring incomes and expenses included in the forecast</CardDescription>
                </CardHeader>
                <CardContent>
                  <RecurringItemsCard 
                    incomes={financialData.incomesData || []}
                    bills={financialData.billsData || []}
                    expenses={financialData.expensesData || []}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* Dialogs for adding new items */}
          {/* (existing dialogs remain unchanged) */}
        </div>
      </div>
    </MainLayout>
  );
}

// New RecurringItemsCard Component
function RecurringItemsCard({ incomes, bills, expenses }: { 
  incomes: any[], 
  bills: any[],
  expenses: any[]
}) {
  // Filter to only recurring items
  const recurringIncomes = incomes.filter(income => income.isRecurring && income.frequency);
  const recurringBills = bills.filter(bill => bill.isRecurring && bill.frequency);
  
  // Group items by frequency
  const groupByFrequency = (items: any[]) => {
    const grouped: Record<string, any[]> = {
      weekly: [],
      biweekly: [],
      monthly: [],
      quarterly: [],
      annually: [],
      other: []
    };
    
    items.forEach(item => {
      const frequency = item.frequency?.toLowerCase().trim() || '';
      
      if (frequency === 'weekly') {
        grouped.weekly.push(item);
      } else if (frequency === 'biweekly' || frequency === 'bi-weekly' || frequency === 'bi weekly') {
        grouped.biweekly.push(item);
      } else if (frequency === 'monthly') {
        grouped.monthly.push(item);
      } else if (frequency === 'quarterly') {
        grouped.quarterly.push(item);
      } else if (frequency === 'annually' || frequency === 'annual' || frequency === 'yearly') {
        grouped.annually.push(item);
      } else {
        grouped.other.push(item);
      }
    });
    
    return grouped;
  };
  
  const groupedIncomes = groupByFrequency(recurringIncomes);
  const groupedBills = groupByFrequency(recurringBills);
  
  // Helper for displaying frequency badge
  const FrequencyBadge = ({ frequency }: { frequency: string }) => {
    const getColor = () => {
      switch (frequency) {
        case 'weekly': return 'bg-red-100 text-red-800 border-red-200';
        case 'biweekly': return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'monthly': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'quarterly': return 'bg-purple-100 text-purple-800 border-purple-200';
        case 'annually': return 'bg-green-100 text-green-800 border-green-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getColor()}`}>
        {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
      </span>
    );
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2 flex items-center gap-1">
          <ArrowUp className="h-4 w-4 text-emerald-500" />
          Recurring Income
        </h3>
        
        {Object.entries(groupedIncomes).flatMap(([frequency, items]) => 
          items.length > 0 ? [
            <div key={`income-${frequency}`} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <FrequencyBadge frequency={frequency} />
                <span className="text-sm font-medium">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="space-y-2">
                {items.map(income => (
                  <div key={income.id} className="p-3 bg-background border rounded-md">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">{income.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Next: {new Date(income.date).toLocaleDateString()}
                          {income.category && ` · ${income.category}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-emerald-600">{formatCurrency(income.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          {frequency === 'monthly' ? 'Monthly' : 
                           frequency === 'biweekly' ? 'Every 2 weeks' : 
                           frequency === 'weekly' ? 'Weekly' : 
                           frequency === 'quarterly' ? 'Every 3 months' : 
                           frequency === 'annually' ? 'Yearly' : 
                           income.frequency}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ] : []
        )}
        
        {recurringIncomes.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            No recurring income found
          </div>
        )}
      </div>
      
      <Separator />
      
      <div>
        <h3 className="text-lg font-medium mb-2 flex items-center gap-1">
          <ArrowDown className="h-4 w-4 text-rose-500" />
          Recurring Expenses
        </h3>
        
        {Object.entries(groupedBills).flatMap(([frequency, items]) => 
          items.length > 0 ? [
            <div key={`bill-${frequency}`} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <FrequencyBadge frequency={frequency} />
                <span className="text-sm font-medium">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="space-y-2">
                {items.map(bill => (
                  <div key={bill.id} className="p-3 bg-background border rounded-md">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">{bill.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Next: {new Date(bill.dueDate).toLocaleDateString()}
                          {bill.category && ` · ${bill.category}`}
                          {bill.autoPay && ` · AutoPay`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-rose-600">{formatCurrency(bill.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          {frequency === 'monthly' ? 'Monthly' : 
                           frequency === 'biweekly' ? 'Every 2 weeks' : 
                           frequency === 'weekly' ? 'Weekly' : 
                           frequency === 'quarterly' ? 'Every 3 months' : 
                           frequency === 'annually' ? 'Yearly' : 
                           bill.frequency}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ] : []
        )}
        
        {recurringBills.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            No recurring expenses found
          </div>
        )}
      </div>
      
      <Separator />
      
      <div>
        <h3 className="text-lg font-medium mb-2 flex items-center gap-1">
          <ArrowDown className="h-4 w-4 text-amber-500" />
          One-time Expenses
        </h3>
        
        {expenses.length > 0 ? (
          <div className="space-y-2">
            {expenses.slice(0, 10).map(expense => (
              <div key={expense.id} className="p-3 bg-background border rounded-md">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{expense.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Date: {new Date(expense.date).toLocaleDateString()}
                      {expense.category && ` · ${expense.category}`}
                      {expense.isPlanned && ` · Planned`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-amber-600">{formatCurrency(expense.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      One-time expense
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {expenses.length > 10 && (
              <div className="text-center text-sm text-muted-foreground mt-2">
                + {expenses.length - 10} more one-time expenses
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            No one-time expenses found
          </div>
        )}
      </div>
    </div>
  );
}

// ForecastBalanceCard Component
function ForecastBalanceCard({ forecastData, scenarioData }: { forecastData: ForecastItem[], scenarioData?: ForecastItem[] }) {
  const { profileData } = useFinancialData();
  
  // Get current and ending balances
  const currentBalance = profileData?.currentBalance || 0;
  
  // Get ending balance from the last item with a running balance
  const getEndingBalance = (data: ForecastItem[]) => {
    if (!data || data.length === 0) return 0;
    
    // Find the last item with a running balance (excluding markers)
    const validItems = data.filter(item => 
      item.runningBalance !== undefined && 
      item.type !== 'marker'
    );
    
    if (validItems.length === 0) return 0;
    
    // Sort by date and get the last item
    const sortedItems = [...validItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return sortedItems[0].runningBalance || 0;
  };
  
  const endingBalance = getEndingBalance(forecastData);
  const scenarioEndingBalance = scenarioData ? getEndingBalance(scenarioData) : undefined;
  
  // Calculate projected change
  const projectedChange = endingBalance - currentBalance;
  const projectedChangePercent = currentBalance !== 0 
    ? (projectedChange / Math.abs(currentBalance)) * 100 
    : 0;
  
  // Get end date
  const getEndDate = (data: ForecastItem[]) => {
    if (!data || data.length === 0) return new Date();
    
    const sortedByDate = [...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return new Date(sortedByDate[0].date);
  };
  
  const endDate = getEndDate(forecastData);
  const formattedEndDate = endDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance Projection</CardTitle>
        <CardDescription>Current and projected account balances</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Current Balance</div>
          <div className="text-2xl font-bold">{formatCurrency(currentBalance)}</div>
          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(profileData?.lastUpdated || Date.now()).toLocaleDateString()}
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Projected Balance</div>
          <div className="text-2xl font-bold">{formatCurrency(endingBalance)}</div>
          
          {scenarioEndingBalance && (
            <div className="text-sm text-emerald-500">
              Scenario: {formatCurrency(scenarioEndingBalance)}
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <span className={`text-sm ${projectedChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {projectedChange >= 0 ? '+' : ''}{formatCurrency(projectedChange)} 
              ({projectedChangePercent >= 0 ? '+' : ''}{projectedChangePercent.toFixed(1)}%)
            </span>
          </div>
          
          <div className="text-xs text-muted-foreground">
            By {formattedEndDate}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ForecastActionsCard Component
function ForecastActionsCard({ 
  openAddIncomeDialog, 
  openAddExpenseDialog,
  onToggleSimulation,
  isSimulationMode
}: { 
  openAddIncomeDialog: () => void, 
  openAddExpenseDialog: () => void,
  onToggleSimulation: () => void,
  isSimulationMode: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast Actions</CardTitle>
        <CardDescription>Update your forecast or test scenarios</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Add Items</div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={openAddIncomeDialog} className="w-full" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Income
            </Button>
            <Button onClick={openAddExpenseDialog} className="w-full" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Scenario Mode</div>
            <Switch checked={isSimulationMode} onCheckedChange={onToggleSimulation} />
          </div>
          <p className="text-xs text-muted-foreground">
            {isSimulationMode 
              ? "Simulate 'what-if' scenarios by adjusting income, expenses, and other factors" 
              : "Enable to test different financial scenarios"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ForecastRiskAssessmentCard Component
function ForecastRiskAssessmentCard({ forecastData }: { forecastData: ForecastItem[] }) {
  // Find lowest balance point
  const findLowestBalance = () => {
    if (!forecastData || forecastData.length === 0) return { date: new Date(), balance: 0 };
    
    let lowestBalance = Infinity;
    let lowestDate = new Date();
    
    forecastData.forEach(item => {
      if (
        item.runningBalance !== undefined && 
        item.runningBalance < lowestBalance &&
        item.type !== 'marker'
      ) {
        lowestBalance = item.runningBalance;
        lowestDate = new Date(item.date);
      }
    });
    
    return { date: lowestDate, balance: lowestBalance };
  };
  
  // Count days with negative balance
  const countNegativeDays = () => {
    if (!forecastData || forecastData.length === 0) return 0;
    
    return forecastData.filter(
      item => item.runningBalance !== undefined && 
      item.runningBalance < 0 &&
      item.type !== 'marker'
    ).length;
  };
  
  const lowestPoint = findLowestBalance();
  const negativeDays = countNegativeDays();
  const totalDays = forecastData.filter(item => item.type !== 'marker').length;
  const riskPercentage = totalDays > 0 ? (negativeDays / totalDays) * 100 : 0;
  
  // Determine risk level
  const getRiskLevel = () => {
    if (riskPercentage === 0) return { level: 'Low', color: 'text-emerald-500' };
    if (riskPercentage < 10) return { level: 'Moderate', color: 'text-yellow-500' };
    if (riskPercentage < 25) return { level: 'High', color: 'text-orange-500' };
    return { level: 'Critical', color: 'text-rose-500' };
  };
  
  const risk = getRiskLevel();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Assessment</CardTitle>
        <CardDescription>Analysis of potential financial risks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Risk Level</div>
          <div className={`text-xl font-bold ${risk.color}`}>
            {risk.level}
          </div>
          <p className="text-xs text-muted-foreground">
            {negativeDays > 0 
              ? `Negative balance on ${negativeDays} out of ${totalDays} days (${riskPercentage.toFixed(1)}%)` 
              : 'No risk of negative balance detected'}
          </p>
        </div>
        
        {lowestPoint.balance < 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Lowest Balance Point</div>
              <div className="text-xl font-bold text-rose-500">
                {formatCurrency(lowestPoint.balance)}
              </div>
              <p className="text-xs text-muted-foreground">
                On {lowestPoint.date.toLocaleDateString()}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// MonthlyForecastCard Component
function MonthlyForecastCard({ 
  monthData, 
  isScenario = false 
}: { 
  monthData: MonthlyForecast, 
  isScenario: boolean 
}) {
  const isPositiveCashflow = monthData.netCashFlow >= 0;
  const isScenarioPositive = monthData.scenarioNetCashFlow ? monthData.scenarioNetCashFlow >= 0 : true;
  
  return (
    <div className="space-y-2 p-4 border rounded-md">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{monthData.month}</h4>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            isPositiveCashflow
              ? 'text-emerald-500'
              : 'text-rose-500'
          }`}>
            {isPositiveCashflow ? '+' : ''}{formatCurrency(monthData.netCashFlow)}
          </span>
          
          {isScenario && monthData.scenarioNetCashFlow !== undefined && (
            <span className={`text-sm font-semibold ${
              isScenarioPositive
                ? 'text-emerald-500'
                : 'text-rose-500'
            }`}>
              ({isScenarioPositive ? '+' : ''}{formatCurrency(monthData.scenarioNetCashFlow)})
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-muted-foreground">
            Income: <span className="font-medium text-emerald-500">+{formatCurrency(monthData.income)}</span>
            {isScenario && monthData.scenarioIncome !== undefined && (
              <span className="ml-1 text-xs text-emerald-500">
                ({formatCurrency(monthData.scenarioIncome)})
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">
            Expenses: <span className="font-medium text-rose-500">-{formatCurrency(monthData.mandatoryExpenses + monthData.optionalExpenses)}</span>
            {isScenario && (monthData.scenarioMandatoryExpenses !== undefined || monthData.scenarioOptionalExpenses !== undefined) && (
              <span className="ml-1 text-xs text-rose-500">
                ({formatCurrency((monthData.scenarioMandatoryExpenses || 0) + (monthData.scenarioOptionalExpenses || 0))})
              </span>
            )}
          </p>
        </div>
      </div>
      
      <Progress
        value={isPositiveCashflow ? 100 : (monthData.income / (monthData.mandatoryExpenses + monthData.optionalExpenses + 0.01)) * 100}
        className={`h-2 ${isPositiveCashflow ? 'bg-emerald-100' : 'bg-rose-100'}`}
      />
    </div>
  );
}
