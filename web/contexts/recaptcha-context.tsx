'use client'

import React, { createContext, useContext, useRef, useCallback, ReactNode } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'

interface RecaptchaContextType {
    executeRecaptcha: () => Promise<string | null>
    resetRecaptcha: () => void
}

const RecaptchaContext = createContext<RecaptchaContextType | undefined>(undefined)

export function RecaptchaProvider({ children }: { children: ReactNode }) {
    const recaptchaRef = useRef<ReCAPTCHA>(null)

    const executeRecaptcha = useCallback(async (): Promise<string | null> => {
        if (!recaptchaRef.current) {
            console.error('reCAPTCHA not initialized')
            return null
        }

        try {
            const token = await recaptchaRef.current.executeAsync()
            recaptchaRef.current.reset() // Reset for next use
            return token
        } catch (error) {
            console.error('reCAPTCHA execution failed:', error)
            return null
        }
    }, [])

    const resetRecaptcha = useCallback(() => {
        if (recaptchaRef.current) {
            recaptchaRef.current.reset()
        }
    }, [])

    return (
        <RecaptchaContext.Provider value={{ executeRecaptcha, resetRecaptcha }}>
            {children}
            <ReCAPTCHA
                ref={recaptchaRef}
                size="invisible"
                sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''}
            />
        </RecaptchaContext.Provider>
    )
}

export function useRecaptcha() {
    const context = useContext(RecaptchaContext)
    if (!context) {
        throw new Error('useRecaptcha must be used within RecaptchaProvider')
    }
    return context
}
