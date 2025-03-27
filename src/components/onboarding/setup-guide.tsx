"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Wallet,
  CalendarClock,
  PiggyBank,
  Target,
  TrendingUp,
  BarChart3,
  User,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFinancialProfile } from "@/hooks/use-financial-data";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/providers/supabase-auth-provider';
import { useFinancialData } from '@/hooks/use-financial-data';
import AddIncomeForm from '../forms/add-income-form';
import AddExpenseForm from '../forms/add-expense-form';
import UpdateBalanceForm from '../forms/update-balance-form';
import { addBill } from '@/services/financial-service';

interface SetupGuideProps {
  onClose?: () => void;
  onSetBalance?: (amount: number) => void;
}

type Step = {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  icon: JSX.Element;
};

export function SetupGuide({ onClose, onSetBalance }: SetupGuideProps) {
  const { toast: useToastToast } = useToast();
  const { user } = useAuth();
  const { profile, loading: profileLoading, updateBalance } = useFinancialProfile();
  const { updateFinancialBalance, addIncome, addExpense } = useFinancialData();
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState<string>("");
  const router = useRouter();
  
  // Setup state for active step
  const [activeStep, setActiveStep] = useState<string>("balance");
  const [steps, setSteps] = useState<Step[]>([
    {
      id: "balance",
      title: "Set Your Current Balance",
      description: "Start by setting your current account balance",
      isCompleted: false,
      icon: <Wallet className="h-5 w-5" />,
    },
    {
      id: "income",
      title: "Add Your Income Sources",
      description: "Add your regular income sources (salary, freelance, etc.)",
      isCompleted: false,
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      id: "expenses",
      title: "Add Your Regular Expenses",
      description: "Add your recurring expenses (rent, utilities, etc.)",
      isCompleted: false,
      icon: <CalendarClock className="h-5 w-5" />,
    },
  ]);

  // Load completed steps from localStorage
  useEffect(() => {
    const savedSteps = localStorage.getItem("setup_completed_steps");
    if (savedSteps) {
      setCompletedSteps(JSON.parse(savedSteps));
      
      // Update the step completion status
      setSteps(prevSteps => 
        prevSteps.map(step => ({
          ...step,
          isCompleted: JSON.parse(savedSteps)[step.id] === true
        }))
      );
    }
  }, []);

  // Save completed steps to localStorage
  const markStepComplete = (stepId: string) => {
    const updatedSteps = { ...completedSteps, [stepId]: true };
    setCompletedSteps(updatedSteps);
    localStorage.setItem("setup_completed_steps", JSON.stringify(updatedSteps));
    
    // Update the steps array as well
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === stepId ? { ...step, isCompleted: true } : step
      )
    );
  };

  // Handle balance update
  const handleBalanceUpdate = async (amount: number) => {
    if (!user) return;
    
    try {
      // Use the provided onSetBalance function if available, otherwise use updateFinancialBalance
      if (onSetBalance) {
        onSetBalance(amount);
      } else {
        await updateFinancialBalance(amount, 'Initial setup');
      }
      
      // Mark this step as completed
      markStepComplete("balance");
      
      // Move to next step
      setActiveStep("income");
      
      toast.success(`Balance updated to $${amount.toFixed(2)}`);
    } catch (error) {
      console.error('Error updating balance:', error);
      toast.error("Failed to update balance. Please try again.");
    }
  };

  // Handle adding income
  const handleAddIncome = async (data: any) => {
    if (!user) return;
    
    try {
      // Format the income data correctly
      const currentDate = new Date();
      const incomeData = {
        name: data.name,
        amount: data.amount,
        frequency: data.frequency || 'monthly',
        category: 'Salary', // Default category if not provided
        date: currentDate.toISOString(),
        isRecurring: data.frequency !== 'once',
        notes: data.notes || '',
      };
      
      console.log("Formatted income data for saving:", incomeData);
      await addIncome(incomeData);
      
      // Mark this step as completed
      markStepComplete("income");
      
      // Move to next step
      setActiveStep("expenses");
      
      toast.success(`${data.name} has been added to your income sources`);
    } catch (error) {
      console.error('Error adding income:', error);
      toast.error("Failed to add income. Please try again.");
    }
  };

  // Handle adding expense
  const handleAddExpense = async (data: any) => {
    if (!user) return;
    
    try {
      // Format the expense as a bill
      const billData = {
        name: data.name,
        amount: data.amount,
        frequency: data.frequency,
        category: data.category,
        dueDate: new Date().toISOString(), // Set due date to current date
        isPaid: false,
        autoPay: false,
        notes: '',
        isRecurring: data.frequency !== 'once', // Set isRecurring based on frequency
      };
      
      // Use the financial service to add a bill instead of an expense
      await addBill(billData, user.uid);
      
      // Mark this step as completed
      markStepComplete("expenses");
      
      toast.success(`${data.name} has been added to your bills`);
    } catch (error) {
      console.error('Error adding expense as bill:', error);
      toast.error("Failed to add bill. Please try again.");
    }
  };

  // Calculate progress
  const totalSteps = steps.length;
  const completedCount = steps.filter(step => step.isCompleted).length;
  const progress = (completedCount / totalSteps) * 100;

  // Render form based on active step
  const renderActiveStepForm = () => {
    switch (activeStep) {
      case "balance":
        return <UpdateBalanceForm onUpdate={handleBalanceUpdate} initialBalance={profile?.currentBalance} />;
      case "income":
        return <AddIncomeForm onAddIncome={handleAddIncome} />;
      case "expenses":
        return <AddExpenseForm onAddExpense={handleAddExpense} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Card className="w-full max-w-3xl mx-auto shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">Quick Start Guide</CardTitle>
              <CardDescription>
                Follow these steps to set up your financial profile
              </CardDescription>
            </div>
            <Badge variant="outline" className="px-3 py-1">
              {completedCount} of {totalSteps} steps completed
            </Badge>
          </div>
          <Progress value={progress} className="h-2 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step Progress Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
            {steps.map((step) => (
              <div 
                key={step.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors
                  ${activeStep === step.id ? 'border-primary bg-primary/5' : 'border-muted'}
                  ${step.isCompleted ? 'border-green-500 bg-green-500/5' : ''}
                `}
                onClick={() => setActiveStep(step.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-muted-foreground">
                    {step.isCompleted ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <p className="font-medium text-sm">{step.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          
          {/* Active Form */}
          {renderActiveStepForm()}
        </CardContent>
        
        <CardFooter className="flex justify-between border-t pt-6">
          <Button variant="outline" onClick={onClose}>
            Close Guide
          </Button>
          
          {completedCount === totalSteps && (
            <Button onClick={onClose} className="gap-2">
              Complete Setup <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Legacy Dialog for Balance Update - Kept for compatibility */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set your current balance</DialogTitle>
            <DialogDescription>
              Enter your current account balance to start tracking
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="balance">Current Balance</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <Input
                  id="balance"
                  placeholder="0.00"
                  className="pl-7"
                  type="number"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              handleBalanceUpdate(parseFloat(balanceAmount));
              setBalanceDialogOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 