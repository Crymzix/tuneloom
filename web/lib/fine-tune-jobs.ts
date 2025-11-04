import { firestore } from './firebase';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    getDocs,
    doc,
    getDoc,
    Unsubscribe,
} from 'firebase/firestore';
import { convertFirestoreTimestamps } from './utils';
import type {
    FineTuneJob,
    FineTuneJobStatus,
    ModelVersionStatus,
    Model as UserModel,
    ModelVersion,
} from '../app/api/types';

export type { FineTuneJobStatus, ModelVersionStatus, UserModel, ModelVersion };

/**
 * Subscribe to real-time updates for a user's fine-tune jobs
 *
 * @param userId - The authenticated user's ID
 * @param onUpdate - Callback function called when jobs are updated
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```tsx
 * const { user } = useAuth();
 *
 * useEffect(() => {
 *   if (!user) return;
 *
 *   const unsubscribe = subscribeToUserJobs(user.uid, (jobs) => {
 *     setJobs(jobs);
 *   });
 *
 *   return () => unsubscribe();
 * }, [user]);
 * ```
 */
export function subscribeToUserJobs(
    {
        userId,
        modelName,
    }: {
        userId: string;
        modelName?: string;
    },
    onUpdate: (jobs: FineTuneJob[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const jobsRef = collection(firestore, 'fine-tune-jobs');
    let q = query(
        jobsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );
    if (modelName) {
        q = query(
            jobsRef,
            where('userId', '==', userId),
            where('config.outputModelName', '==', modelName),
            orderBy('createdAt', 'desc')
        );
    }

    return onSnapshot(
        q,
        (snapshot) => {
            const jobs = snapshot.docs.map(doc => {
                const fineTuneJob = convertFirestoreTimestamps(doc.data()) as FineTuneJob;
                fineTuneJob.id = doc.id;
                return fineTuneJob;
            });
            onUpdate(jobs);
        },
        (error) => {
            console.error('Error subscribing to fine-tune jobs:', error);
            if (onError) {
                onError(error);
            }
        }
    );
}

/**
 * Get all fine-tune jobs for a user (one-time fetch)
 *
 * @param userId - The authenticated user's ID
 * @returns Array of fine-tune jobs
 *
 * @example
 * ```tsx
 * const jobs = await getUserJobs(user.uid);
 * ```
 */
export async function getUserJobs(userId: string): Promise<FineTuneJob[]> {
    const jobsRef = collection(firestore, 'fine-tune-jobs');
    const q = query(
        jobsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        return convertFirestoreTimestamps(doc.data()) as FineTuneJob
    });
}

/**
 * Get a specific fine-tune job by ID
 *
 * @param jobId - The job document ID
 * @returns The fine-tune job or null if not found
 *
 * @example
 * ```tsx
 * const job = await getJobById('job123');
 * ```
 */
export async function getJobById(jobId: string): Promise<FineTuneJob | null> {
    const jobRef = doc(firestore, 'fine-tune-jobs', jobId);
    const jobDoc = await getDoc(jobRef);

    if (!jobDoc.exists()) {
        return null;
    }

    return convertFirestoreTimestamps(jobDoc.data()) as FineTuneJob;
}

/**
 * Subscribe to real-time updates for a specific job
 *
 * @param jobId - The job document ID
 * @param onUpdate - Callback function called when job is updated
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```tsx
 * const unsubscribe = subscribeToJob(jobId, (job) => {
 *   if (job) setJob(job);
 * });
 * ```
 */
export function subscribeToJob(
    jobId: string,
    onUpdate: (job: FineTuneJob | null) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const jobRef = doc(firestore, 'fine-tune-jobs', jobId);

    return onSnapshot(
        jobRef,
        (doc) => {
            if (doc.exists()) {
                onUpdate(convertFirestoreTimestamps(doc.data()) as FineTuneJob);
            } else {
                onUpdate(null);
            }
        },
        (error) => {
            console.error('Error subscribing to job:', error);
            if (onError) {
                onError(error);
            }
        }
    );
}

/**
 * Subscribe to real-time updates for a user's models filtered by baseModel
 *
 * @param userId - The authenticated user's ID
 * @param baseModel - The base model to filter by
 * @param onUpdate - Callback function called when models are updated
 * @param onError - Optional error handler
 * @returns Unsubscribe function to stop listening
 *
 * @note This query requires a composite index in Firestore:
 * Collection: models
 * Fields: userId (Ascending), baseModel (Ascending), status (Ascending), createdAt (Descending)
 *
 * @example
 * ```tsx
 * const { user } = useAuth();
 * const { selectedModel } = useModelStore();
 *
 * useEffect(() => {
 *   if (!user || !selectedModel) return;
 *
 *   const unsubscribe = subscribeToUserModelsByBaseModel(
 *     user.uid,
 *     selectedModel.hf_id,
 *     (models) => {
 *       setModels(models);
 *     }
 *   );
 *
 *   return () => unsubscribe();
 * }, [user, selectedModel]);
 * ```
 */
export function subscribeToUserModelsByBaseModel(
    userId: string,
    baseModel: string,
    onUpdate: (models: UserModel[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const modelsRef = collection(firestore, 'models');
    const q = query(
        modelsRef,
        where('userId', '==', userId),
        where('baseModel', '==', baseModel),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const models = snapshot.docs.map(doc => {
                const userModel = convertFirestoreTimestamps(doc.data()) as UserModel;
                userModel.id = doc.id;
                return userModel;
            });
            onUpdate(models);
        },
        (error) => {
            console.error('Error subscribing to user models by baseModel:', error);
            if (onError) {
                onError(error);
            }
        }
    );
}

/**
 * Get user's active models filtered by baseModel (one-time fetch)
 *
 * @param userId - The authenticated user's ID
 * @param baseModel - The base model to filter by
 * @returns Array of active user models
 *
 * @note This query requires a composite index in Firestore:
 * Collection: models
 * Fields: userId (Ascending), baseModel (Ascending), status (Ascending), createdAt (Descending)
 *
 * @example
 * ```tsx
 * const models = await getUserModelsByBaseModel(user.uid, 'meta-llama/Llama-3.2-3B-Instruct');
 * ```
 */
export async function getUserModelsByBaseModel(
    userId: string,
    baseModel: string
): Promise<UserModel[]> {
    const modelsRef = collection(firestore, 'models');
    const q = query(
        modelsRef,
        where('userId', '==', userId),
        where('baseModel', '==', baseModel),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        return convertFirestoreTimestamps(doc.data()) as UserModel;
    });
}

/**
 * Subscribe to real-time updates for model versions
 *
 * @param modelId - The model ID
 * @param onUpdate - Callback function called when versions are updated
 * @param onError - Optional error handler
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```tsx
 * const unsubscribe = subscribeToModelVersions(
 *   modelId,
 *   (versions) => {
 *     setVersions(versions);
 *   }
 * );
 *
 * return () => unsubscribe();
 * ```
 */
export function subscribeToModelVersions(
    modelId: string,
    onUpdate: (versions: ModelVersion[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const versionsRef = collection(firestore, 'models', modelId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc'));

    return onSnapshot(
        q,
        (snapshot) => {
            const versions = snapshot.docs.map(doc => {
                const version = convertFirestoreTimestamps(doc.data()) as ModelVersion;
                version.id = doc.id;
                return version;
            });
            onUpdate(versions);
        },
        (error) => {
            console.error('Error subscribing to model versions:', error);
            if (onError) {
                onError(error);
            }
        }
    );
}

/**
 * Get all versions for a model (one-time fetch)
 *
 * @param modelId - The model ID
 * @returns Array of model versions
 *
 * @example
 * ```tsx
 * const versions = await getModelVersions(modelId);
 * ```
 */
export async function getModelVersions(modelId: string): Promise<ModelVersion[]> {
    const versionsRef = collection(firestore, 'models', modelId, 'versions');
    const q = query(versionsRef, orderBy('versionNumber', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const version = convertFirestoreTimestamps(doc.data()) as ModelVersion;
        version.id = doc.id;
        return version;
    });
}
