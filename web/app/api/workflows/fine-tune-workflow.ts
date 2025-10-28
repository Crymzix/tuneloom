import { FatalError } from "workflow";
import { getAdminFirestore } from "../../../lib/firebase-admin";
import { getJobsClient } from "../config/providers";
import { FineTuneJob, FineTuneJobConfig, ModelApiKey } from "../types";
import crypto from 'crypto'

/**
 * Parameters for queuing a fine-tune job
 */
export interface QueueFineTuneJobParams {
    jobId: string;
    userId: string;
    config: FineTuneJobConfig;
}

export async function queueFineTuneJob(jobId: string) {
    "use workflow";

    try {
        const jobData = await fetchJobData(jobId);

        const cloudRunJobName = await executeCloudRunJob({
            jobId,
            userId: jobData.userId,
            config: jobData.config,
        });

        await updateJobWithCloudRunName(jobId, cloudRunJobName);

        // Create API
        await generateApiKeyForModel(
            jobId,
            jobData.config.outputModelName,
            jobData.modelId,
            jobData.userId
        );

        console.log(`Fine-tune job ${jobId} queued successfully: ${cloudRunJobName}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to queue job';
        await markJobAsFailed(jobId, errorMessage);

        console.error('Error queuing fine-tune job:', error);
    }
}

async function fetchJobData(jobId: string) {
    "use step";
    const firestore = getAdminFirestore();

    const jobDoc = await firestore
        .collection('fine-tune-jobs')
        .doc(jobId)
        .get();

    if (!jobDoc.exists) {
        // Job not found is a non-retryable error
        throw new FatalError('Job not found');
    }

    const data = jobDoc.data() as Omit<FineTuneJob, 'id'>;

    // Convert to plain object to ensure serializability
    // This handles Firestore Timestamps and other non-serializable types
    return JSON.parse(JSON.stringify(data)) as Omit<FineTuneJob, 'id'>;
}

async function updateJobWithCloudRunName(jobId: string, cloudRunJobName: string) {
    "use step";
    const firestore = getAdminFirestore();

    await firestore.collection('fine-tune-jobs').doc(jobId).update({
        cloudRunJobName,
        updatedAt: new Date(),
    });
}

async function markJobAsFailed(jobId: string, errorMessage: string) {
    "use step";
    const firestore = getAdminFirestore();

    await firestore.collection('fine-tune-jobs').doc(jobId).update({
        status: 'failed',
        error: errorMessage,
        failedAt: new Date(),
        updatedAt: new Date(),
    });
}

async function executeCloudRunJob(params: QueueFineTuneJobParams): Promise<string> {
    "use step";
    const { jobId, config } = params;

    const client = getJobsClient();
    const projectId = await client.getProjectId()
    const name = `projects/${projectId}/locations/us-central1/jobs/finetune-job`;

    try {
        // Execute the job
        const [execution] = await client.runJob({
            name,
            overrides: {
                containerOverrides: [
                    {
                        args: [
                            `--base-model=${config.baseModel}`,
                            `--output-model-name=${config.outputModelName}`,
                            `--training-data-path=${config.trainingDataPath}`,
                            `--gcs-bucket=${config.gcsBucket}`,
                            `--job-id=${jobId}`,
                        ]
                    }
                ]
            }
        });

        console.log(`Cloud Run Job execution started: ${execution.name}`);
        const [response] = await execution.promise();
        console.log(`Successfully started execution for job: ${response.name}`);

        if (!response.name) {
            throw new FatalError('Cloud Run Job execution response missing name');
        }

        return response.name;
    } catch (error) {
        console.error('Error creating Cloud Run Job:', error);

        // Permission and quota errors are non-retryable
        if (error instanceof Error) {
            if (error.message.includes('permission denied')) {
                throw new FatalError('Permission denied: Check service account permissions for Cloud Run');
            }
            if (error.message.includes('quota')) {
                throw new FatalError('Cloud Run quota exceeded. Please try again later.');
            }
        }

        // Other errors may be transient, allow retries
        throw new FatalError(`Failed to create Cloud Run Job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function generateApiKeyForModel(jobId: string, modelName: string, modelId: string, userId: string) {
    "use step";
    const firestore = getAdminFirestore();

    const keySecret = `sk_${crypto.randomBytes(32).toString('base64url')}`;
    const keyId = `ak_${crypto.randomBytes(16).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(keySecret).digest('hex');

    await firestore
        .collection('api-keys')
        .doc(keyId)
        .set({
            keyHash,
            userId,
            modelId,
            modelName,
            createdAt: new Date(),
            lastUsedAt: null,
            expiresAt: null,
            isActive: true,
            type: 'fine-tuned',
        } as ModelApiKey)

    await firestore.collection('fine-tune-jobs').doc(jobId).update({
        apiKeyId: keyId,
        inferenceUrl: `${process.env.OPENAI_COMPATIBLE_BASE_URL}/${modelName}`
    });

    return { keyId, keySecret }
}