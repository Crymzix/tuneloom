import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
    StartFineTuneRequest,
    StartFineTuneResponse,
    FineTuneJob,
    FineTuneJobConfig,
    Model,
    ModelApiKey,
    ModelVersion
} from '../types';
import { getStorage } from 'firebase-admin/storage';
import { start } from 'workflow/api';
import { queueFineTuneJob } from '../workflows/fine-tune-workflow';
import { decrypt } from '../utils/encryption';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Fine-tune Controller
 * Handles fine-tuning requests
 */
export class FineTuneController {

    /**
     * Get decrypted API key for a specific API key ID
     * GET /api/fine-tune/api-key/:keyId
     *
     * Returns the actual API key secret (decrypted) for the user to view
     * Only the owner of the API key can retrieve it
     */
    static async getApiKey(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        // Check authentication
        if (!user) {
            throw new ApiError(
                401,
                'Authentication required',
                'Unauthorized'
            );
        }

        const keyId = c.req.param('keyId');

        if (!keyId) {
            throw new ApiError(
                400,
                'API key ID is required',
                'Bad Request'
            );
        }

        try {
            const firestore = getAdminFirestore();

            // Fetch the API key document
            const keyDoc = await firestore
                .collection('api-keys')
                .doc(keyId)
                .get();

            if (!keyDoc.exists) {
                throw new ApiError(
                    404,
                    'API key not found',
                    'Not Found'
                );
            }

            const keyData = keyDoc.data() as ModelApiKey;

            // Verify ownership
            if (keyData.userId !== user.uid) {
                throw new ApiError(
                    403,
                    'You do not have permission to access this API key',
                    'Forbidden'
                );
            }

            // Decrypt the key secret
            const keySecret = decrypt(keyData.keySecretEncrypted);

            return c.json({
                keyId: keyData.keyId,
                keySecret,
                modelName: keyData.modelName,
                createdAt: keyData.createdAt,
                isActive: keyData.isActive,
            });
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error retrieving API key:', error);
            throw new ApiError(
                500,
                'Failed to retrieve API key',
                'Internal Server Error'
            );
        }
    }

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
                // Check model
                let existingModel: Model | null = null;
                if (body.modelName) {
                    const modelsRef = firestore.collection('models');
                    const modelQuery = modelsRef
                        .where('name', '==', body.modelName)
                        .limit(1);
                    const modelSnapshot = await transaction.get(modelQuery);
                    if (!modelSnapshot.empty) {
                        const existingDoc = modelSnapshot.docs[0];
                        const existingData = existingDoc.data();
                        existingModel = {
                            ...existingData,
                            id: existingDoc.id,
                        } as Model;
                    }
                } else if (body.modelId) {
                    const modelRef = firestore.collection('models').doc(body.modelId);
                    const modelDoc = await transaction.get(modelRef);
                    if (modelDoc.exists) {
                        const modelData = modelDoc.data();
                        existingModel = {
                            ...modelData,
                            id: modelDoc.id,
                        } as Model;
                    } else {
                        throw new ApiError(
                            404,
                            'Model not found with the provided modelId',
                            'Not Found'
                        );
                    }
                } else {
                    throw new ApiError(
                        400,
                        'Either modelName or modelId must be provided',
                        'Bad Request'
                    );
                }

                // Check for any running jobs for this user
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

                // Create model if needed
                let model: Model
                let modelRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

                let versionNumber = 1;
                let versionLabel = 'v1';
                let versionRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

                if (existingModel) {
                    if (existingModel.userId === user.uid) {
                        model = existingModel;
                    } else {
                        throw new ApiError(
                            409,
                            `Model name "${body.modelName}" is already taken by another user. Please choose a different name.`,
                            'Conflict'
                        );
                    }

                    modelRef = firestore
                        .collection('models')
                        .doc(model.id);

                    // Get model versions
                    const versionsRef = modelRef.collection('versions');

                    // Get existing versions to calculate version number
                    const existingVersionsSnapshot = await transaction.get(versionsRef);
                    versionNumber = existingVersionsSnapshot.size + 1;
                    versionLabel = `v${versionNumber}`;

                    versionRef = versionsRef.doc();
                } else {
                    // Model doesn't exist, create it
                    const now = new Date();
                    const newModelRef = firestore.collection('models').doc();
                    modelRef = newModelRef;

                    const newModel: Model = {
                        id: newModelRef.id,
                        userId: user.uid,
                        name: body.modelName!,
                        baseModel: body.baseModel,
                        status: 'active',
                        createdAt: now,
                        updatedAt: now,
                        activeVersionId: null,
                        latestVersionId: null,
                        versionCount: 0,
                    };

                    transaction.set(newModelRef, newModel);
                    model = newModel;

                    versionRef = firestore
                        .collection('models')
                        .doc(model.id)
                        .collection('versions')
                        .doc();
                }

                // Create the fine-tune job
                const newJobRef = jobsRef.doc();
                const now = new Date();

                const bucket = getStorage().bucket();
                const trainingDataPath = `training-data/${user.uid}/${body.baseModel.replace('/', '-')}`;
                const jobConfig: FineTuneJobConfig = {
                    baseModel: body.baseModel,
                    outputModelName: model.name,
                    trainingDataPath,
                    gcsBucket: bucket.name,
                };

                const newJob: Omit<FineTuneJob, 'id'> = {
                    userId: user.uid,
                    modelId: model.id,
                    config: jobConfig,
                    status: 'queued',
                    progress: 0,
                    createdAt: now,
                    updatedAt: now,
                    modelVersionId: versionRef.id,
                };

                transaction.set(newJobRef, newJob);

                // Create model version
                const version: Omit<ModelVersion, 'id'> = {
                    modelId: model.id,
                    modelName: model.name,
                    userId: model.userId,
                    versionNumber,
                    versionLabel,
                    fineTuneJobId: newJobRef.id,
                    adapterPath: `models/${model.name}/${versionLabel}`,
                    status: 'building',
                    baseModel: model.baseModel,
                    createdAt: now,
                    updatedAt: now,
                    config: jobConfig,
                };

                transaction.set(versionRef, version);

                // Update model's version tracking
                const updateData = {
                    latestVersionId: versionRef.id,
                    versionCount: FieldValue.increment(1),
                    updatedAt: now,
                };

                transaction.update(modelRef, updateData);

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