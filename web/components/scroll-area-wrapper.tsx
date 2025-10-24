"use client"

import { ReactNode, useRef, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useScroll } from "@/contexts/scroll-context"

interface ScrollAreaWrapperProps {
    children: ReactNode
    className?: string
}

export function ScrollAreaWrapper({ children, className }: ScrollAreaWrapperProps) {
    const { setScrollPosition } = useScroll()

    const handleScroll = useCallback(
        (event: {
            scrollTop: number;
            scrollHeight: number;
            clientHeight: number;
        }) => {
            setScrollPosition(
                event.scrollTop,
                event.scrollHeight,
                event.clientHeight
            )
        },
        [setScrollPosition]
    )

    return (
        <ScrollArea
            className={className}
            onScrollChange={handleScroll}
        >
            {children}
        </ScrollArea>
    )
}
