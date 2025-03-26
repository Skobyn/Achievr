"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
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
import { generateCashFlowForecast, formatCurrency } from "@/utils/financial-utils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ForecastItem } from "@/types/financial";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import React from "react";

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
  expenses: number;
  netCashFlow: number;
  scenarioIncome?: number;
  scenarioExpenses?: number;
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

// Summary metrics type
type ForecastSummary = {
  currentAvailable: number;
  projectedIncome: number;
  projectedExpenses: number;
  projectedAvailable: number;
};

// Memoized smaller components for better performance
const MonthlyBreakdownItem = React.memo(({ month }: { month: MonthlyForecast }) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{month.month}</span>
        <span className={`text-sm font-medium ${month.netCashFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {formatCurrency(month.netCashFlow)}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        {month.netCashFlow >= 0 ? (
          <div 
            className="h-full bg-green-500 rounded-full" 
            style={{ width: `${Math.min(month.netCashFlow / (month.income || 1) * 100, 100)}%` }}
          />
        ) : (
          <div 
            className="h-full bg-red-500 rounded-full" 
            style={{ width: `${Math.min(Math.abs(month.netCashFlow) / (month.expenses || 1) * 100, 100)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Income: {formatCurrency(month.income)}</span>
        <span>Expenses: {formatCurrency(month.expenses)}</span>
      </div>
    </div>
  );
});

// Memoize SummaryCard to prevent re-renders
const SummaryCard = React.memo(({ title, value, icon, description }: { 
  title: string; 
  value: number; 
  icon: React.ReactNode;
  description: string;
}) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center">
          {icon}
          <div className="text-2xl font-bold">
            {formatCurrency(value)}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
      </CardContent>
    </Card>
  );
});

// Memoized component for the monthly breakdown section
const MonthlyBreakdownSection = React.memo(({ data }: { data: MonthlyForecast[] }) => {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Calendar className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No monthly data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.slice(0, 12).map((month, index) => (
        <MonthlyBreakdownItem key={month.month} month={month} />
      ))}
    </div>
  );
});

