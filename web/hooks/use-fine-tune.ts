import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import {
    subscribeToUserJobs,
    subscribeToUserModelsByBaseModel,
    getUserModelsByBaseModel,
    subscribeToModelVersions,
} from '@/lib/fine-tune-jobs'
import {
    FineTuneJob as FirestoreFineTuneJob,
    Model as UserModel,
    ModelVersion,
} from '@/app/api/types'
import { useModelStore } from '../lib/store'

interface CheckModelNameResponse {
    available: boolean
    modelName: string
    error?: string
}

interface FineTuneSettings {
    epochs?: number
    learningRate?: number
    loraRank?: number
    loraAlpha?: number
    loraDropout?: number
}

interface StartFineTuneRequest {
    modelName?: string
    modelId?: string
    baseModel: string
    settings?: FineTuneSettings
    recaptchaToken?: string
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

interface GetApiKeyResponse {
    keyId: string
    keySecret: string
    modelName: string
    createdAt: Date
    isActive: boolean
}

/**
 * Hook to fetch user's fine-tune jobs with real-time updates
 */
export function useUserJobs({
    selectedUserModelName
}: {
    selectedUserModelName?: string
} = {}) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [hasReceivedFirstUpdate, setHasReceivedFirstUpdate] = useState(false)

    const query = useQuery({
        queryKey: ['fine-tune-jobs', user?.uid, selectedUserModelName],
        queryFn: async () => {
            return [] as FirestoreFineTuneJob[]
        },
        enabled: !!user && !user.isAnonymous,
        staleTime: Infinity,
    })

    useEffect(() => {
        if (!user || user.isAnonymous) {
            queryClient.setQueryData(['fine-tune-jobs', user?.uid, selectedUserModelName], [])
            setHasReceivedFirstUpdate(false)
            return
        }

        // Reset the flag when user changes
        setHasReceivedFirstUpdate(false)

        const unsubscribe = subscribeToUserJobs(
            {
                userId: user.uid,
                modelName: selectedUserModelName,
            },
            (jobs) => {
                queryClient.setQueryData(['fine-tune-jobs', user.uid, selectedUserModelName], jobs)
                setHasReceivedFirstUpdate(true)
            },
            (error) => {
                console.error('Error loading fine-tune jobs:', error)
                setHasReceivedFirstUpdate(true)
            }
        )

        return () => unsubscribe()
    }, [user, selectedUserModelName, queryClient])

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
 * Hook to fetch user's models filtered by baseModel with real-time updates
 */
export function useUserModelsByBaseModel(baseModel: string) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [hasReceivedFirstUpdate, setHasReceivedFirstUpdate] = useState(false)
    const { selectedUserModel, setSelectedUserModel } = useModelStore()

    const query = useQuery({
        queryKey: ['user-models-by-base', user?.uid, baseModel],
        queryFn: async () => {
            return [] as UserModel[]
        },
        enabled: !!user && !user.isAnonymous && !!baseModel,
        staleTime: Infinity,
    })

    useEffect(() => {
        if (!user || user.isAnonymous || !baseModel) {
            queryClient.setQueryData(['user-models-by-base', user?.uid, baseModel], [])
            setHasReceivedFirstUpdate(false)
            return
        }

        // Reset the flag when user or baseModel changes
        setHasReceivedFirstUpdate(false)

        const unsubscribe = subscribeToUserModelsByBaseModel(
            user.uid,
            baseModel,
            (userModels) => {
                queryClient.setQueryData(['user-models-by-base', user.uid, baseModel], userModels)
                const updatedSelectedUserModel = userModels.find(model => model.id === selectedUserModel?.id) || null
                if (updatedSelectedUserModel) {
                    setSelectedUserModel(updatedSelectedUserModel)
                }
                setHasReceivedFirstUpdate(true)
            },
            (error) => {
                console.error('Error loading user models by baseModel:', error)
                setHasReceivedFirstUpdate(true)
            }
        )

        return () => unsubscribe()
    }, [user, baseModel, queryClient])

