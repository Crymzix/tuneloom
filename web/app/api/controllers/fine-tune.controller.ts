import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
    StartFineTuneRequest,
    StartFineTuneResponse,
    FineTuneJob,
    FineTuneJobConfig
} from '../types';
import { getStorage } from 'firebase-admin/storage';
import { start } from 'workflow/api';
import { queueFineTuneJob } from '../workflows/fine-tune-workflow';

/**
 * Fine-tune Controller
 * Handles fine-tuning requests
 */
export class FineTuneController {

    /**
     * Start a new fine-tune job
     * POST /api/fine-tune/start
     *
     * Uses a single Firestore transaction to:
     * 1. Check/create model (ensuring model name uniqueness per user)
     * 2. Verify no running jobs exist for this user
     * 3. Create the fine-tune job
     *
     * The job is queued asynchronously in the background, allowing the API to return immediately.
     */
    static async startFineTune(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        // Check authentication
        if (!user) {
            throw new ApiError(
                401,
                'Authentication required',
                'Unauthorized'
            );
        }

        if (user.isAnonymous) {
            throw new ApiError(
                403,
                'Anonymous users cannot start fine-tune jobs. Please sign in.',
                'Authorization Error'
            );
        }

        const body = c.get('validatedData') as StartFineTuneRequest;

        const firestore = getAdminFirestore();

        try {
            const result = await firestore.runTransaction(async (transaction) => {
                // 1. Check/create model
                const modelsRef = firestore.collection('models');
                const modelQuery = modelsRef
                    .where('name', '==', body.modelName)
                    .limit(1);
                const modelSnapshot = await transaction.get(modelQuery);

                let modelId: string;

                if (!modelSnapshot.empty) {
                    // Model with this name exists
                    const existingDoc = modelSnapshot.docs[0];
                    const existingData = existingDoc.data();

                    if (existingData.userId === user.uid) {
                        // Model exists and belongs to this user
                        modelId = existingDoc.id;
                    } else {
                        // Model exists but belongs to different user
                        throw new ApiError(
                            409,
                            `Model name "${body.modelName}" is already taken by another user. Please choose a different name.`,
                            'Conflict'
                        );
                    }
                } else {
                    // Model doesn't exist, create it
                    const now = new Date();
                    const newModelRef = modelsRef.doc();

                    const modelData = {
                        userId: user.uid,
                        name: body.modelName,
                        baseModel: body.baseModel,
                        status: 'active',
                        createdAt: now,
                        updatedAt: now,
                    };

                    transaction.set(newModelRef, modelData);
                    modelId = newModelRef.id;
                }

                // 2. Check for any running jobs for this user
                const jobsRef = firestore.collection('fine-tune-jobs');
                const runningJobsQuery = jobsRef
                    .where('userId', '==', user.uid)
                    .where('status', 'in', ['queued', 'running']);

                const runningJobsSnapshot = await transaction.get(runningJobsQuery);

                if (!runningJobsSnapshot.empty) {
                    const runningJob = runningJobsSnapshot.docs[0].data();
                    throw new ApiError(
                        409,
                        `You already have a ${runningJob.status} job. Please wait for it to complete before starting a new one.`,
                        'Conflict'
                    );
                }

                // 3. Create the fine-tune job
                const newJobRef = jobsRef.doc();
                const now = new Date();

                const bucket = getStorage().bucket();
                const trainingDataPath = `training-data/${user.uid}/${body.baseModel.replace('/', '-')}`;
                const jobConfig: FineTuneJobConfig = {
                    baseModel: body.baseModel,
                    outputModelName: body.modelName,
                    trainingDataPath,
                    gcsBucket: bucket.name,
                };

                const newJob: Omit<FineTuneJob, 'id'> = {
                    userId: user.uid,
                    modelId: modelId,
                    config: jobConfig,
                    status: 'queued',
                    progress: 0,
                    createdAt: now,
                    updatedAt: now,
                };

                transaction.set(newJobRef, newJob);

                return {
                    jobId: newJobRef.id,
                    status: 'queued' as const,
                };
            });

            await start(queueFineTuneJob, [result.jobId]);

            const response: StartFineTuneResponse = {
                jobId: result.jobId,
                status: result.status,
                message: 'Fine-tune job created successfully. Job is being queued for processing.',
            };

            return c.json(response, 201);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error creating fine-tune job:', error);
            throw new ApiError(
                500,
                'Failed to create fine-tune job',
                'Internal Server Error'
            );
        }
    }

}