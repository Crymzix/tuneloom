import { JobsClient } from '@google-cloud/run';
import { FineTuneJobConfig } from '../types';

let jobsClient: JobsClient | null = null;

/**
 * Get or create the JobsClient instance
 * Uses FIREBASE_SERVICE_ACCOUNT_KEY environment variable for authentication
 */
function getJobsClient(): JobsClient {
    if (!jobsClient) {
        // Get service account credentials from environment variable
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set');
        }

        const credentials = JSON.parse(serviceAccountKey);
        jobsClient = new JobsClient({
            credentials,
            projectId: credentials.project_id,
        });
    }
    return jobsClient;
}

/**
 * Parameters for queuing a fine-tune job
 */
export interface QueueFineTuneJobParams {
    jobId: string;
    userId: string;
    config: FineTuneJobConfig;
}

/**
 * Create and execute a Cloud Run Job for fine-tuning
 *
 * @param params - Job parameters including jobId, userId, and config
 * @returns The Cloud Run job name
 *
 * @see https://cloud.google.com/nodejs/docs/reference/run/latest/run/v2.jobsclient
 */
export async function executeCloudRunJob(params: QueueFineTuneJobParams): Promise<string> {
    const { jobId, userId, config } = params;

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
                            `--user-id=${userId}`,
                        ]
                    }
                ]
            }
        });

        console.log(`Cloud Run Job execution started: ${execution.name}`);
        const [response] = await execution.promise();
        console.log(`Successfully started execution for job: ${response.name}`);
        if (!response.name) {
            throw new Error('Cloud Run Job execution response missing name');
        }

        return response.name;
    } catch (error) {
        console.error('Error creating Cloud Run Job:', error);

        // Provide more specific error messages
        if (error instanceof Error) {
            if (error.message.includes('permission denied')) {
                throw new Error('Permission denied: Check service account permissions for Cloud Run');
            }
            if (error.message.includes('quota')) {
                throw new Error('Cloud Run quota exceeded. Please try again later.');
            }
        }

        throw new Error(`Failed to create Cloud Run Job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
