"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { useMotionValue, MotionValue } from "framer-motion"

interface ScrollContextType {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    scrollTopMotion: MotionValue<number>
    scrollProgress: MotionValue<number>
    setScrollPosition: (scrollTop: number, scrollHeight: number, clientHeight: number) => void
}

const ScrollContext = createContext<ScrollContextType | undefined>(undefined)

export function ScrollProvider({ children }: { children: ReactNode }) {
    const scrollTopMotion = useMotionValue(0)
    const scrollProgress = useMotionValue(0)

    const [scrollTop, setScrollTop] = useState(0)
    const [scrollHeight, setScrollHeight] = useState(0)
    const [clientHeight, setClientHeight] = useState(0)

    const setScrollPosition = (
        newScrollTop: number,
        newScrollHeight: number,
        newClientHeight: number
    ) => {
        setScrollTop(newScrollTop)
        setScrollHeight(newScrollHeight)
        setClientHeight(newClientHeight)

        // Update motion values
        scrollTopMotion.set(newScrollTop)

        // Calculate scroll progress (0 to 1)
        const maxScroll = newScrollHeight - newClientHeight
        const progress = maxScroll > 0 ? newScrollTop / maxScroll : 0
        scrollProgress.set(progress)
    }

    return (
        <ScrollContext.Provider
            value={{
                scrollTop,
                scrollHeight,
                clientHeight,
                scrollTopMotion,
                scrollProgress,
                setScrollPosition,
            }}
        >
            {children}
        </ScrollContext.Provider>
    )
}

export function useScroll() {
    const context = useContext(ScrollContext)
    if (context === undefined) {
        throw new Error("useScroll must be used within a ScrollProvider")
    }
    return context
}