export default function ForecastingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const financialData = useFinancialData();
  
  // Convert these state variables to useMemo to reduce re-renders
  const [forecastData, setForecastData] = useState<ForecastItem[]>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyForecast[]>([]);
  const [forecastSummary, setForecastSummary] = useState<ForecastSummary>({
    currentAvailable: 0,
    projectedIncome: 0,
    projectedExpenses: 0,
    projectedAvailable: 0
  });

  // Various state for scenario mode
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [scenarioName, setScenarioName] = useState("Default Scenario");
  const [incomeAdjustment, setIncomeAdjustment] = useState(0);
  const [expensesAdjustment, setExpensesAdjustment] = useState(0);
  const [savingsAdjustment, setSavingsAdjustment] = useState(0);
  const [unexpectedExpense, setUnexpectedExpense] = useState(0);
  const [unexpectedExpenseDate, setUnexpectedExpenseDate] = useState<Date | undefined>(undefined);
  const [scenarioForecast, setScenarioForecast] = useState<ForecastItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State for forecast period selection
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>("3m");
  
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

  // Authentication check effect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
    }
  }, [authLoading, user, router]);

  // Memoize financial data properties to prevent unnecessary rerenders
  const financialDataCache = useMemo(() => {
    return {
      profileData: financialData.profileData,
      incomesData: financialData.incomesData,
      billsData: financialData.billsData,
      expensesData: financialData.expensesData
    };
  }, [
    financialData.profileData,
    financialData.incomesData,
    financialData.billsData,
    financialData.expensesData
  ]);

  // Expensive calculations should be memoized
  const generateForecast = useCallback((
    currentBalance: number, 
    incomes: any[], 
    bills: any[], 
    expenses: any[], 
    adjustments: any[],
    days: number
  ) => {
    try {
      return generateCashFlowForecast(
        currentBalance,
        incomes,
        bills,
        expenses,
        adjustments,
        days
      );
    } catch (error) {
      console.error("Error in forecast generation:", error);
      return [];
    }
  }, []);

  // Memoize the forecast generation to avoid recalculation
  useEffect(() => {
    if (!financialDataCache.profileData || 
        !financialDataCache.incomesData || 
        !financialDataCache.billsData || 
        !financialDataCache.expensesData) {
      setIsLoading(true);
      return;
    }
    
    setIsLoading(true);

    const currentBalance = financialDataCache.profileData;
    const incomes = financialDataCache.incomesData;
    const bills = financialDataCache.billsData;
    const expenses = financialDataCache.expensesData;
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
      setIsLoading(false);
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
      
      // Generate forecast with the selected period - using our memoized generator
      const forecast = generateForecast(
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
        setIsLoading(false);
        return;
      }
      
      // Update the forecast data
      setForecastData(forecast);
      
      // Process the forecast data to calculate summary and monthly breakdown in a single pass
      const processedData = processForecastData(forecast);
      
      // Update the UI states with the processed data
      setForecastSummary(processedData.summary);
      setMonthlyBreakdown(processedData.monthlyBreakdown);
      
      // Log detailed information about the generated forecast for debugging
      console.log("Forecast Summary:", {
        totalItems: forecast.length,
        incomeItems: forecast.filter(item => item.type === 'income').length,
        billItems: forecast.filter(item => item.type === 'bill').length,
        expenseItems: forecast.filter(item => item.type === 'expense').length,
        firstDate: forecast.length > 0 ? new Date(forecast[0].date).toLocaleDateString() : 'none',
        lastDate: forecast.length > 0 ? new Date(forecast[forecast.length-1].date).toLocaleDateString() : 'none',
        totalIncome: processedData.summary.projectedIncome,
        totalExpenses: processedData.summary.projectedExpenses,
        monthlyBreakdownCount: processedData.monthlyBreakdown.length,
        runningBalanceRange: forecast.length > 0 ? 
          `${formatCurrency(Math.min(...forecast.filter(i => i.runningBalance !== undefined).map(i => i.runningBalance || 0)))} to ${formatCurrency(Math.max(...forecast.filter(i => i.runningBalance !== undefined).map(i => i.runningBalance || 0)))}` : 'none'
      });
      
      // Log all months included in the breakdown
      console.log("Monthly Breakdown Months:", processedData.monthlyBreakdown.map(m => m.month));
      
      // Update ref to prevent unnecessary recalculations
      lastGenerationRef.current = {
        balanceId,
        incomesCount: incomes.length,
        billsCount: bills.length,
        expensesCount: expenses.length,
        forecastPeriod
      };
      
    } catch (error) {
      console.error("Error generating forecast:", error);
      toast.error("Error generating forecast. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [financialDataCache, forecastPeriod, generateForecast]);

  // Efficient processing of forecast data - extract to standalone function to avoid recalculation
  const processForecastData = useCallback((forecast: ForecastItem[]) => {
    // Calculate summary metrics
    const projectedIncome = forecast
      .filter(item => item.type === 'income')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
      
    const projectedExpenses = forecast
      .filter(item => item.type === 'bill' || item.type === 'expense')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
    
    // Get current available (current balance minus any savings committed to goals)
    const currentAvailable = financialDataCache.profileData?.currentBalance || 0;
    
    // Calculate projected available
    const projectedAvailable = currentAvailable + projectedIncome - projectedExpenses;
    
    // Summary object
    const summary = {
      currentAvailable,
      projectedIncome,
      projectedExpenses,
      projectedAvailable
    };
    
    // Generate monthly breakdown efficiently
    const months: Record<string, MonthlyForecast> = {};
    
    // Create entries for the next 12 months
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(now);
      monthDate.setMonth(now.getMonth() + i);
      const monthKey = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      months[monthKey] = {
        month: monthKey,
        income: 0,
        expenses: 0,
        netCashFlow: 0
      };
    }
    
    // Efficiently process all forecast items in a single pass
    forecast.forEach(item => {
      const itemDate = new Date(item.date);
      const monthKey = itemDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      // Skip if not in our 12-month window
      if (!months[monthKey]) return;
      
      if (item.type === 'income') {
        months[monthKey].income += item.amount;
      } else if (item.type === 'bill' || item.type === 'expense') {
        // Make sure to use the absolute value for expenses
        months[monthKey].expenses += Math.abs(item.amount);
      }
      
      // Calculate net cash flow inline
      months[monthKey].netCashFlow = months[monthKey].income - months[monthKey].expenses;
    });
    
    // Convert to array and sort by date
    const monthsArray = Object.values(months);
    
    return {
      summary,
      monthlyBreakdown: monthsArray
    };
  }, [financialDataCache.profileData]);
  
  // Apply scenario function - memoized version to avoid recreating on each render
  const applyScenario = useCallback(() => {
    if (!forecastData.length) {
      toast.error("No baseline forecast data available to create a scenario");
      return;
    }
    
    // Check if financial data is fully loaded
    if (!financialDataCache.profileData || !financialDataCache.incomesData || !financialDataCache.billsData || !financialDataCache.expensesData || !user) {
      toast.error("Financial data is not fully loaded");
      return;
    }
    
    try {
      // Create a deep copy of the current financial data to apply adjustments
      const currentBalance = financialDataCache.profileData.currentBalance;
      const incomes = [...financialDataCache.incomesData];
      const bills = [...financialDataCache.billsData];
      const expenses = [...financialDataCache.expensesData];
      const balanceAdjustments: any[] = [];
      
      // Calculate days based on forecastPeriod
      let forecastDays = 90;
      if (forecastPeriod === "1m") forecastDays = 30;
      else if (forecastPeriod === "3m") forecastDays = 90;
      else if (forecastPeriod === "6m") forecastDays = 180;
      else if (forecastPeriod === "12m") forecastDays = 365;
      
      // Apply income adjustment
      if (incomeAdjustment !== 0) {
        incomes.forEach(income => {
          income.amount = income.amount * (1 + incomeAdjustment / 100);
        });
      }
      
      // Apply expenses adjustment
      if (expensesAdjustment !== 0) {
        bills.forEach(bill => {
          bill.amount = bill.amount * (1 + expensesAdjustment / 100);
        });
        expenses.forEach(expense => {
          expense.amount = expense.amount * (1 + expensesAdjustment / 100);
        });
      }
      
      // Add monthly savings if specified
      if (savingsAdjustment > 0) {
        // Create a recurring monthly expense for savings
        const today = new Date();
        const saveId = `scenario-savings-${Date.now()}`;
        
        bills.push({
          id: saveId,
          name: "Monthly Savings",
          amount: savingsAdjustment,
          dueDate: today.toISOString(),
          category: "Savings",
          isRecurring: true,
          frequency: "monthly",
          isPaid: false,
          autoPay: false,
          createdAt: today.toISOString(),
          updatedAt: today.toISOString(),
          userId: user.uid
        });
      }
      
      // Add one-time unexpected expense if specified
      if (unexpectedExpense > 0) {
        // Set the expense date to 2 weeks from now if not specified
        const expenseDate = unexpectedExpenseDate || new Date();
        if (!unexpectedExpenseDate) {
          expenseDate.setDate(expenseDate.getDate() + 14);
        }
        
        expenses.push({
          id: `scenario-expense-${Date.now()}`,
          name: "Unexpected Expense",
          amount: unexpectedExpense,
          date: expenseDate.toISOString(),
          category: "Miscellaneous",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isPlanned: true,
          userId: user.uid
        });
      }
      
      // Generate the scenario forecast using the memoized generator
      const scenarioForecast = generateForecast(
        currentBalance,
        incomes,
        bills,
        expenses,
        balanceAdjustments,
        forecastDays
      );
      
      if (!scenarioForecast || scenarioForecast.length === 0) {
        throw new Error("Failed to generate scenario forecast");
      }
      
      // Update scenario forecast state
      setScenarioForecast(scenarioForecast);
      
      // Process scenario monthly breakdown
      const scenarioData = processForecastData(scenarioForecast);
      
      // Calculate scenario monthly breakdown
      const scenarioMonths: Record<string, MonthlyForecast> = {};
      
      // Initialize with current breakdown data
      monthlyBreakdown.forEach(month => {
        scenarioMonths[month.month] = {
          ...month,
          scenarioIncome: 0,
          scenarioExpenses: 0,
          scenarioNetCashFlow: 0
        };
      });
      
      // Fill in data from the scenario forecast
      scenarioForecast.forEach(item => {
        const itemDate = new Date(item.date);
        const monthKey = itemDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        // Skip if not in our existing months
        if (!scenarioMonths[monthKey]) return;
        
        if (item.type === 'income') {
          scenarioMonths[monthKey].scenarioIncome = (scenarioMonths[monthKey].scenarioIncome || 0) + item.amount;
        } else if (item.type === 'bill' || item.type === 'expense') {
          scenarioMonths[monthKey].scenarioExpenses = (scenarioMonths[monthKey].scenarioExpenses || 0) + Math.abs(item.amount);
        }
      });
      
      // Calculate scenario net cash flow
      Object.keys(scenarioMonths).forEach(key => {
        if (scenarioMonths[key].scenarioIncome !== undefined && scenarioMonths[key].scenarioExpenses !== undefined) {
          scenarioMonths[key].scenarioNetCashFlow = 
            scenarioMonths[key].scenarioIncome - scenarioMonths[key].scenarioExpenses;
        }
      });
      
      // Update monthly breakdown with scenario data
      setMonthlyBreakdown(Object.values(scenarioMonths));
      
      toast.success("Scenario applied successfully!");
    } catch (error) {
      console.error("Error applying scenario:", error);
      toast.error("Failed to apply scenario. Please try again.");
    }
  }, [
    forecastData, 
    financialDataCache, 
    user, 
    forecastPeriod, 
    incomeAdjustment, 
    expensesAdjustment, 
    savingsAdjustment, 
    unexpectedExpense, 
    unexpectedExpenseDate, 
    monthlyBreakdown,
    generateForecast,
    processForecastData
  ]);

  // Handle forecast period change
  const handlePeriodChange = useCallback((value: string) => {
    if (value === "1m" || value === "3m" || value === "6m" || value === "12m") {
      setForecastPeriod(value);
    }
  }, []);

  // Render loading state
  if (authLoading || isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <LoadingSpinner size="lg" />
          <span className="ml-2 text-lg">Generating forecast...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto py-6 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Forecast</h1>
            <p className="text-muted-foreground">
              View projections and plan for your financial future
            </p>
          </div>
          <div className="flex space-x-2">
            <Select value={forecastPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Forecast Period" />
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
        
        {/* Top Section: Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Available */}
          <SummaryCard 
            title="Current Available"
            value={forecastSummary.currentAvailable}
            icon={<Wallet className="mr-2 h-4 w-4 text-muted-foreground" />}
            description="Current balance minus savings committed to goals"
          />
          
          {/* Projected Income */}
          <SummaryCard 
            title="Projected Income"
            value={forecastSummary.projectedIncome}
            icon={<ArrowUp className="mr-2 h-4 w-4 text-green-500" />}
            description={`Expected income over the next ${forecastPeriod === "1m" ? "month" : 
               forecastPeriod === "3m" ? "3 months" : 
               forecastPeriod === "6m" ? "6 months" : "year"}`}
          />
          
          {/* Projected Expenses */}
          <SummaryCard 
            title="Projected Expenses"
            value={forecastSummary.projectedExpenses}
            icon={<ArrowDown className="mr-2 h-4 w-4 text-red-500" />}
            description={`Expected expenses over the next ${forecastPeriod === "1m" ? "month" : 
               forecastPeriod === "3m" ? "3 months" : 
               forecastPeriod === "6m" ? "6 months" : "year"}`}
          />
          
          {/* Projected Available */}
          <SummaryCard 
            title="Projected Available"
            value={forecastSummary.projectedAvailable}
            icon={<CircleDollarSign className="mr-2 h-4 w-4 text-blue-500" />}
            description="Current + Income - Expenses"
          />
        </div>
      
        {/* Middle Section: Cash Flow Graph */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Cash Flow Projection</CardTitle>
            <CardDescription>
              Projected account balance over {forecastPeriod === "1m" ? "the next month" : 
                forecastPeriod === "3m" ? "the next 3 months" : 
                forecastPeriod === "6m" ? "the next 6 months" : "the next 12 months"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            {forecastData.length > 0 ? (
              <ForecastChart 
                baselineData={forecastData} 
                scenarioData={isSimulationMode ? scenarioForecast : undefined}
                timeFrame={forecastPeriod}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-lg font-medium">No forecast data available</p>
                <p className="text-sm text-muted-foreground">
                  Add some recurring income and expenses to see a forecast.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Bottom Section: Monthly Breakdown and Scenario Simulation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Widget: Monthly Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Breakdown</CardTitle>
              <CardDescription>Net cash flow for the next 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyBreakdownSection data={monthlyBreakdown} />
            </CardContent>
          </Card>
          
          {/* Right Widget: Scenario Simulation Tool */}
          <Card>
            <CardHeader>
              <CardTitle>Scenario Simulation</CardTitle>
              <CardDescription>
                Simulate changes to your financial situation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="simulation-mode">Enable Simulation Mode</Label>
                  <Switch 
                    id="simulation-mode" 
                    checked={isSimulationMode}
                    onCheckedChange={(checked) => {
                      setIsSimulationMode(checked);
                      if (checked && !scenarioForecast.length) {
                        applyScenario();
                      }
                    }}
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="scenario-name">Scenario Name</Label>
                    <Input 
                      id="scenario-name" 
                      value={scenarioName} 
                      onChange={e => setScenarioName(e.target.value)}
                      disabled={!isSimulationMode}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="income-adjustment">
                      Income Adjustment (%)
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input 
                        id="income-adjustment" 
                        type="number" 
                        value={incomeAdjustment} 
                        onChange={(e) => setIncomeAdjustment(Number(e.target.value))}
                        disabled={!isSimulationMode}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="expenses-adjustment">
                      Expenses Adjustment (%)
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input 
                        id="expenses-adjustment" 
                        type="number" 
                        value={expensesAdjustment} 
                        onChange={(e) => setExpensesAdjustment(Number(e.target.value))}
                        disabled={!isSimulationMode}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="savings-increase">
                      Monthly Savings Increase ($)
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input 
                        id="savings-increase" 
                        type="number" 
                        value={savingsAdjustment} 
                        onChange={(e) => setSavingsAdjustment(Number(e.target.value))}
                        disabled={!isSimulationMode}
                      />
                      <span className="text-sm text-muted-foreground">$</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="unexpected-expense">
                      One-time Unexpected Expense ($)
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input 
                        id="unexpected-expense" 
                        type="number" 
                        value={unexpectedExpense} 
                        onChange={(e) => setUnexpectedExpense(Number(e.target.value))}
                        disabled={!isSimulationMode}
                      />
                      <span className="text-sm text-muted-foreground">$</span>
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={applyScenario} 
                  disabled={!isSimulationMode}
                  className="w-full"
                >
                  Apply Scenario
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
