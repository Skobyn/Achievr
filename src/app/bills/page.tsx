"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, BarChart3, Clock, Search, CalendarDays, Filter, Plus, Wallet, CircleDollarSign, CheckCircle, CalendarClock, CreditCard, BarChart4, List, AlertCircle } from "lucide-react";
import { useAuth } from "@/providers/firebase-auth-provider";
import { useBills, useExpenses } from "@/hooks/use-financial-data";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, daysUntil, isOverdue } from "@/utils/financial-utils";
import { Separator } from "@/components/ui/separator";
import { SetupGuide } from "@/components/onboarding/setup-guide";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import BillForm from "@/components/forms/bill-form";
import { Bill, Expense } from "@/types/financial";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BulkBillsEditor } from "@/components/forms/bulk-bills-editor";
import { toast } from "sonner";
import { format } from "date-fns";
import { BillsCalendar } from "@/components/calendar/bills-calendar";

const FREQUENCY_LABEL: Record<string, string> = {
  once: "One Time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannually: "Semi-Annually",
  annually: "Annually",
};

export default function BillsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { bills, loading: billsLoading, addBill, updateBill, deleteBill, markBillAsPaid } = useBills();
  const { expenses, loading: expensesLoading, addExpense, updateExpense, deleteExpense } = useExpenses();

  const [activeTab, setActiveTab] = useState("bills");
  const [filterText, setFilterText] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const [currentView, setCurrentView] = useState<"list" | "calendar">("list");
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [setupGuideStep, setSetupGuideStep] = useState<"bills" | "expenses">("bills");
  
  // Dialog states
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [currentBill, setCurrentBill] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<string | null>(null);
  const [billToPay, setBillToPay] = useState<string | null>(null);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkEditorType, setBulkEditorType] = useState<"bills" | "expenses">("bills");

  // Filter the bills based on user input and settings
  const filteredBills = bills.filter(bill => {
    // Apply text filter
    const matchesFilter = !filterText || 
      bill.name.toLowerCase().includes(filterText.toLowerCase()) || 
      bill.category.toLowerCase().includes(filterText.toLowerCase());
    
    // Apply paid/unpaid filter
    const matchesPaidStatus = showPaid || !bill.isPaid;
    
    return matchesFilter && matchesPaidStatus;
  }).sort((a, b) => {
    // Sort by due date (ascending)
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
  
  // Filter the expenses similarly
  const filteredExpenses = expenses.filter(expense => {
    return !filterText || 
      expense.name.toLowerCase().includes(filterText.toLowerCase()) || 
      expense.category.toLowerCase().includes(filterText.toLowerCase());
  }).sort((a, b) => {
    // Sort by date (most recent first)
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Convert expenses to bill-like format for combined display
  const expensesAsBills = filteredExpenses.map(expense => ({
    id: expense.id,
    name: expense.name,
    amount: expense.amount,
    dueDate: expense.date, // Use expense date as due date
    isPaid: true, // Treat expenses as "paid" since they've already occurred
    paidDate: expense.date,
    frequency: 'once' as const,
    category: expense.category,
    isRecurring: false,
    autoPay: false,
    userId: expense.userId,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    isExpense: true, // Flag to identify this as an expense
  }));

  // Combine bills and expenses for unified display
  const combinedItems = [...filteredBills, ...expensesAsBills].sort((a, b) => {
    // Sort by due date (ascending)
    const dateA = new Date(a.dueDate);
    const dateB = new Date(b.dueDate);
    return dateA.getTime() - dateB.getTime();
  });

  // Open setup guide with correct step
  const handleOpenSetupGuide = (step: "bills" | "expenses") => {
    setSetupGuideStep(step);
    setShowSetupGuide(true);
  };

  // Handle adding a new bill
  const handleAddBill = (values: any) => {
    console.log("Adding new bill:", values);
    addBill(values);
    setBillDialogOpen(false);
  };

  // Handle editing a bill
  const handleEditBill = (bill: Bill) => {
    setCurrentBill(bill);
    setBillDialogOpen(true);
  };

  // Handle bill deletion
  const handleDeleteBill = (id: string) => {
    setBillToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteBill = async () => {
    if (billToDelete) {
      await deleteBill(billToDelete);
      setDeleteDialogOpen(false);
      setBillToDelete(null);
    }
  };

  // Handle bill payment
  const handlePayBill = (id: string) => {
    setBillToPay(id);
    setPayDialogOpen(true);
  };

  const confirmPayBill = async () => {
    if (billToPay) {
      await markBillAsPaid(billToPay);
      setPayDialogOpen(false);
      setBillToPay(null);
    }
  };

  // Handle bulk add/edit of bills
  const handleBulkBills = () => {
    setBulkEditorType("bills");
    setBulkEditorOpen(true);
  };

  // Handle bulk add/edit of expenses
  const handleBulkExpenses = () => {
    setBulkEditorType("expenses");
    setBulkEditorOpen(true);
  };

  // Save bulk edited items
  const handleSaveBulkItems = async (items: any[]) => {
    try {
      if (bulkEditorType === "bills") {
        // Process bills
        for (const bill of items) {
          if (bill.id) {
            // Update existing bill
            const processedValues = {
              ...bill,
              id: bill.id,
              dueDate: bill.dueDate,
              endDate: bill.endDate ? bill.endDate.toISOString() : undefined,
              amount: Number(bill.amount),
              isRecurring: bill.frequency !== 'once',
            };
            await updateBill(processedValues);
          } else {
            // Add new bill
            await addBill(bill);
          }
        }
        toast.success(`${items.length} bills saved successfully`);
      } else {
        // Process expenses
        for (const expense of items) {
          if (expense.id) {
            // Update existing expense
            await updateExpense({...expense, id: expense.id});
          } else {
            // Add new expense
            await addExpense(expense);
          }
        }
        toast.success(`${items.length} expenses saved successfully`);
      }
      setBulkEditorOpen(false);
    } catch (error) {
      console.error("Error saving bulk items:", error);
      toast.error("Failed to save all items. Please try again.");
    }
  };

  // Use useEffect to redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
    }
  }, [authLoading, user, router]);

  if (authLoading || billsLoading || expensesLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <LoadingSpinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bills & Expenses</h1>
            <p className="text-muted-foreground">
              Manage your recurring bills and one-time expenses
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-[150px] sm:w-[200px]"
            />
            <Button variant="outline" onClick={() => setShowPaid(!showPaid)}>
              {showPaid ? "Hide Paid" : "Show Paid"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenSetupGuide("bills")}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Add Bill
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/bills/expenses")}>
                  <CircleDollarSign className="h-4 w-4 mr-2" />
                  Add Expense
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBulkBills}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Bulk Add Bills
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBulkExpenses}>
                  <BarChart4 className="h-4 w-4 mr-2" />
                  Bulk Add Expenses
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="list">
              <List className="h-4 w-4 mr-2" />
              List View
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Calendar View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Bills & Expenses</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleBulkExpenses}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Multiple
                    </Button>
                    <Button onClick={() => router.push('/bills/expenses')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Manage your recurring bills and one-time expenses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {combinedItems.length === 0 ? (
                  <div className="text-center py-10">
                    <CreditCard className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
                    <h3 className="mt-4 text-lg font-semibold">No bills found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {filterText ? "Try a different search term" : "Add your first bill to get started"}
                    </p>
                    {!filterText && (
                      <Button
                        variant="link"
                        onClick={() => handleOpenSetupGuide("bills")}
                        className="mt-2"
                      >
                        Add your first bill
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {combinedItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          isOverdue(item.dueDate) && !item.isPaid
                            ? "border-red-200 bg-red-50"
                            : daysUntil(item.dueDate) <= 3 && !item.isPaid
                            ? "border-amber-200 bg-amber-50"
                            : item.isPaid
                            ? "border-green-200 bg-green-50"
                            : ""
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{item.name}</p>
                            {item.isPaid && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                Paid
                              </Badge>
                            )}
                            {isOverdue(item.dueDate) && !item.isPaid && (
                              <Badge variant="destructive">Overdue</Badge>
                            )}
                            {daysUntil(item.dueDate) <= 3 && !item.isPaid && !isOverdue(item.dueDate) && (
                              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                Soon
                              </Badge>
                            )}
                            {item.autoPay && (
                              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                Auto-Pay
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              <span>
                                {item.isPaid
                                  ? `Paid on ${formatDate(item.paidDate || item.dueDate)}`
                                  : `Due ${formatDate(item.dueDate)} (${daysUntil(item.dueDate)})`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{FREQUENCY_LABEL[item.frequency] || item.frequency}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <BarChart3 className="h-3 w-3" />
                              <span>{item.category}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-medium">
                            {formatCurrency(item.amount)}
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Filter className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!item.isPaid && (
                                <DropdownMenuItem onClick={() => handlePayBill(item.id)}>
                                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleEditBill(item as Bill)}>
                                <CalendarIcon className="h-4 w-4 mr-2 text-blue-500" />
                                Edit Bill
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteBill(item.id)}>
                                <Wallet className="h-4 w-4 mr-2 text-red-500" />
                                Delete Bill
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Monthly Calendar View</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleBulkExpenses}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Multiple
                    </Button>
                    <Button onClick={() => router.push('/bills/expenses')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  View your bills and expenses on a calendar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BillsCalendar 
                  bills={filteredBills} 
                  expenses={filteredExpenses}
                  onBillClick={handleEditBill}
                  onExpenseClick={(expense) => router.push(`/bills/expenses?id=${expense.id}`)}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Bill Form Dialog */}
        <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <BillForm
              bill={currentBill || undefined}
              onSubmit={values => {
                if (currentBill) {
                  // Ensure frequency is of valid type
                  const frequency = values.frequency as 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
                  
                  // Convert Date object to ISO string format for dueDate
                  const processedValues = {
                    ...values,
                    id: currentBill.id,
                    dueDate: values.dueDate.toISOString(),
                    endDate: values.endDate ? values.endDate.toISOString() : undefined,
                    amount: Number(values.amount),
                    isRecurring: values.frequency !== 'once',
                    frequency
                  };
                  updateBill(processedValues);
                } else {
                  // Ensure frequency is of valid type
                  const frequency = values.frequency as 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
                  
                  // Convert Date object to ISO string format for dueDate
                  const processedValues = {
                    ...values,
                    dueDate: values.dueDate.toISOString(),
                    endDate: values.endDate ? values.endDate.toISOString() : undefined,
                    amount: Number(values.amount),
                    isRecurring: values.frequency !== 'once',
                    frequency
                  };
                  addBill(processedValues);
                }
                setBillDialogOpen(false);
                setCurrentBill(null);
              }}
              onCancel={() => {
                setBillDialogOpen(false);
                setCurrentBill(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Setup Guide Dialog */}
        <Dialog open={showSetupGuide} onOpenChange={setShowSetupGuide}>
          <DialogContent className="sm:max-w-[600px]">
            <SetupGuide onClose={() => setShowSetupGuide(false)} />
          </DialogContent>
        </Dialog>

        {/* Delete Bill Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Bill</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this bill? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteBill}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Pay Bill Confirmation */}
        <AlertDialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as Paid</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this bill as paid? For recurring bills, a new bill will be created based on the frequency.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPayBill}>Mark as Paid</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Editor Dialog */}
        <Dialog open={bulkEditorOpen} onOpenChange={setBulkEditorOpen}>
          <DialogContent className="sm:max-w-[95vw] max-h-[95vh] overflow-y-auto">
            <BulkBillsEditor
              type={bulkEditorType}
              onSave={handleSaveBulkItems}
              onCancel={() => setBulkEditorOpen(false)}
              existingItems={bulkEditorType === "bills" ? filteredBills : filteredExpenses}
            />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
