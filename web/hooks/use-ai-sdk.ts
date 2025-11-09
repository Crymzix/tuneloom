import { UIMessage, useChat as useAIChat, useCompletion as useAICompletion, UseChatOptions, UseCompletionOptions } from '@ai-sdk/react'
import { useRecaptcha } from '@/contexts/recaptcha-context'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

/**
 * Custom hook that wraps @ai-sdk/react's useChat with automatic recaptcha handling
 */
export function useChat(options?: UseChatOptions<UIMessage>) {
    const { executeRecaptcha } = useRecaptcha()
    const chatResult = useAIChat(options)
    const [isVerifyingRecaptcha, setIsVerifyingRecaptcha] = useState(false)

    const sendMessage = useCallback(
        async (message: Parameters<typeof chatResult.sendMessage>[0], requestOptions?: Parameters<typeof chatResult.sendMessage>[1]) => {
            try {
                setIsVerifyingRecaptcha(true)
                const recaptchaToken = await executeRecaptcha()
                if (!recaptchaToken) {
                    toast.error('reCAPTCHA verification failed', {
                        description: 'Please try again.'
                    })
                    setIsVerifyingRecaptcha(false)
                    return
                }

                // Merge the recaptchaToken into the body
                const mergedOptions = {
                    ...requestOptions,
                    body: {
                        ...requestOptions?.body,
                        recaptchaToken,
                    },
                }

                const result = await chatResult.sendMessage(message, mergedOptions)
                setIsVerifyingRecaptcha(false)
                return result
            } catch (error) {
                console.error('Error in chat:', error)
                toast.error('Failed to send message', {
                    description: error instanceof Error ? error.message : 'An error occurred'
                })
                setIsVerifyingRecaptcha(false)
            }
        },
        [chatResult.sendMessage, executeRecaptcha]
    )

    // Create a modified status that includes recaptcha verification
    const enhancedStatus = isVerifyingRecaptcha ? 'submitted' : chatResult.status

    return {
        ...chatResult,
        sendMessage,
        status: enhancedStatus,
    }
}

/**
 * Custom hook that wraps @ai-sdk/react's useCompletion with automatic recaptcha handling
 */
export function useCompletion(options?: UseCompletionOptions) {
    const { executeRecaptcha } = useRecaptcha()
    const completionResult = useAICompletion(options)
    const [isVerifyingRecaptcha, setIsVerifyingRecaptcha] = useState(false)

    const complete = useCallback(
        async (prompt: Parameters<typeof completionResult.complete>[0], requestOptions?: Parameters<typeof completionResult.complete>[1]) => {
            try {
                setIsVerifyingRecaptcha(true)
                const recaptchaToken = await executeRecaptcha()
                if (!recaptchaToken) {
                    toast.error('reCAPTCHA verification failed', {
                        description: 'Please try again.'
                    })
                    setIsVerifyingRecaptcha(false)
                    return
                }

                // Merge the recaptchaToken into the body
                const mergedOptions = {
                    ...requestOptions,
                    body: {
                        ...requestOptions?.body,
                        recaptchaToken,
                    },
                }

                const result = await completionResult.complete(prompt, mergedOptions)
                setIsVerifyingRecaptcha(false)
                return result
            } catch (error) {
                console.error('Error in completion:', error)
                toast.error('Failed to complete prompt', {
                    description: error instanceof Error ? error.message : 'An error occurred'
                })
                setIsVerifyingRecaptcha(false)
            }
        },
        [completionResult.complete, executeRecaptcha]
    )

    // Create a modified isLoading that includes recaptcha verification
    const enhancedIsLoading = isVerifyingRecaptcha || completionResult.isLoading

    return {
        ...completionResult,
        complete,
        isLoading: enhancedIsLoading,
    }
}
