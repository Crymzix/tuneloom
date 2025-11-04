"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

interface ScrollAreaProps
    extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
    onScrollChange?: (event: {
        scrollTop: number
        scrollHeight: number
        clientHeight: number
    }) => void
    viewportRef?: React.RefObject<HTMLDivElement | null>
    fadingEdges?: boolean
    fadingEdgeClassNameTop?: string
    fadingEdgeClassNameBottom?: string
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(({
    className,
    children,
    onScrollChange,
    viewportRef,
    fadingEdgeClassNameTop,
    fadingEdgeClassNameBottom,
    fadingEdges = false,
    ...props
}, ref) => {

    const internalViewportRef = React.useRef<HTMLDivElement>(null)
    const actualViewportRef = viewportRef || internalViewportRef
    const [isAtTop, setIsAtTop] = React.useState(true)
    const [isAtBottom, setIsAtBottom] = React.useState(false)

    const handleScroll = React.useCallback(() => {
        const viewport = actualViewportRef.current
        if (!viewport) {
            return
        }

        const { scrollTop, scrollHeight, clientHeight } = viewport

        // Check if at top (with small tolerance for floating point precision)
        setIsAtTop(scrollTop <= 1)

        // Check if at bottom (with small tolerance for floating point precision)
        setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 1)

        onScrollChange?.({ scrollTop, scrollHeight, clientHeight })
    }, [onScrollChange, actualViewportRef])

    React.useEffect(() => {
        const viewport = actualViewportRef.current
        if (!viewport || (!fadingEdges && !onScrollChange)) {
            return
        }

        handleScroll()

        viewport.addEventListener('scroll', handleScroll, { passive: true })

        const resizeObserver = new ResizeObserver(handleScroll)
        resizeObserver.observe(viewport)

        return () => {
            viewport.removeEventListener('scroll', handleScroll)
            resizeObserver.disconnect()
        }
    }, [handleScroll, onScrollChange, actualViewportRef, fadingEdges])

    return (
        <ScrollAreaPrimitive.Root
            data-slot="scroll-area"
            className={cn("relative", className)}
            {...props}
        >
            <ScrollAreaPrimitive.Viewport
                ref={actualViewportRef}
                data-slot="scroll-area-viewport"
                className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 snap-y snap-mandatory"
            >
                {children}
            </ScrollAreaPrimitive.Viewport>

            {/* Top fading edge */}
            {fadingEdges && !isAtTop && (
                <div className={cn("absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none", fadingEdgeClassNameTop)} />
            )}

            {/* Bottom fading edge */}
            {fadingEdges && !isAtBottom && (
                <div className={cn("absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none", fadingEdgeClassNameBottom)} />
            )}
            <ScrollBar />
            <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
    )
})

ScrollArea.displayName = "ScrollArea"

function ScrollBar({
    className,
    orientation = "vertical",
    ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
    return (
        <ScrollAreaPrimitive.ScrollAreaScrollbar
            data-slot="scroll-area-scrollbar"
            orientation={orientation}
            className={cn(
                "flex touch-none p-px transition-colors select-none",
                orientation === "vertical" &&
                "h-full w-2.5 border-l border-l-transparent",
                orientation === "horizontal" &&
                "h-2.5 flex-col border-t border-t-transparent",
                className
            )}
            {...props}
        >
            <ScrollAreaPrimitive.ScrollAreaThumb
                data-slot="scroll-area-thumb"
                className="bg-border relative flex-1 rounded-full"
            />
        </ScrollAreaPrimitive.ScrollAreaScrollbar>
    )
}

export { ScrollArea, ScrollBar }
