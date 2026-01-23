'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

/**
 * @typedef {Object} GlobalNotification
 * @property {string} id
 * @property {string} title
 * @property {string} context
 * @property {string} ctaLabel
 * @property {string} href
 * @property {number} priority
 * @property {string} timestamp
 */

/**
 * Notification row component (reusable for banner and sheet)
 * @param {Object} props
 * @param {GlobalNotification} props.notification
 * @param {boolean} [props.compact] - Use tighter spacing for banner view
 */
function NotificationRow({ notification, compact = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${compact ? 'py-1.5' : 'py-2'} hover:bg-gray-50/50 transition-colors`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 leading-tight">{notification.title}</span>
          <span className="text-sm text-gray-500 leading-tight" aria-hidden="true">—</span>
          <span className="text-sm text-gray-600 leading-tight">{notification.ctaLabel}</span>
        </div>
      </div>
      <Link 
        href={notification.href}
        className="text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap leading-tight"
      >
        {notification.ctaLabel}
      </Link>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {GlobalNotification[]} props.notifications
 */
export function GlobalNotifications({ notifications }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const topNotifications = notifications.slice(0, 3)

  return (
    <>
      {/* Compact banner section */}
      <div className="mb-6 border-b border-gray-200 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-gray-600" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-900 leading-tight">Notifications</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 leading-tight">
              {notifications.length} {notifications.length === 1 ? 'pending action' : 'pending actions'}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={() => setSheetOpen(true)}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline leading-tight"
              >
                View all
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {notifications.length === 0 ? (
          <div className="text-sm text-gray-500 py-0.5 leading-tight">
            All caught up ✅
          </div>
        ) : (
          <div className="space-y-0">
            {topNotifications.map((notification, index) => (
              <div key={notification.id}>
                <NotificationRow notification={notification} compact={true} />
                {index < topNotifications.length - 1 && (
                  <Separator className="my-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View All Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>All Notifications</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-0 pr-4">
              {notifications.map((notification, index) => (
                <div key={notification.id}>
                  <NotificationRow notification={notification} />
                  {index < notifications.length - 1 && (
                    <Separator className="my-0" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
