'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, DollarSign } from 'lucide-react'

interface ExpensesModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  onOpenLegacyTab: (tab: string) => void
}

/**
 * ExpensesModule - Secondary module for expense tracking
 *
 * Shows expense summary and balances. Not a blocker - always accessible.
 * Phase 9: Will show inline expense management UI
 */
export function ExpensesModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  onOpenLegacyTab
}: ExpensesModuleProps) {
  // Expense data from trip
  const totalExpenses = trip?.totalExpenses || 0
  const expenseCount = trip?.expenseCount || 0
  const unsettledAmount = trip?.unsettledAmount || 0
  const expensesSettled = trip?.progress?.expensesSettledAt

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  // Status message
  const getStatusMessage = () => {
    if (expenseCount === 0) return 'No expenses tracked yet'
    if (expensesSettled) return 'All expenses settled'
    if (unsettledAmount > 0) {
      return `${formatCurrency(unsettledAmount)} to settle`
    }
    return `${formatCurrency(totalExpenses)} total`
  }

  return (
    <Card className="border-gray-200">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 transition-colors py-3"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-gray-100">
              <DollarSign className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
                Expenses
                {totalExpenses > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {formatCurrency(totalExpenses)}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-gray-500">{getStatusMessage()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isExpanded && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-gray-500 border-gray-300 h-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
              >
                View
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-3">
            {/* Expense summary */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {expenseCount === 0
                    ? 'Track shared costs for the trip'
                    : `${expenseCount} expense${expenseCount !== 1 ? 's' : ''} logged`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline expense management
                    onOpenLegacyTab('expenses')
                  }}
                >
                  {expenseCount === 0 ? 'Add Expense' : 'View Expenses'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
