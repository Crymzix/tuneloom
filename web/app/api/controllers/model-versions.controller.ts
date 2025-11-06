import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { ModelVersion, Model } from '../types';
import { start } from 'workflow/api';
import { activateModelVersion, ActivateModelVersionParams } from '../workflows/activate-model-version-workflow';

/**
 * Model Versions Controller
 * Handles version management for fine-tuned models
 */
export class ModelVersionsController {

    /**
     * Set a version as active
     * POST /api/models/:modelId/versions/:versionId/activate
     */
    static async activateVersion(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        if (!user) {
            throw new ApiError(401, 'Authentication required', 'Unauthorized');
        }

        const modelId = c.req.param('modelId');
        const versionId = c.req.param('versionId');

        if (!modelId || !versionId) {
            throw new ApiError(
                400,
                'Model ID and Version ID are required',
                'Bad Request'
            );
        }

        try {
            const params = {
                modelId,
                modelVersionId: versionId,
                userId: user.uid,
            } as ActivateModelVersionParams

            const run = await start(activateModelVersion, [params]);
            // Wait for the workflow to complete
            await run.returnValue;

            return c.json({
                success: true,
                message: 'Version activated successfully',
                modelId,
                versionId,
            });
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error activating version:', error);
            throw new ApiError(
                500,
                'Failed to activate version',
                error instanceof Error ? error.message : 'Internal Server Error'
            );
        }
    }

}
