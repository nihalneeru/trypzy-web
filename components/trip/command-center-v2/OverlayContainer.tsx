'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

interface OverlayContainerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Optional fixed footer rendered below scrollable content */
  footer?: React.ReactNode
  /** Set to true when overlay has unsaved changes - prevents accidental close */
  hasUnsavedChanges?: boolean
  /** Right offset to not cover sidebar (e.g., "72px" for chevron bar) */
  rightOffset?: string
  /** Top offset to not cover focus banner (e.g., "100px") */
  topOffset?: string
  /** Bottom offset to not cover bottom bar (e.g., "56px") */
  bottomOffset?: string
  /** Slide direction - 'right' (default) or 'bottom' */
  slideFrom?: 'right' | 'bottom'
  /** Use absolute positioning within a relative parent instead of fixed viewport positioning */
  useAbsolutePosition?: boolean
  /** Use full width instead of max 448px (for V3 full-screen overlays) */
  fullWidth?: boolean
  /** Accent color for title bar and border (hex, e.g. '#09173D'). Defaults to brand-blue. */
  accentColor?: string
}

/**
 * Drawer overlay container
 *
 * Features:
 * - Instant show/hide (no animation) to prevent horizontal scroll artifacts
 * - Can be offset from right edge to not cover sidebar
 * - Chat remains visible (dimmed) behind
 * - Unsaved changes protection with confirmation dialog
 * - Dismiss via X button, backdrop click (if no unsaved changes), or Escape
 */
export function OverlayContainer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  hasUnsavedChanges = false,
  rightOffset = '0px',
  topOffset = '0px',
  bottomOffset = '0px',
  slideFrom = 'right',
  useAbsolutePosition = false,
  fullWidth = false,
  accentColor = '#09173D'
}: OverlayContainerProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Handle close attempt - check for unsaved changes
  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true)
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, onClose])

  // Keep a stable ref so effects don't re-run when hasUnsavedChanges toggles
  const closeAttemptRef = useRef(handleCloseAttempt)
  useEffect(() => { closeAttemptRef.current = handleCloseAttempt }, [handleCloseAttempt])

  // Handle confirmed close (discard changes)
  const handleConfirmClose = useCallback(() => {
    setShowDiscardDialog(false)
    onClose()
  }, [onClose])

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the overlay content
    if (e.target === e.currentTarget) {
      handleCloseAttempt()
    }
  }, [handleCloseAttempt])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAttemptRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Handle browser back button / mobile back swipe — close overlay instead of navigating away
  useEffect(() => {
    if (!isOpen) return

    // Push a history entry so back button closes overlay instead of navigating
    window.history.pushState({ triptiOverlay: true }, '')
    let popstateHandled = false

    const handlePopState = (e: PopStateEvent) => {
      popstateHandled = true
      closeAttemptRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      // If overlay was closed by X/backdrop/Escape (not by back button),
      // clean up the extra history entry we pushed
      if (!popstateHandled) {
        window.history.back()
      }
    }
  }, [isOpen])

  // Focus management - save previous focus, focus overlay when opened, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      overlayRef.current?.focus()
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  // Focus trap - keep Tab cycling within the overlay
  useEffect(() => {
    if (!isOpen) return

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !overlayRef.current) return

      const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  // Don't render anything if not open
  if (!isOpen) return null

  const isBottomSlide = slideFrom === 'bottom'
  const positionClass = useAbsolutePosition ? 'absolute' : 'fixed'

  return (
    <>
      {/* Backdrop - semi-transparent overlay, constrained to chat area */}
      <div
        className={cn(
          positionClass, 'z-40 bg-black/30'
        )}
        style={
          useAbsolutePosition
            ? { inset: 0 }
            : {
                top: topOffset,
                bottom: bottomOffset,
                left: 0,
                right: rightOffset
              }
        }
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Slide-in Drawer */}
      <div
        ref={overlayRef}
        tabIndex={-1}
        className={cn(
          positionClass, 'z-50 bg-white shadow-2xl',
          'flex flex-col',
          isBottomSlide
            ? 'rounded-t-xl overflow-hidden animate-slide-in-bottom'
            : 'rounded-lg overflow-hidden animate-slide-in-right'
        )}
        style={
          useAbsolutePosition && isBottomSlide
            ? {
                bottom: 0,
                left: 0,
                width: fullWidth ? '100%' : 'min(448px, 100%)',
                maxHeight: '90%'
              }
            : useAbsolutePosition && !isBottomSlide
              ? {
                  // Right slide with absolute positioning (constrained to parent container)
                  top: `calc(${topOffset} + 15px)`,
                  bottom: `calc(${bottomOffset} + 15px)`,
                  right: `calc(${rightOffset} + 15px)`,
                  left: fullWidth ? '15px' : undefined,
                  width: fullWidth ? 'calc(100% - 20px)' : 'min(448px, calc(100% - 20px))',
                  border: `5px solid ${accentColor}`,
                }
              : isBottomSlide
                ? {
                    bottom: bottomOffset,
                    right: rightOffset,
                    width: fullWidth ? `calc(100% - ${rightOffset})` : `min(448px, calc(100% - ${rightOffset}))`,
                    maxHeight: `calc(100vh - ${topOffset} - ${bottomOffset} - 20px)`
                  }
                : {
                    top: topOffset,
                    bottom: `calc(${bottomOffset} + 15px)`,
                    right: `calc(${rightOffset} + 15px)`,
                    left: fullWidth ? '15px' : undefined,
                    width: fullWidth ? `calc(100% - ${rightOffset} - 20px)` : 'min(448px, calc(100% - 20px))',
                    maxWidth: fullWidth ? undefined : `calc(100% - ${rightOffset} - 20px)`,
                    border: `5px solid ${accentColor}`,
                  }
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 border-b px-4 py-2" style={{ backgroundColor: accentColor }}>
          <button
            onClick={handleCloseAttempt}
            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>
          <h2 id="overlay-title" className="text-sm font-semibold text-white">
            {title}
          </h2>
          <div className="relative">
            <Button
              variant="ghost"
              onClick={handleCloseAttempt}
              className="h-8 w-8 p-0 text-white bg-white/10 hover:bg-white/25 hover:text-white rounded-full [&_svg]:size-auto"
              aria-label={hasUnsavedChanges ? 'Close overlay (unsaved changes)' : 'Close overlay'}
            >
              <X className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </Button>
            {hasUnsavedChanges && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-red ring-2 ring-white animate-pulse"
                aria-label="Unsaved changes"
              />
            )}
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {children}
        </div>

        {/* Optional fixed footer */}
        {footer && (
          <div className="shrink-0 border-t bg-white px-4 py-3">
            {footer}
          </div>
        )}
      </div>

      {/* Discard Changes Confirmation Dialog - high z-index via inline styles to ensure visibility */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent style={{ zIndex: 9999 }} overlayStyle={{ zIndex: 9998 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-brand-red hover:opacity-90 text-white">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
