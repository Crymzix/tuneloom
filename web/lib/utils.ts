import { clsx, type ClassValue } from "clsx"
import { Inter, Pacifico } from "next/font/google"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const interFont = Inter({ subsets: ["latin"] })

export const pacificoFont = Pacifico({ subsets: ["latin"], weight: "400" })

export function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(date)
}