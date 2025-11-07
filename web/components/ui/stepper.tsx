"use client"

import { useEffect, useState } from "react"
import { cn } from "../../lib/utils"
import { useScroll } from "@/contexts/scroll-context"

interface Step {
    id: string
    label: string
}

interface StepperProps {
    steps: Step[]
    className?: string
}

export function Stepper({ steps, className }: StepperProps) {
    const [activeStep, setActiveStep] = useState(0)
    const { scrollTop, clientHeight } = useScroll()

    useEffect(() => {
        const scrollPosition = scrollTop + clientHeight / 2

        for (let i = steps.length - 1; i >= 0; i--) {
            const section = document.getElementById(steps[i].id)
            if (section) {
                const sectionTop = section.offsetTop
                if (scrollPosition >= sectionTop) {
                    setActiveStep(i)
                    break
                }
            }
        }
    }, [scrollTop, clientHeight, steps])

    return (
        <div
            className={cn(
                "hidden sm:block fixed left-8 top-1/2 -translate-y-1/2 z-50",
                className
            )}
        >
            <div className="flex flex-col">
                {steps.map((step, index) => {
                    const isActive = index === activeStep
                    const isPassed = index < activeStep

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "flex items-center gap-3 group cursor-pointer",
                                index < steps.length - 1 && "mb-6"
                            )}
                            onClick={() => {
                                const section = document.getElementById(step.id)
                                if (section) {
                                    section.scrollIntoView({ behavior: "smooth" })
                                }
                            }}
                        >
                            {/* Step Circle */}
                            <div
                                className={cn(
                                    "relative flex items-center justify-center",
                                    "transition-all duration-300 ease-in-out"
                                )}
                            >
                                {/* Connecting Line (except for last step) */}
                                {index < steps.length - 1 && (
                                    <div
                                        className={cn(
                                            "absolute top-1/2 left-1/2 -translate-x-1/2 w-[2px] transition-all duration-300",
                                            "h-[calc(1.5rem+24px)]",
                                            isPassed || isActive
                                                ? "bg-blue-300"
                                                : "bg-blue-300"
                                        )}
                                    />
                                )}

                                {/* Circle */}
                                <div
                                    className={cn(
                                        "w-3 h-3 rounded-full transition-all duration-300 relative z-10",
                                        isActive
                                            ? "bg-blue-400 scale-125 ring-4 ring-blue-300/20"
                                            : isPassed
                                                ? "bg-blue-300 scale-100"
                                                : "bg-blue-300 scale-100 group-hover:scale-110"
                                    )}
                                />
                            </div>

                            {/* Step Label */}
                            <span
                                className={cn(
                                    "text-sm transition-all duration-300 whitespace-nowrap",
                                    isActive
                                        ? "text-foreground font-semibold opacity-100"
                                        : isPassed
                                            ? "text-muted-foreground opacity-70 group-hover:opacity-90"
                                            : "text-muted-foreground opacity-40 group-hover:opacity-60"
                                )}
                            >
                                {step.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
