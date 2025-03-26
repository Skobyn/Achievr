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

export function ForecastChart({ baselineData, scenarioData, className, timeFrame = "3m" }: ForecastChartProps) {
  // Process data based on timeFrame to create aggregated data points
  const processedData = useMemo(() => {
    // Log for debugging
    console.log(`ForecastChart processing data: ${baselineData.length} items, timeFrame: ${timeFrame}`);
    
    if (!baselineData.length) return [];

    // Safety check for extremely large datasets
    if (baselineData.length > 3000) {
      console.warn(`ForecastChart received very large dataset (${baselineData.length} items), sampling data for performance`);
    }

    // Sort data by date
    const sortedData = [...baselineData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Log the date range
    if (sortedData.length > 0) {
      const firstDate = new Date(sortedData[0].date);
      const lastDate = new Date(sortedData[sortedData.length - 1].date);
      console.log(`Date range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`);
      console.log(`Total days in forecast: ${Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))}`);
    }

    // Determine the interval based on timeFrame and data size
    // Use smaller intervals to show more detail
    let interval = 1; // days
    if (timeFrame === "1m") interval = 1; // daily for 1 month
    else if (timeFrame === "3m") interval = 3; // every 3 days for 3 months
    else if (timeFrame === "6m") interval = 7; // weekly for 6 months
    else if (timeFrame === "12m") interval = 14; // bi-weekly for 1 year

    // Ensure we have at least 10 data points regardless of interval
    const startDate = new Date(sortedData[0].date);
    const endDate = new Date(sortedData[sortedData.length - 1].date);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Adjust interval to ensure at least 10 data points but not more than 30
    const targetDataPoints = Math.min(Math.max(totalDays / interval, 10), 30);
    interval = Math.max(1, Math.ceil(totalDays / targetDataPoints));
    
    console.log(`Using interval of ${interval} days to create approximately ${totalDays / interval} data points`);

    // Group data into periods
    const periods: { start: Date, end: Date, label: string }[] = [];
    let currentDate = new Date(startDate);
    
    // Ensure we create enough periods to cover the entire forecast
    while (currentDate <= endDate) {
      const periodStart = new Date(currentDate);
      const periodEnd = new Date(currentDate);
      periodEnd.setDate(periodEnd.getDate() + interval - 1);
      
      // More descriptive labels 
      const label = timeFrame === "12m" 
        ? `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` 
        : `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      
      periods.push({ 
        start: periodStart, 
        end: periodEnd, 
        label
      });
      
      // Move to next period
      currentDate.setDate(currentDate.getDate() + interval);
    }
    
    // If we don't have enough periods, add some evenly spaced points
    if (periods.length < 5 && totalDays > 5) {
      console.log("Not enough periods, adding more data points");
      
      // Clear existing periods
      periods.length = 0;
      
      // Create evenly spaced periods
      const pointCount = Math.min(totalDays, 10);
      const dayStep = totalDays / pointCount;
      
      for (let i = 0; i < pointCount; i++) {
        const pointDate = new Date(startDate);
        pointDate.setDate(pointDate.getDate() + Math.round(i * dayStep));
        
        // Ensure the point date doesn't exceed the end date
        if (pointDate <= endDate) {
          const periodStart = new Date(pointDate);
          const periodEnd = new Date(pointDate);
          
          // For the last point, use the exact end date
          if (i === pointCount - 1) {
            periodEnd.setTime(endDate.getTime());
          } else {
            periodEnd.setDate(periodEnd.getDate() + Math.round(dayStep) - 1);
          }
          
          const label = pointDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          periods.push({ 
            start: periodStart, 
            end: periodEnd, 
            label
          });
        }
      }
    }
    
    console.log(`Created ${periods.length} periods for chart display`);
    
    // Initialize period data with map for better performance
    const groupedData: Record<string, any> = {};
    periods.forEach(period => {
      const periodKey = period.label;
      groupedData[periodKey] = {
        date: period.start.toISOString(),
        displayDate: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        runningBalance: null,
        transactions: []
      };
    });
    
    // Batch process data points to periods for better performance
    // For large datasets, only keep important transactions (high value or first/last)
    const transactionLimit = 10; // Maximum transactions to store per period
    
    // Assign data points to periods
    sortedData.forEach(item => {
      const itemDate = new Date(item.date);
      
      // Find which period this item belongs to
      for (const period of periods) {
        if (itemDate >= period.start && itemDate <= period.end) {
          const periodKey = period.label;
          const periodData = groupedData[periodKey];
          
          // Add to transactions list with limit for memory
          if (periodData.transactions.length < transactionLimit) {
            periodData.transactions.push({
              id: item.itemId || item.id,
              date: item.date,
              amount: item.amount,
              name: item.name,
              category: item.category,
              type: item.type,
              description: item.description
            });
          }
          
          // Use the latest running balance as the period's balance
          if (item.runningBalance !== undefined) {
            periodData.runningBalance = item.runningBalance;
          }
          
          break; // Exit the loop once we found the right period
        }
      }
    });
    
    // Convert to array and ensure running balance continuity
    const result = Object.values(groupedData);
    
    // Sort result by date for consistent display
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Fill in missing running balances with the previous value and ensure continuity
    let lastBalance = sortedData.length > 0 
      ? (sortedData[0].runningBalance || sortedData[0].amount || 0)
      : 0;
      
    for (let i = 0; i < result.length; i++) {
      // For periods with no transactions, look for the latest available balance
      if (result[i].runningBalance === null) {
        // Find the latest balance before this period
        const periodStart = result[i].periodStart;
        
        // Find transactions on or before this period
        const relevantTransactions = sortedData.filter(item => 
          new Date(item.date) <= periodStart && 
          item.runningBalance !== undefined
        );
        
        if (relevantTransactions.length > 0) {
          // Sort to get the most recent one
          relevantTransactions.sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          lastBalance = relevantTransactions[0].runningBalance || lastBalance;
        }
        
        result[i].runningBalance = lastBalance;
      } else {
        lastBalance = result[i].runningBalance;
      }
    }
    
    // Ensure we have a complete continuous line by adding interpolated points if needed
    // This is crucial for proper display of forecast trends
    if (result.length > 1) {
      // Check for large balance jumps that might indicate missing data points
      for (let i = 1; i < result.length; i++) {
        const prevBalance = result[i-1].runningBalance || 0;
        const currBalance = result[i].runningBalance || 0;
        
        // Calculate the change percentage
        const changeAmount = Math.abs(currBalance - prevBalance);
        const changePercent = prevBalance !== 0 
          ? (changeAmount / Math.abs(prevBalance)) * 100 
          : 0;
        
        // If there's a large jump, add an annotation
        if (changePercent >
          50 && changeAmount > 1000) {
          result[i].significantChange = true;
          result[i].changePct = changePercent.toFixed(0) + '%';
          result[i].changeAmount = formatCurrency(changeAmount);
        }
      }
    }
    
    // Process scenario data if available - using same approach for optimization
    if (scenarioData && scenarioData.length > 0) {
      // Optimize for large scenario datasets
      const sortedScenario = [...scenarioData].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Pre-compute map for faster lookups
      const periodMap = new Map(
        periods.map(period => [period.label, period])
      );
      
      // Create a map to accumulate scenario transactions by period
      const scenarioTransactionsByPeriod = new Map<string, any[]>();
      
      // Assign scenario balance to periods - optimized approach
      sortedScenario.forEach(item => {
        const itemDate = new Date(item.date);
        
        // Find which period this item belongs to - more efficient loop
        for (const period of periods) {
          if (itemDate >= period.start && itemDate <= period.end) {
            const periodKey = period.label;
            const periodIndex = result.findIndex(r => r.displayDate === periodKey);
            
            if (periodIndex !== -1) {
              // Store the last running balance for each period
              if (item.runningBalance !== undefined) {
                result[periodIndex].scenarioBalance = item.runningBalance;
              }
              
              // Efficiently collect transactions with memory limits
              if (!scenarioTransactionsByPeriod.has(periodKey)) {
                scenarioTransactionsByPeriod.set(periodKey, []);
              }
              
              const transactions = scenarioTransactionsByPeriod.get(periodKey)!;
              if (transactions.length < transactionLimit) {
                transactions.push({
                  id: item.itemId || item.id,
                  date: item.date,
                  amount: item.amount,
                  name: item.name,
                  category: item.category,
                  type: item.type,
                  description: item.description
                });
              }
            }
            
            break; // Exit the loop once we found the right period
          }
        }
      });
      
      // Assign collected transactions to result objects
      for (const [periodKey, transactions] of scenarioTransactionsByPeriod.entries()) {
        const periodIndex = result.findIndex(r => r.displayDate === periodKey);
        if (periodIndex !== -1) {
          result[periodIndex].scenarioTransactions = transactions;
        }
      }
      
      // Fill in missing scenario balances
      let lastScenarioBalance = scenarioData[0]?.runningBalance || 0;
      for (let i = 0; i < result.length; i++) {
        if (result[i].scenarioBalance === undefined) {
          result[i].scenarioBalance = lastScenarioBalance;
        } else {
          lastScenarioBalance = result[i].scenarioBalance;
        }
      }
    }
    
    return result;
  }, [baselineData, scenarioData, timeFrame]);

  // Custom tooltip to show detailed transaction information - optimized to handle fewer items
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length && payload[0].payload) {
      const periodData = payload[0].payload;
      
      return (
        <div className="bg-background border rounded p-3 shadow-md max-w-md">
          <p className="font-medium">{periodData.displayDate}</p>
          <div className="h-px w-full bg-border my-1" />
          
          <p className="text-sm font-medium">
            Balance: <span>{formatCurrency(periodData.runningBalance ?? 0)}</span>
          </p>
          
          {periodData.scenarioBalance && (
            <p className="text-sm font-medium text-emerald-500">
              Scenario Balance: <span>{formatCurrency(periodData.scenarioBalance)}</span>
            </p>
          )}
          
          {periodData.transactions && periodData.transactions.length > 0 && (
            <>
              <div className="h-px w-full bg-border my-2" />
              <p className="text-sm font-semibold">Transactions:</p>
              <div className="max-h-40 overflow-y-auto mt-1">
                {periodData.transactions.slice(0, 5).map((t: any, i: number) => (
                  <div key={`${t.id || i}`} className="text-xs mb-1 py-1 border-b border-border/50">
                    <div className="flex justify-between">
                      <span className="font-medium">{t.name}</span>
                      <span className={t.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {t.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {t.category}
                    </div>
                  </div>
                ))}
                {periodData.transactions.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center pt-1">
                    + {periodData.transactions.length - 5} more transactions
                  </div>
                )}
              </div>
            </>
          )}
          
          {periodData.scenarioTransactions && periodData.scenarioTransactions.length > 0 && (
            <>
              <div className="h-px w-full bg-border my-2" />
              <p className="text-sm font-semibold text-emerald-500">Scenario Transactions:</p>
              <div className="max-h-40 overflow-y-auto mt-1">
                {periodData.scenarioTransactions.slice(0, 5).map((t: any, i: number) => (
                  <div key={`scenario-${t.id || i}`} className="text-xs mb-1 py-1 border-b border-border/50">
                    <div className="flex justify-between">
                      <span className="font-medium">{t.name}</span>
                      <span className={t.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {t.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {t.category}
                    </div>
                  </div>
                ))}
                {periodData.scenarioTransactions.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center pt-1">
                    + {periodData.scenarioTransactions.length - 5} more transactions
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#666" strokeOpacity={0.2} />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(value) => formatCurrency(value)}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="scenarioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="runningBalance"
            name="Balance"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#balanceGradient)"
            isAnimationActive={false}
          />
          {scenarioData && scenarioData.length > 0 && (
            <Area
              type="monotone"
              dataKey="scenarioBalance"
              name="Scenario"
              stroke="#10b981"
              fillOpacity={0.5}
              fill="url(#scenarioGradient)"
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