    return {
        ...query,
        isLoading: query.isLoading || !hasReceivedFirstUpdate,
    }
}

/**
 * Hook to fetch user's models filtered by baseModel (one-time fetch)
 * Alternative to useUserModelsByBaseModel that fetches data once instead of using real-time updates
 */
export function useUserModelsByBaseModelOnce(baseModel: string) {
    const { user } = useAuth()

    return useQuery({
        queryKey: ['user-models-by-base-once', user?.uid, baseModel],
        queryFn: async () => {
            if (!user || user.isAnonymous || !baseModel) {
                return [] as UserModel[]
            }

            return getUserModelsByBaseModel(user.uid, baseModel)
        },
        enabled: !!user && !user.isAnonymous && !!baseModel,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    })
}

/**
 * Hook to fetch the decrypted API key for a given keyId
 */
export function useGetApiKey(keyId: string | undefined, enabled: boolean = false) {
    const { user } = useAuth()

    return useQuery({
        queryKey: ['api-key', keyId],
        queryFn: async () => {
            if (!keyId) {
                throw new Error('API key ID is required')
            }

            if (!user) {
                throw new Error('User not authenticated')
            }

            const token = await user.getIdToken()
            const response = await fetch(`/api/fine-tune/api-key/${keyId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (!response.ok) {
                const errorMessage = data.error || data.message || 'Failed to retrieve API key'
                throw new Error(errorMessage)
            }

            return data as GetApiKeyResponse
        },
        enabled: enabled && !!keyId && !!user,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
                description: `Your model ${variables.modelName ? `"${variables.modelName}"` : ''} is now queued for training`,
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

/**
 * Hook to activate a specific version of a model
 */
export function useActivateVersion() {
    const { user } = useAuth()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ modelId, versionId }: { modelId: string; versionId: string }) => {
            if (!user) {
                throw new Error('User not authenticated')
            }

            const token = await user.getIdToken()
            const response = await fetch(`/api/models/${modelId}/versions/${versionId}/activate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (!response.ok) {
                const errorMessage = data.error || data.message || 'Failed to activate version'
                throw new Error(errorMessage)
            }

            return data
        },
        onSuccess: () => {
            toast.success('Version activated', {
                description: 'The selected version is now active',
            })
            // Invalidate user models to reflect the new active version
            queryClient.invalidateQueries({
                queryKey: ['user-models-by-base'],
            })
        },
        onError: (error: Error) => {
            console.error('Error activating version:', error)
            toast.error('Failed to activate version', {
                description: error.message || 'An unexpected error occurred. Please try again.',
            })
        },
    })
}

/**
 * Hook to fetch model versions with real-time updates
 */
export function useModelVersions(modelId: string | undefined) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [hasReceivedFirstUpdate, setHasReceivedFirstUpdate] = useState(false)

    const query = useQuery({
        queryKey: ['model-versions', modelId],
        queryFn: async () => {
            return [] as ModelVersion[]
        },
        enabled: !!user && !user.isAnonymous && !!modelId,
        staleTime: Infinity,
    })

    useEffect(() => {
        if (!user || user.isAnonymous || !modelId) {
            queryClient.setQueryData(['model-versions', modelId], [])
            setHasReceivedFirstUpdate(false)
            return
        }

        // Reset the flag when modelId changes
        setHasReceivedFirstUpdate(false)

        const unsubscribe = subscribeToModelVersions(
            modelId,
            (versions) => {
                queryClient.setQueryData(['model-versions', modelId], versions)
                setHasReceivedFirstUpdate(true)
            },
            (error) => {
                console.error('Error loading model versions:', error)
                setHasReceivedFirstUpdate(true)
            }
        )

        return () => unsubscribe()
    }, [user, modelId, queryClient])

    return {
        ...query,
        isLoading: modelId ? (query.isLoading || !hasReceivedFirstUpdate) : false,
    }
}
