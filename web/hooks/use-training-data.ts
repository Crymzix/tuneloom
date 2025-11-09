import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { useModelStore } from '@/lib/store/model-store'
import { saveTrainingData, loadTrainingData } from '@/lib/training-data-storage'
import { syncTrainingDataToGCS, loadTrainingDataFromGCS } from '@/lib/training-data-sync'
import { useRef, useEffect } from 'react'
import { TrainingDataWorkflowResult } from '../app/api/types'

export interface TrainingDataRow {
    input: string
    output: string
}

export interface GenerateTrainingDataParams {
    prompt: string
    recaptchaToken?: string
    numExamples?: number
    numAgents?: number
    useAgenticPipeline?: boolean
    diverseAgents?: boolean
}

/**
 * Hook to load training data for the selected model
 * Tries GCS first for authenticated users, falls back to IndexedDB
 */
export function useTrainingData() {
    const { user } = useAuth()
    const { selectedModel, _hasHydrated } = useModelStore()

    return useQuery({
        queryKey: ['training-data', selectedModel?.hf_id, user?.uid],
        queryFn: async () => {
            if (!selectedModel) {
                return []
            }

            let data: TrainingDataRow[] | null = null

            // Try GCS first for authenticated users
            if (user && !user.isAnonymous) {
                data = await loadTrainingDataFromGCS(user, selectedModel.hf_id)
            }

            // Fall back to IndexedDB if GCS doesn't have data
            if (!data || data.length === 0) {
                data = await loadTrainingData(selectedModel.hf_id)
            }

            return data || []
        },
        enabled: !!selectedModel && _hasHydrated,
        staleTime: 5 * 60 * 1000,
    })
}

/**
 * Hook to save training data with automatic syncing to GCS
 * Saves to IndexedDB immediately, then syncs to GCS with debouncing
 */
export function useSaveTrainingData() {
    const { user } = useAuth()
    const { selectedModel } = useModelStore()
    const queryClient = useQueryClient()
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
            }
        }
    }, [])

    return useMutation({
        mutationFn: async (data: TrainingDataRow[]) => {
            if (!selectedModel) {
                throw new Error('No model selected')
            }

            // Save to IndexedDB immediately
            await saveTrainingData(selectedModel.hf_id, data)

            return data
        },
        onSuccess: (data) => {
            if (!selectedModel) return

            queryClient.setQueryData(
                ['training-data', selectedModel.hf_id, user?.uid],
                data
            )

            // Clear any pending sync timeout
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
            }

            if (user && !user.isAnonymous) {
                syncTimeoutRef.current = setTimeout(async () => {
                    try {
                        await syncTrainingDataToGCS(user, selectedModel.hf_id, data)
                    } catch (error) {
                        console.error('Background GCS sync failed:', error)
                    }
                }, 1000)
            }
        },
        onError: (error) => {
            console.error('Failed to save training data:', error)
        },
    })
}

/**
 * Hook to generate training data using AI
 * Makes a POST request to /api/generate-training-data
 */
export function useGenerateTrainingData() {
    const { user } = useAuth()

    return useMutation({
        mutationFn: async (params: GenerateTrainingDataParams) => {
            const token = await user?.getIdToken()

            const response = await fetch('/api/generate-training-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(params),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || 'Failed to generate training data')
            }

            const data = await response.json()
            return data as TrainingDataWorkflowResult
        },
    })
}
