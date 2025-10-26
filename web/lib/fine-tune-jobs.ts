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
    Timestamp,
} from 'firebase/firestore';

/**
 * Fine-tune job status types
 */
export type FineTuneJobStatus = 'queued' | 'running' | 'completed' | 'failed';

/**
 * Fine-tune job interface matching Firestore document
 */
export interface FineTuneJob {
    id: string;
    userId: string;
    config: {
        baseModel: string;
        outputModelName: string;
        trainingDataPath: string;
        gcsBucket: string;
        [key: string]: any;
    };
    status: FineTuneJobStatus;
    progress: number;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    error?: string;
    modelUrl?: string;
    cloudRunJobName?: string;
}

/**
 * Convert Firestore timestamp to Date
 */
function convertTimestamp(timestamp: any): Date {
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    if (timestamp?.toDate) {
        return timestamp.toDate();
    }
    return timestamp;
}

/**
 * Convert Firestore document to FineTuneJob
 */
function docToJob(doc: any): FineTuneJob {
    const data = doc.data();
    return {
        id: doc.id,
        userId: data.userId,
        config: data.config,
        status: data.status,
        progress: data.progress || 0,
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt),
        startedAt: data.startedAt ? convertTimestamp(data.startedAt) : undefined,
        completedAt: data.completedAt ? convertTimestamp(data.completedAt) : undefined,
        failedAt: data.failedAt ? convertTimestamp(data.failedAt) : undefined,
        error: data.error,
        modelUrl: data.modelUrl,
        cloudRunJobName: data.cloudRunJobName,
    };
}

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
    userId: string,
    onUpdate: (jobs: FineTuneJob[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    const jobsRef = collection(firestore, 'fine-tune-jobs');
    const q = query(
        jobsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const jobs = snapshot.docs.map(docToJob);
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
    return snapshot.docs.map(docToJob);
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

    return docToJob(jobDoc);
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
                onUpdate(docToJob(doc));
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
