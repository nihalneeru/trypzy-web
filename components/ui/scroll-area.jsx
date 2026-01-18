"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef(({ className, children, setScrollArea, ...props }, ref) => {
  const viewportRef = React.useRef(null)
  const lastSetNodeRef = React.useRef(null)

  // Use useCallback to create a stable ref callback - never calls setState directly
  // This prevents infinite loops - we never call setState in the ref callback
  const viewportRefCallback = React.useCallback((node) => {
    // Only update ref - refs don't cause re-renders
    viewportRef.current = node
  }, [])

  // Use useEffect to call setScrollArea when viewport ref changes (similar to Carousel pattern)
  // This runs after render, preventing infinite loops from setState during render
  React.useEffect(() => {
    const node = viewportRef.current

    // Only call setScrollArea if node exists, changed, and setScrollArea is provided
    // Guard prevents calling setScrollArea with the same node multiple times
    if (node && node !== lastSetNodeRef.current && setScrollArea) {
      lastSetNodeRef.current = node
      setScrollArea(node)
    }
  })

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}>
      <ScrollAreaPrimitive.Viewport 
        ref={viewportRefCallback}
        className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
})
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}>
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
