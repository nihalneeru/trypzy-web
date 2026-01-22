'use client'

import { useEffect, useCallback, useRef } from 'react'
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
import { useState } from 'react'

interface OverlayContainerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Set to true when overlay has unsaved changes - prevents accidental close */
  hasUnsavedChanges?: boolean
  /** Custom width class (default: w-[500px] on desktop) */
  widthClass?: string
}

/**
 * Slide-in drawer overlay container
 *
 * Features:
 * - Slides in from right side
 * - Chat remains visible (dimmed) behind
 * - Unsaved changes protection with confirmation dialog
 * - Dismiss via X button, backdrop click (if no unsaved changes), or Escape
 */
export function OverlayContainer({
  isOpen,
  onClose,
  title,
  children,
  hasUnsavedChanges = false,
  widthClass = 'w-full sm:w-[500px] md:w-[600px]'
}: OverlayContainerProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

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

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Focus trap - focus overlay when opened
  useEffect(() => {
    if (isOpen && overlayRef.current) {
      overlayRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Slide-in Drawer */}
      <div
        ref={overlayRef}
        tabIndex={-1}
        className={`fixed top-0 right-0 z-50 h-full ${widthClass} bg-white shadow-xl transform transition-transform duration-300 ease-out flex flex-col`}
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-red-600 hover:bg-red-700">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
