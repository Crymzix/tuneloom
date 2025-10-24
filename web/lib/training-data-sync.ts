import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'
import { storage } from './firebase'
import { convertToJSONL, parseJSONL } from './utils/jsonl'
import { User } from 'firebase/auth'

interface TrainingDataRow {
    input: string
    output: string
}

/**
 * Generate the GCS path for training data
 * Format: gs://{bucket}/training-data/{userId}/{modelId}
 */
function getStoragePath(userId: string, modelId: string): string {
    return `training-data/${userId}/${modelId}`
}

/**
 * Sync training data to Firebase Storage (GCS) in JSONL format
 * Only works for authenticated (non-anonymous) users
 *
 * @param user - Firebase user object
 * @param modelId - Model identifier
 * @param data - Training data rows to sync
 */
export async function syncTrainingDataToGCS(
    user: User | null,
    modelId: string,
    data: TrainingDataRow[]
): Promise<void> {
    // Only allow non-anonymous users
    if (!user || user.isAnonymous) {
        console.log('Skipping GCS sync: user is anonymous or not authenticated')
        return
    }

    if (!storage) {
        console.error('Firebase Storage not initialized')
        return
    }

    try {
        const userId = user.uid
        const storagePath = getStoragePath(userId, modelId.replace('/', '-'))
        const storageRef = ref(storage, storagePath)

        // Convert data to JSONL format
        const jsonlContent = convertToJSONL(data)

        // Upload to Firebase Storage as a text file
        const blob = new Blob([jsonlContent], { type: 'text/plain' })
        await uploadBytes(storageRef, blob)

        console.log(`Training data synced to GCS: ${storagePath}`)
    } catch (error) {
        console.error('Failed to sync training data to GCS:', error)
        throw error
    }
}

/**
 * Load training data from Firebase Storage (GCS)
 * Only works for authenticated (non-anonymous) users
 *
 * @param user - Firebase user object
 * @param modelId - Model identifier
 * @returns Training data rows or null if not found
 */
export async function loadTrainingDataFromGCS(
    user: User | null,
    modelId: string
): Promise<TrainingDataRow[] | null> {
    // Only allow non-anonymous users
    if (!user || user.isAnonymous) {
        console.log('Skipping GCS load: user is anonymous or not authenticated')
        return null
    }

    if (!storage) {
        console.error('Firebase Storage not initialized')
        return null
    }

    try {
        const userId = user.uid
        const storagePath = getStoragePath(userId, modelId.replace('/', '-'))
        const storageRef = ref(storage, storagePath)

        // Download the file
        const bytes = await getBytes(storageRef)
        const jsonlContent = new TextDecoder().decode(bytes)

        // Parse JSONL back to rows
        const rows = parseJSONL(jsonlContent)

        console.log(`Training data loaded from GCS: ${storagePath}`)
        return rows
    } catch (error: any) {
        // If file doesn't exist, return null (not an error)
        if (error?.code === 'storage/object-not-found') {
            console.log('No training data found in GCS for this model')
            return null
        }

        console.error('Failed to load training data from GCS:', error)
        return null
    }
}

/**
 * Delete training data from Firebase Storage (GCS)
 * Only works for authenticated (non-anonymous) users
 *
 * @param user - Firebase user object
 * @param modelId - Model identifier
 */
export async function deleteTrainingDataFromGCS(
    user: User | null,
    modelId: string
): Promise<void> {
    // Only allow non-anonymous users
    if (!user || user.isAnonymous) {
        console.log('Skipping GCS delete: user is anonymous or not authenticated')
        return
    }

    if (!storage) {
        console.error('Firebase Storage not initialized')
        return
    }

    try {
        const userId = user.uid
        const storagePath = getStoragePath(userId, modelId)
        const storageRef = ref(storage, storagePath)

        await deleteObject(storageRef)

        console.log(`Training data deleted from GCS: ${storagePath}`)
    } catch (error: any) {
        // If file doesn't exist, that's okay
        if (error?.code === 'storage/object-not-found') {
            console.log('No training data to delete in GCS')
            return
        }

        console.error('Failed to delete training data from GCS:', error)
        throw error
    }
}
