'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, DollarSign, Trash2, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

// API Helper
const api = async (endpoint, options = {}, token = null) => {
  const headers = {}
  
  if (options.body) {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    headers['Content-Type'] = 'application/json'
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  return await response.json()
}

// Expense schema
const expenseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  amount: z.string().refine((val) => {
    const num = parseFloat(val)
    return !isNaN(num) && num > 0
  }, 'Amount must be a positive number'),
  currency: z.string().default('USD'),
  paidByUserId: z.string().min(1, 'Payer is required'),
  splitBetweenUserIds: z.array(z.string()).min(1, 'At least one person must be included'),
  incurredAt: z.string().optional(),
  note: z.string().optional()
})

export function ExpensesTab({
  trip,
  token,
  user,
  onRefresh,
  isReadOnly = false
}: any) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    currency: trip?.currency || 'USD',
    paidByUserId: user?.id || '',
    splitBetweenUserIds: [] as string[],
    incurredAt: '',
    note: ''
  })
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Get travelers for select dropdowns
  const travelers = useMemo(() => {
    if (!trip?.travelers) return []
    return trip.travelers.filter((t: any) => t.status !== 'left' && t.status !== 'removed')
  }, [trip?.travelers])

  useEffect(() => {
    if (trip?.id) {
      loadExpenses()
    }
  }, [trip?.id])

  // Initialize form with all travelers selected
  useEffect(() => {
    if (travelers.length > 0 && formData.splitBetweenUserIds.length === 0) {
      setFormData(prev => ({
        ...prev,
        splitBetweenUserIds: travelers.map((t: any) => t.userId || t.id),
        paidByUserId: user?.id || travelers[0]?.userId || travelers[0]?.id || ''
      }))
    }
  }, [travelers, user])

  const loadExpenses = async () => {
    if (!trip?.id) return
    
    setLoading(true)
    try {
      const data = await api(`/trips/${trip.id}/expenses`, { method: 'GET' }, token)
      setExpenses(data || [])
    } catch (error: any) {
      console.error('Failed to load expenses:', error)
      toast.error(error.message || 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  const handleAddExpense = async () => {
    if (isReadOnly) return
    
    // Validate form
    const validation = expenseSchema.safeParse({
      ...formData,
      amount: formData.amount,
      splitBetweenUserIds: formData.splitBetweenUserIds
    })
    
    if (!validation.success) {
      const errors: Record<string, string> = {}
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message
        }
      })
      setFormErrors(errors)
      return
    }
    
    setFormErrors({})
    setAdding(true)
    
    try {
      // Convert amount to cents (avoid float errors)
      const amountDollars = parseFloat(formData.amount)
      const amountCents = Math.round(amountDollars * 100)
      
      const payload = {
        title: formData.title,
        amountCents,
        currency: formData.currency,
        paidByUserId: formData.paidByUserId,
        splitBetweenUserIds: formData.splitBetweenUserIds,
        incurredAt: formData.incurredAt || new Date().toISOString(),
        note: formData.note || undefined
      }
      
      await api(`/trips/${trip.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token)
      
      toast.success('Expense added')
      setShowAddDialog(false)
      resetForm()
      await loadExpenses()
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add expense')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteExpense = async (expenseId: string) => {
    if (isReadOnly) return
    
    setAdding(true)
    try {
      await api(`/trips/${trip.id}/expenses?expenseId=${expenseId}`, {
        method: 'DELETE'
      }, token)
      
      toast.success('Expense deleted')
      setDeletingExpenseId(null)
      await loadExpenses()
      if (onRefresh) onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expense')
    } finally {
      setAdding(false)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      amount: '',
      currency: trip?.currency || 'USD',
      paidByUserId: user?.id || travelers[0]?.userId || travelers[0]?.id || '',
      splitBetweenUserIds: travelers.map((t: any) => t.userId || t.id),
      incurredAt: '',
      note: ''
    })
    setFormErrors({})
  }

  // Calculate totals
  const totals = useMemo(() => {
    const byPayer: Record<string, number> = {}
    const byPerson: Record<string, { paid: number; owed: number }> = {}
    
    expenses.forEach((expense) => {
      const amountDollars = expense.amountCents / 100
      const payerId = expense.paidByUserId
      const splitCount = expense.splitBetweenUserIds.length
      const perPersonShare = amountDollars / splitCount
      
      // Track by payer
      byPayer[payerId] = (byPayer[payerId] || 0) + amountDollars
      
      // Track by person
      expense.splitBetweenUserIds.forEach((userId: string) => {
        if (!byPerson[userId]) {
          byPerson[userId] = { paid: 0, owed: 0 }
        }
        byPerson[userId].owed += perPersonShare
      })
      
      if (!byPerson[payerId]) {
        byPerson[payerId] = { paid: 0, owed: 0 }
      }
      byPerson[payerId].paid += amountDollars
    })
    
    // Calculate net balances
    const balances: Record<string, number> = {}
    Object.keys(byPerson).forEach((userId) => {
      balances[userId] = byPerson[userId].paid - byPerson[userId].owed
    })
    
    const totalSpend = expenses.reduce((sum, e) => sum + (e.amountCents / 100), 0)
    
    return {
      totalSpend,
      byPayer,
      balances,
      byPerson
    }
  }, [expenses])

  // Format currency
  const formatCurrency = (amount: number) => {
    const currency = trip?.currency || 'USD'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount)
  }

  // Get traveler name
  const getTravelerName = (userId: string) => {
    const traveler = travelers.find((t: any) => (t.userId || t.id) === userId)
    return traveler?.name || traveler?.userName || 'Unknown'
  }

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  // Sort expenses: most recent first
  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const dateA = new Date(a.incurredAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.incurredAt || b.createdAt || 0).getTime()
      return dateB - dateA
    })
  }, [expenses])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-gray-500">Loading expenses...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Trip Expenses</h2>
        {!isReadOnly && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add expense
          </Button>
        )}
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">Track shared costs for this trip.</p>
            {!isReadOnly && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add expense
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total spend</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.totalSpend)}</p>
              </div>
              
              {Object.keys(totals.byPayer).length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">By payer</p>
                  <div className="space-y-1">
                    {Object.entries(totals.byPayer).map(([userId, amount]) => (
                      <div key={userId} className="flex justify-between text-sm">
                        <span>{getTravelerName(userId)}</span>
                        <span className="font-medium">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {Object.keys(totals.balances).length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Balances</p>
                  <div className="space-y-1">
                    {Object.entries(totals.balances).map(([userId, balance]) => {
                      const isPositive = balance > 0
                      const isZero = Math.abs(balance) < 0.01
                      return (
                        <div key={userId} className="flex justify-between text-sm">
                          <span>{getTravelerName(userId)}</span>
                          <span className={`font-medium ${isZero ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isZero ? 'Even' : isPositive ? `+${formatCurrency(balance)}` : formatCurrency(balance)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expenses List */}
          <div className="space-y-3">
            {sortedExpenses.map((expense) => (
              <Card key={expense._id || expense.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{expense.title}</h3>
                        <span className="text-lg font-bold">{formatCurrency(expense.amountCents / 100)}</span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Paid by {getTravelerName(expense.paidByUserId)}</p>
                        {expense.incurredAt && (
                          <p className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(expense.incurredAt)}
                          </p>
                        )}
                        {expense.splitBetweenUserIds.length > 0 && (
                          <p>
                            Split between {expense.splitBetweenUserIds.length} {expense.splitBetweenUserIds.length === 1 ? 'person' : 'people'}
                            {' '}({formatCurrency((expense.amountCents / 100) / expense.splitBetweenUserIds.length)} each)
                          </p>
                        )}
                        {expense.note && (
                          <p className="text-gray-500 italic">{expense.note}</p>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingExpenseId(expense._id || expense.id)}
                        className="ml-4"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Track a shared cost for this trip.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, title: e.target.value }))
                  setFormErrors(prev => ({ ...prev, title: '' }))
                }}
                placeholder="e.g., Dinner at restaurant"
              />
              {formErrors.title && <p className="text-sm text-red-500 mt-1">{formErrors.title}</p>}
            </div>
            
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, amount: e.target.value }))
                  setFormErrors(prev => ({ ...prev, amount: '' }))
                }}
                placeholder="0.00"
              />
              {formErrors.amount && <p className="text-sm text-red-500 mt-1">{formErrors.amount}</p>}
            </div>
            
            <div>
              <Label htmlFor="paidBy">Paid by *</Label>
              <Select
                value={formData.paidByUserId}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, paidByUserId: value }))
                  setFormErrors(prev => ({ ...prev, paidByUserId: '' }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payer" />
                </SelectTrigger>
                <SelectContent>
                  {travelers.map((traveler: any) => (
                    <SelectItem key={traveler.userId || traveler.id} value={traveler.userId || traveler.id}>
                      {traveler.name || traveler.userName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.paidByUserId && <p className="text-sm text-red-500 mt-1">{formErrors.paidByUserId}</p>}
            </div>
            
            <div>
              <Label>Split between *</Label>
              <div className="space-y-2 mt-2">
                {travelers.map((traveler: any) => {
                  const travelerId = traveler.userId || traveler.id
                  const isChecked = formData.splitBetweenUserIds.includes(travelerId)
                  return (
                    <div key={travelerId} className="flex items-center space-x-2">
                      <Checkbox
                        id={`split-${travelerId}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setFormData(prev => ({
                            ...prev,
                            splitBetweenUserIds: checked
                              ? [...prev.splitBetweenUserIds, travelerId]
                              : prev.splitBetweenUserIds.filter((id) => id !== travelerId)
                          }))
                          setFormErrors(prev => ({ ...prev, splitBetweenUserIds: '' }))
                        }}
                      />
                      <Label htmlFor={`split-${travelerId}`} className="cursor-pointer">
                        {traveler.name || traveler.userName}
                      </Label>
                    </div>
                  )
                })}
              </div>
              {formErrors.splitBetweenUserIds && <p className="text-sm text-red-500 mt-1">{formErrors.splitBetweenUserIds}</p>}
            </div>
            
            <div>
              <Label htmlFor="incurredAt">Date (optional)</Label>
              <Input
                id="incurredAt"
                type="date"
                value={formData.incurredAt}
                onChange={(e) => setFormData(prev => ({ ...prev, incurredAt: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false)
              resetForm()
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddExpense} disabled={adding}>
              {adding ? 'Adding...' : 'Add expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingExpenseId} onOpenChange={(open) => {
        if (!open) setDeletingExpenseId(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The expense will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingExpenseId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingExpenseId && handleDeleteExpense(deletingExpenseId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
