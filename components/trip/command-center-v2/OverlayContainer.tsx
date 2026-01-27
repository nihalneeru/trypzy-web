'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { X } from 'lucide-react'
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
}

/**
 * Slide-in drawer overlay container
 *
 * Features:
 * - Slides in from right side or bottom with smooth animation
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
  useAbsolutePosition = false
}: OverlayContainerProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      // Opening: first make visible, then animate in
      setIsVisible(true)
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else {
      // Closing: animate out first, then hide
      setIsAnimating(false)
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 300) // Match animation duration
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle close attempt - check for unsaved changes
  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true)
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, onClose])

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
        handleCloseAttempt()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleCloseAttempt])

  // Focus trap - focus overlay when opened
  useEffect(() => {
    if (isOpen && isAnimating && overlayRef.current) {
      overlayRef.current.focus()
    }
  }, [isOpen, isAnimating])

  // Don't render anything if not visible
  if (!isVisible) return null

  const isBottomSlide = slideFrom === 'bottom'
  const positionClass = useAbsolutePosition ? 'absolute' : 'fixed'

  return (
    <>
      {/* Backdrop - semi-transparent overlay, constrained to chat area */}
      <div
        className={cn(
          positionClass, 'z-40 bg-black/30 transition-opacity duration-300',
          isAnimating ? 'opacity-100' : 'opacity-0'
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
          'flex flex-col transition-transform duration-300 ease-out',
          isBottomSlide ? [
            // Bottom slide: compact sheet anchored to bottom-right
            'rounded-t-xl overflow-hidden',
            isAnimating ? 'translate-y-0' : 'translate-y-full'
          ] : [
            // Right slide: constrained to chat area, never covers chevron bar or bottom bar
            isAnimating ? 'translate-x-0' : 'translate-x-full'
          ]
        )}
        style={
          useAbsolutePosition && isBottomSlide
            ? {
                bottom: 0,
                right: 0,
                width: 'min(448px, 100%)',
                maxHeight: '75%'
              }
            : isBottomSlide
              ? {
                  bottom: bottomOffset,
                  right: rightOffset,
                  width: `min(448px, calc(100% - ${rightOffset}))`,
                  maxHeight: `calc(100vh - ${topOffset} - ${bottomOffset} - 20px)`
                }
              : {
                  top: topOffset,
                  bottom: bottomOffset,
                  right: rightOffset,
                  width: 'min(448px, calc(100vw - 20px))',
                  maxWidth: `calc(100vw - ${rightOffset} - 10px)`
                }
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
          <h2 id="overlay-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCloseAttempt}
            className="h-8 w-8"
            aria-label="Close overlay"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>

        {/* Optional fixed footer */}
        {footer && (
          <div className="shrink-0 border-t bg-white px-4 py-3">
            {footer}
          </div>
        )}
      </div>

      {/* Discard Changes Confirmation Dialog - z-[60] to appear above overlay drawer (z-50) */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close? Your changes will be lost.
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
