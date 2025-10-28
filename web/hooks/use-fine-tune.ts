import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { subscribeToUserJobs, FineTuneJob as FirestoreFineTuneJob } from '@/lib/fine-tune-jobs'

interface CheckModelNameResponse {
    available: boolean
    modelName: string
    error?: string
}

interface StartFineTuneRequest {
    modelName: string
    baseModel: string
}

interface StartFineTuneResponse {
    jobId: string
    status: 'queued'
    message: string
}

interface StartFineTuneErrorResponse {
    error?: string
    message?: string
}

/**
 * Hook to fetch user's fine-tune jobs with real-time updates
 */
export function useUserJobs() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [hasReceivedFirstUpdate, setHasReceivedFirstUpdate] = useState(false)

    const query = useQuery({
        queryKey: ['fine-tune-jobs', user?.uid],
        queryFn: async () => {
            return [] as FirestoreFineTuneJob[]
        },
        enabled: !!user && !user.isAnonymous,
        staleTime: Infinity,
    })

    useEffect(() => {
        if (!user || user.isAnonymous) {
            queryClient.setQueryData(['fine-tune-jobs', user?.uid], [])
            setHasReceivedFirstUpdate(false)
            return
        }

        // Reset the flag when user changes
        setHasReceivedFirstUpdate(false)

        const unsubscribe = subscribeToUserJobs(
            user.uid,
            (firestoreJobs) => {
                queryClient.setQueryData(['fine-tune-jobs', user.uid], firestoreJobs)
                setHasReceivedFirstUpdate(true)
            },
            (error) => {
                console.error('Error loading fine-tune jobs:', error)
                setHasReceivedFirstUpdate(true)
            }
        )

        return () => unsubscribe()
    }, [user, queryClient])

    return {
        ...query,
        isLoading: query.isLoading || !hasReceivedFirstUpdate,
    }
}

/**
 * Hook to check if a model name is available
 */
export function useCheckModelName(modelName: string, enabled: boolean = true) {
    const { user } = useAuth()

    return useQuery({
        queryKey: ['check-model-name', modelName],
        queryFn: async () => {
            if (!modelName) {
                return { available: false, modelName: '' }
            }

            const token = await user?.getIdToken()
            const response = await fetch(
                `/api/check-model-name?name=${encodeURIComponent(modelName)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            const data: CheckModelNameResponse = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check availability')
            }

            return data
        },
        enabled: enabled && !!modelName && !!user,
        staleTime: 30 * 1000, // 30 seconds
        retry: 1,
    })
}

/**
 * Hook to start a fine-tune job
 */
export function useStartFineTune() {
    const { user } = useAuth()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (request: StartFineTuneRequest) => {
            if (!user) {
                throw new Error('User not authenticated')
            }

            const token = await user.getIdToken()
            const response = await fetch('/api/fine-tune/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(request),
            })

            const data = await response.json()

            if (!response.ok) {
                const errorData = data as StartFineTuneErrorResponse
                const errorMessage = errorData.error || errorData.message || 'Failed to start fine-tune job'
                throw new Error(errorMessage)
            }

            return data as StartFineTuneResponse
        },
        onSuccess: (data, variables) => {
            toast.success('Fine-tune job started', {
                description: `Your model "${variables.modelName}" is now queued for training`,
            })
            // Invalidate model name check to reflect that it's now taken
            queryClient.invalidateQueries({
                queryKey: ['check-model-name', variables.modelName],
            })
        },
        onError: (error: Error) => {
            console.error('Error starting fine-tune:', error)
            toast.error('Failed to start fine-tune job', {
                description: error.message || 'An unexpected error occurred. Please try again.',
            })
        },
    })
}
