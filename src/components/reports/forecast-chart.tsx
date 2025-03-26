import React, { useMemo } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { formatCurrency } from "@/utils/financial-utils";
import { ForecastItem } from "@/types/financial";

interface ForecastChartProps {
  baselineData: ForecastItem[];
  scenarioData?: ForecastItem[];
  className?: string;
  timeFrame?: "1m" | "3m" | "6m" | "12m";
}

// Separate the tooltip into its own memoized component
const CustomTooltip = React.memo(({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  const hasScenario = payload.length > 1 && payload[1].dataKey === 'scenarioRunningBalance';
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200 max-w-md">
      <h3 className="font-bold text-gray-900 mb-2">{data.displayDate}</h3>
      
      <div className="space-y-4">
        {/* Starting Balance */}
        <div>
          <p className="text-sm font-medium text-gray-600">Starting Balance</p>
          <p className="text-base font-semibold">
            {formatCurrency(data.startingBalance || 0)}
          </p>
        </div>
        
        {/* Income Entries */}
        {data.transactions?.income?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-green-600">Income Entries</p>
            <ul className="space-y-1 mt-1">
              {data.transactions.income.map((item: any, index: number) => (
                <li key={index} className="text-sm flex justify-between">
                  <span className="text-gray-700">{item.name}</span>
                  <span className="text-green-600 font-medium">+{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Expense Entries */}
        {data.transactions?.expenses?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-red-600">Expense Entries</p>
            <ul className="space-y-1 mt-1">
              {data.transactions.expenses.map((item: any, index: number) => (
                <li key={index} className="text-sm flex justify-between">
                  <span className="text-gray-700">{item.name}</span>
                  <span className="text-red-600 font-medium">-{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Ending Balance */}
        <div className="pt-2 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-600">Ending Balance</p>
          <p className="text-base font-bold text-blue-600">
            {formatCurrency(data.runningBalance || 0)}
          </p>
        </div>
        
        {/* Scenario Data if available */}
        {hasScenario && (
          <div className="pt-2 border-t border-gray-200 mt-2">
            <p className="text-sm font-medium text-purple-600">Scenario Balance</p>
            <p className="text-base font-bold text-purple-600">
              {formatCurrency(data.scenarioRunningBalance || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Difference: {formatCurrency((data.scenarioRunningBalance || 0) - (data.runningBalance || 0))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

// Define proper types for our data processing
interface ChartPeriod {
  start: Date;
  end: Date;
  label: string;
}

interface ChartTransaction {
  id: string;
  date: string;
  amount: number;
  name: string;
  category: string;
  type: string;
  description?: string;
}

interface TransactionGroup {
  income: ChartTransaction[];
  expenses: ChartTransaction[];
}

interface PeriodData {
  date: string;
  displayDate: string;
  periodStart: Date;
  periodEnd: Date;
  runningBalance: number | null;
  scenarioRunningBalance?: number | null;
  transactions: TransactionGroup;
  scenarioTransactions?: TransactionGroup;
  startingBalance: number | null;
}

// Use React.memo to prevent unnecessary rerenders
export const ForecastChart = React.memo(({ baselineData, scenarioData, className, timeFrame = "3m" }: ForecastChartProps) => {
  // Add more detailed debugging at the start
  console.log("ForecastChart render:", { 
    baselineDataLength: baselineData.length,
    scenarioDataLength: scenarioData?.length || 0,
    timeFrame
  });
  
  if (baselineData.length === 0) {
    console.warn("ForecastChart received empty baselineData");
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-4">
          <h3 className="font-medium text-gray-600">No forecast data available</h3>
          <p className="text-sm text-gray-500 mt-1">Add income and expenses to see projections</p>
        </div>
      </div>
    );
  }
  
  // Show the date range of the input data
  if (baselineData.length > 0) {
    const dates = baselineData.map(item => new Date(item.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    console.log("ForecastChart input date range:", { 
      firstDate: minDate.toLocaleDateString(),
      lastDate: maxDate.toLocaleDateString(),
      daySpan: Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
    });
  }

  // Optimize the data processing with useMemo
  const processedData = useMemo(() => {
    if (!baselineData.length) return [];

    // Sort data by date once
    const sortedData = [...baselineData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Calculate date range once
    const startDate = new Date(sortedData[0].date);
    const endDate = new Date(sortedData[sortedData.length - 1].date);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determine optimal interval based on timeFrame
    let interval = 1; // days
    if (timeFrame === "1m") interval = 1; // daily for 1 month
    else if (timeFrame === "3m") interval = 3; // every 3 days for 3 months
    else if (timeFrame === "6m") interval = 5; // every 5 days for 6 months
    else if (timeFrame === "12m") interval = 10; // every 10 days for 1 year
    
    // Adjust interval to ensure reasonable number of data points (between 10-30)
    const targetPoints = Math.min(Math.max(totalDays / interval, 10), 30);
    interval = Math.max(1, Math.ceil(totalDays / targetPoints));
    
    // Generate time periods
    const periods: ChartPeriod[] = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const periodStart = new Date(currentDate);
      const periodEnd = new Date(currentDate);
      periodEnd.setDate(periodEnd.getDate() + interval - 1);
      
      const label = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      periods.push({
        start: periodStart,
        end: periodEnd,
        label
      });
      
      // Move to next period
      currentDate.setDate(currentDate.getDate() + interval);
    }
    
    // Prepare data structure for each period
    const groupedData: Record<string, PeriodData> = {};
    periods.forEach(period => {
      groupedData[period.label] = {
        date: period.start.toISOString(),
        displayDate: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        runningBalance: null,
        transactions: {
          income: [],
          expenses: []
        },
        startingBalance: null
      };
    });
    
    // Function to find the period for a date (memoized within this scope)
    const dateCache = new Map<number, string | null>();
    const findPeriodForDate = (date: Date): string | null => {
      const dateTime = date.getTime();
      if (dateCache.has(dateTime)) {
        return dateCache.get(dateTime) || null;
      }
      
      const period = periods.find(p => 
        date >= p.start && date <= p.end
      );
      
      if (period) {
        dateCache.set(dateTime, period.label);
        return period.label;
      }
      
      return null;
    };
    
    // Process all data items
    let lastBalance: number | null = null;
    sortedData.forEach(item => {
      const itemDate = new Date(item.date);
      const periodKey = findPeriodForDate(itemDate);
      
      if (!periodKey || !groupedData[periodKey]) return;
      
      const periodData = groupedData[periodKey];
      
      // Update balance tracking
      if (item.runningBalance !== undefined) {
        lastBalance = item.runningBalance;
        periodData.runningBalance = item.runningBalance;
      }
      
      // Set starting balance if not set
      if (periodData.startingBalance === null) {
        periodData.startingBalance = lastBalance;
      }
      
      // Add transaction to the right category
      const transaction: ChartTransaction = {
        id: item.itemId || item.id || String(Date.now()),
        date: item.date,
        amount: Math.abs(item.amount),
        name: item.name || 'Unnamed',
        category: item.category || 'General',
        type: item.type || 'unknown',
        description: item.description
      };
      
      if (item.type === 'income') {
        periodData.transactions.income.push(transaction);
      } else if (item.type === 'bill' || item.type === 'expense') {
        periodData.transactions.expenses.push(transaction);
      }
    });
    
    // Convert to array and sort
    const result = Object.values(groupedData);
    result.sort((a: PeriodData, b: PeriodData) => 
      a.periodStart.getTime() - b.periodStart.getTime()
    );
    
    // Fill in missing running balances
    for (let i = 0; i < result.length; i++) {
      if (result[i].runningBalance === null) {
        if (i > 0 && result[i-1].runningBalance !== null) {
          result[i].runningBalance = result[i-1].runningBalance;
        } else if (i === 0 && lastBalance !== null) {
          result[i].runningBalance = lastBalance;
        } else {
          // Fallback value
          result[i].runningBalance = 0;
        }
      }
      
      if (result[i].startingBalance === null) {
        result[i].startingBalance = result[i].runningBalance;
      }
    }
    
    // Process scenario data if provided
    if (scenarioData && scenarioData.length > 0) {
      const sortedScenarioData = [...scenarioData].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      let lastScenarioBalance: number | null = null;
      
      sortedScenarioData.forEach(item => {
        const itemDate = new Date(item.date);
        const periodKey = findPeriodForDate(itemDate);
        
        if (!periodKey || !groupedData[periodKey]) return;
        
        const periodData = groupedData[periodKey];
        
        // Update scenario balance tracking
        if (item.runningBalance !== undefined) {
          lastScenarioBalance = item.runningBalance;
          periodData.scenarioRunningBalance = item.runningBalance;
        }
        
        // Ensure scenario transactions exist
        if (!periodData.scenarioTransactions) {
          periodData.scenarioTransactions = {
            income: [],
            expenses: []
          };
        }
        
        // Add transaction to the right category
        const transaction: ChartTransaction = {
          id: item.itemId || item.id || String(Date.now()),
          date: item.date,
          amount: Math.abs(item.amount),
          name: item.name || 'Unnamed',
          category: item.category || 'General',
          type: item.type || 'unknown',
          description: item.description
        };
        
        if (item.type === 'income') {
          periodData.scenarioTransactions.income.push(transaction);
        } else if (item.type === 'bill' || item.type === 'expense') {
          periodData.scenarioTransactions.expenses.push(transaction);
        }
      });
      
      // Fill in missing scenario balances
      for (let i = 0; i < result.length; i++) {
        if (!result[i].scenarioRunningBalance) {
          if (i > 0 && result[i-1].scenarioRunningBalance) {
            result[i].scenarioRunningBalance = result[i-1].scenarioRunningBalance;
          } else if (i === 0 && lastScenarioBalance !== null) {
            result[i].scenarioRunningBalance = lastScenarioBalance;
          } else {
            // If no scenario balance, use the regular balance
            result[i].scenarioRunningBalance = result[i].runningBalance;
          }
        }
      }
    }
    
    // Add debug logging for processed data
    console.log("ForecastChart processed data:", {
      periodsCreated: periods.length,
      resultLength: result.length,
      firstProcessedDate: result.length > 0 ? result[0].displayDate : 'none',
      lastProcessedDate: result.length > 0 ? result[result.length - 1].displayDate : 'none'
    });
    
    return result;
  }, [baselineData, scenarioData, timeFrame]);
  
  // Add logging for the render phase
  console.log("ForecastChart rendering with:", { 
    processedDataLength: processedData.length,
    hasScenario: !!scenarioData?.length
  });

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart 
          data={processedData} 
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#666" strokeOpacity={0.2} />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(value) => {
              // Format large numbers with K/M
              if (Math.abs(value) >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
              } else if (Math.abs(value) >= 1000) {
                return `$${(value / 1000).toFixed(0)}K`;
              }
              return `$${value}`;
            }}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <defs>
            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="colorScenario" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="runningBalance"
            name="Balance"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorBalance)"
            activeDot={{ r: 6 }}
            isAnimationActive={false} // Disable animation for better performance
          />
          {scenarioData && scenarioData.length > 0 && (
            <Area
              type="monotone"
              dataKey="scenarioRunningBalance"
              name="Scenario"
              stroke="#8b5cf6"
              strokeWidth={2}
              fillOpacity={0.5}
              fill="url(#colorScenario)"
              activeDot={{ r: 6 }}
              isAnimationActive={false} // Disable animation for better performance
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
