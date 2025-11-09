import { UIMessage, useChat as useAIChat, useCompletion as useAICompletion, UseChatOptions, UseCompletionOptions } from '@ai-sdk/react'
import { useRecaptcha } from '@/contexts/recaptcha-context'
import { useCallback } from 'react'
import { toast } from 'sonner'

/**
 * Custom hook that wraps @ai-sdk/react's useChat with automatic recaptcha handling
 */
export function useChat(options?: UseChatOptions<UIMessage>) {
    const { executeRecaptcha } = useRecaptcha()
    const chatResult = useAIChat(options)

    const sendMessage = useCallback(
        async (message: Parameters<typeof chatResult.sendMessage>[0], requestOptions?: Parameters<typeof chatResult.sendMessage>[1]) => {
            try {
                const recaptchaToken = await executeRecaptcha()
                if (!recaptchaToken) {
                    toast.error('reCAPTCHA verification failed', {
                        description: 'Please try again.'
                    })
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

                return chatResult.sendMessage(message, mergedOptions)
            } catch (error) {
                console.error('Error in chat:', error)
                toast.error('Failed to send message', {
                    description: error instanceof Error ? error.message : 'An error occurred'
                })
            }
        },
        [chatResult.sendMessage, executeRecaptcha]
    )

    return {
        ...chatResult,
        sendMessage,
    }
}

/**
 * Custom hook that wraps @ai-sdk/react's useCompletion with automatic recaptcha handling
 */
export function useCompletion(options?: UseCompletionOptions) {
    const { executeRecaptcha } = useRecaptcha()
    const completionResult = useAICompletion(options)

    const complete = useCallback(
        async (prompt: Parameters<typeof completionResult.complete>[0], requestOptions?: Parameters<typeof completionResult.complete>[1]) => {
            try {
                const recaptchaToken = await executeRecaptcha()
                if (!recaptchaToken) {
                    toast.error('reCAPTCHA verification failed', {
                        description: 'Please try again.'
                    })
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

                return completionResult.complete(prompt, mergedOptions)
            } catch (error) {
                console.error('Error in completion:', error)
                toast.error('Failed to complete prompt', {
                    description: error instanceof Error ? error.message : 'An error occurred'
                })
            }
        },
        [completionResult.complete, executeRecaptcha]
    )

    return {
        ...completionResult,
        complete,
    }
}
