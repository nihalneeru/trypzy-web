'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, DollarSign, Trash2, Calendar, ArrowRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { BrandedSpinner } from '@/app/HomeClient'

interface ExpensesOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

// API Helper
const api = async (endpoint: string, options: any = {}, token: string | null = null) => {
  const headers: any = {}

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

export function ExpensesOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: ExpensesOverlayProps) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const isReadOnly = !trip?.viewer?.isActiveParticipant || trip?.viewer?.participantStatus === 'left' || trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'

  // Get travelers for select dropdowns from participantsWithStatus
  const travelers = useMemo(() => {
    const participantsWithStatus = trip?.participantsWithStatus || []
    const activeParticipants = participantsWithStatus.filter((p: any) => {
      const status = p.status || 'active'
      return status === 'active'
    })

    return activeParticipants.map((p: any) => {
      const canonicalUserId = p.userId || p.user?.id
      if (!canonicalUserId) {
        return null
      }

      return {
        id: canonicalUserId,
        name: p.user?.name || p.name || p.userName || 'Unknown'
      }
    }).filter(Boolean)
  }, [trip?.participantsWithStatus])

  useEffect(() => {
    if (trip?.id) {
      loadExpenses()
    }
  }, [trip?.id])

  // Initialize form with all travelers selected
  useEffect(() => {
    if (travelers.length > 0 && formData.splitBetweenUserIds.length === 0) {
      const allTravelerIds = travelers.map((t: any) => t.id)
      const currentUserId = user?.id
      const defaultPaidBy = travelers.find((t: any) => t.id === currentUserId)?.id || travelers[0]?.id || ''

      setFormData(prev => ({
        ...prev,
        splitBetweenUserIds: allTravelerIds,
        paidByUserId: defaultPaidBy
      }))
    }
  }, [travelers, user])

  const loadExpenses = async () => {
    if (!trip?.id) return

    setLoading(true)
    try {
      const data = await api(`/trips/${trip.id}/expenses`, { method: 'GET' }, token)
      setExpenses(data || [])
      setError(null)
    } catch (err: any) {
      console.error('Failed to load expenses:', err)
      setError(err.message || 'Failed to load expenses')
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
      // Convert amount to cents
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
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add expense')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteExpense = async (expenseId: string) => {
    if (isReadOnly) return

    setDeleting(true)
    try {
      await api(`/trips/${trip.id}/expenses?expenseId=${expenseId}`, {
        method: 'DELETE'
      }, token)

      toast.success('Expense deleted')
      setDeletingExpenseId(null)
      await loadExpenses()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete expense')
    } finally {
      setDeleting(false)
    }
  }

  const resetForm = () => {
    const allTravelerIds = travelers.map((t: any) => t.id)
    const currentUserId = user?.id
    const defaultPaidBy = travelers.find((t: any) => t.id === currentUserId)?.id || travelers[0]?.id || ''

    setFormData({
      title: '',
      amount: '',
      currency: trip?.currency || 'USD',
      paidByUserId: defaultPaidBy,
      splitBetweenUserIds: allTravelerIds,
      incurredAt: '',
      note: ''
    })
    setFormErrors({})
  }

  // Calculate totals and balances
  const { totals, settlements } = useMemo(() => {
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

    // Calculate who owes whom (simplified settlement)
    const settlementsArr: { from: string; to: string; amount: number }[] = []
    const debtors = Object.entries(balances)
      .filter(([_, balance]) => balance < -0.01)
      .map(([userId, balance]) => ({ userId, balance: -balance }))
      .sort((a, b) => b.balance - a.balance)

    const creditors = Object.entries(balances)
      .filter(([_, balance]) => balance > 0.01)
      .map(([userId, balance]) => ({ userId, balance }))
      .sort((a, b) => b.balance - a.balance)

    // Simple settlement algorithm
    let i = 0, j = 0
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i]
      const creditor = creditors[j]

      const amount = Math.min(debtor.balance, creditor.balance)
      if (amount > 0.01) {
        settlementsArr.push({
          from: debtor.userId,
          to: creditor.userId,
          amount
        })
      }

      debtor.balance -= amount
      creditor.balance -= amount

      if (debtor.balance < 0.01) i++
      if (creditor.balance < 0.01) j++
    }

    return {
      totals: {
        totalSpend,
        byPayer,
        balances,
        byPerson
      },
      settlements: settlementsArr
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
    const traveler = travelers.find((t: any) => t.id === userId)
    return traveler?.name || 'Unknown'
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

  // Sort expenses by date (most recent first)
  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const dateA = new Date(a.incurredAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.incurredAt || b.createdAt || 0).getTime()
      return dateB - dateA
    })
  }, [expenses])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BrandedSpinner size="md" className="mb-4" />
        <p className="text-gray-500">Loading expenses...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null)
            loadExpenses()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!isReadOnly && (
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Expense
          </Button>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Expenses Yet</h3>
          <p className="text-gray-500 mb-4">Track shared costs for this trip</p>
          {!isReadOnly && (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Expense
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Total spent</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.totalSpend)}</p>
              </div>

              {/* Settlements - Who owes whom */}
              {settlements.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">To settle up</p>
                  <div className="space-y-2">
                    {settlements.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{getTravelerName(s.from)}</span>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{getTravelerName(s.to)}</span>
                        </div>
                        <span className="font-semibold text-red-600">{formatCurrency(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Balances */}
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
                            {isZero ? 'Settled' : isPositive ? `+${formatCurrency(balance)}` : formatCurrency(balance)}
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
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              All Expenses
            </h3>
            <div className="space-y-2">
              {sortedExpenses.map((expense) => (
                <Card key={expense._id || expense.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{expense.title}</h4>
                          <span className="font-bold">{formatCurrency(expense.amountCents / 100)}</span>
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <p>Paid by {getTravelerName(expense.paidByUserId)}</p>
                          {expense.incurredAt && (
                            <p className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(expense.incurredAt)}
                            </p>
                          )}
                          {expense.splitBetweenUserIds.length > 0 && (
                            <p>
                              Split {expense.splitBetweenUserIds.length} ways
                              ({formatCurrency((expense.amountCents / 100) / expense.splitBetweenUserIds.length)} each)
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
                          className="h-8 w-8 ml-2"
                          onClick={() => setDeletingExpenseId(expense._id || expense.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Track a shared cost for this trip
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
              {travelers.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1">No active travelers found</p>
              ) : (
                <Select
                  value={formData.paidByUserId}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, paidByUserId: value }))
                    setFormErrors(prev => ({ ...prev, paidByUserId: '' }))
                  }}
                >
                  <SelectTrigger id="paidBy">
                    <SelectValue placeholder="Select payer" />
                  </SelectTrigger>
                  <SelectContent>
                    {travelers.map((traveler: any) => (
                      <SelectItem key={traveler.id} value={traveler.id}>
                        {traveler.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formErrors.paidByUserId && <p className="text-sm text-red-500 mt-1">{formErrors.paidByUserId}</p>}
            </div>

            <div>
              <Label>Split between *</Label>
              {travelers.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1">No active travelers found</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {travelers.map((traveler: any) => {
                    const isChecked = formData.splitBetweenUserIds.includes(traveler.id)
                    return (
                      <div key={traveler.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`split-${traveler.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              splitBetweenUserIds: checked
                                ? [...prev.splitBetweenUserIds, traveler.id]
                                : prev.splitBetweenUserIds.filter((id) => id !== traveler.id)
                            }))
                            setFormErrors(prev => ({ ...prev, splitBetweenUserIds: '' }))
                          }}
                        />
                        <Label htmlFor={`split-${traveler.id}`} className="cursor-pointer text-sm">
                          {traveler.name}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              )}
              {formErrors.splitBetweenUserIds && <p className="text-sm text-red-500 mt-1">{formErrors.splitBetweenUserIds}</p>}
            </div>

            <div>
              <Label htmlFor="incurredAt">Date</Label>
              <Input
                id="incurredAt"
                type="date"
                value={formData.incurredAt}
                onChange={(e) => setFormData(prev => ({ ...prev, incurredAt: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="note">Notes</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Additional details..."
                rows={2}
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
            <Button onClick={handleAddExpense} disabled={adding || travelers.length === 0}>
              {adding ? 'Adding...' : 'Add Expense'}
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
              className="bg-brand-red hover:opacity-90"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
