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
     * List all versions for a model
     * GET /api/models/:modelId/versions
     */
    static async listVersions(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        if (!user) {
            throw new ApiError(401, 'Authentication required', 'Unauthorized');
        }

        const modelId = c.req.param('modelId');

        if (!modelId) {
            throw new ApiError(400, 'Model ID is required', 'Bad Request');
        }

        try {
            const firestore = getAdminFirestore();

            // Verify model ownership
            const modelRef = firestore.collection('models').doc(modelId);
            const modelDoc = await modelRef.get();

            if (!modelDoc.exists) {
                throw new ApiError(404, 'Model not found', 'Not Found');
            }

            const modelData = modelDoc.data() as Model;
            if (modelData.userId !== user.uid) {
                throw new ApiError(
                    403,
                    'You do not have permission to access this model',
                    'Forbidden'
                );
            }

            // Get all versions
            const versionsRef = modelRef.collection('versions');
            const versionsSnapshot = await versionsRef
                .orderBy('versionNumber', 'desc')
                .get();

            const versions: ModelVersion[] = versionsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() as Omit<ModelVersion, 'id'>),
            }));

            return c.json({
                modelId,
                modelName: modelData.name,
                activeVersionId: modelData.activeVersionId,
                versions,
            });
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error listing model versions:', error);
            throw new ApiError(
                500,
                'Failed to list model versions',
                'Internal Server Error'
            );
        }
    }

    /**
     * Get a specific version
     * GET /api/models/:modelId/versions/:versionId
     */
    static async getVersion(c: AuthContext): Promise<Response> {
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
            const firestore = getAdminFirestore();

            // Verify model ownership
            const modelRef = firestore.collection('models').doc(modelId);
            const modelDoc = await modelRef.get();

            if (!modelDoc.exists) {
                throw new ApiError(404, 'Model not found', 'Not Found');
            }

            const modelData = modelDoc.data() as Model;
            if (modelData.userId !== user.uid) {
                throw new ApiError(
                    403,
                    'You do not have permission to access this model',
                    'Forbidden'
                );
            }

            // Get the version
            const versionRef = modelRef.collection('versions').doc(versionId);
            const versionDoc = await versionRef.get();

            if (!versionDoc.exists) {
                throw new ApiError(404, 'Version not found', 'Not Found');
            }

            const version: ModelVersion = {
                id: versionDoc.id,
                ...(versionDoc.data() as Omit<ModelVersion, 'id'>),
            };

            return c.json(version);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error getting model version:', error);
            throw new ApiError(
                500,
                'Failed to get model version',
                'Internal Server Error'
            );
        }
    }

    /**
     * Get the active version for a model
     * GET /api/models/:modelId/active-version
     */
    static async getActiveVersion(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        if (!user) {
            throw new ApiError(401, 'Authentication required', 'Unauthorized');
        }

        const modelId = c.req.param('modelId');

        if (!modelId) {
            throw new ApiError(400, 'Model ID is required', 'Bad Request');
        }

        try {
            const firestore = getAdminFirestore();

            // Verify model ownership
            const modelRef = firestore.collection('models').doc(modelId);
            const modelDoc = await modelRef.get();

            if (!modelDoc.exists) {
                throw new ApiError(404, 'Model not found', 'Not Found');
            }

            const modelData = modelDoc.data() as Model;
            if (modelData.userId !== user.uid) {
                throw new ApiError(
                    403,
                    'You do not have permission to access this model',
                    'Forbidden'
                );
            }

            // Get active version using the activeVersionId from model
            if (!modelData.activeVersionId) {
                return c.json({ activeVersion: null });
            }

            const versionRef = modelRef
                .collection('versions')
                .doc(modelData.activeVersionId);
            const versionDoc = await versionRef.get();

            if (!versionDoc.exists) {
                return c.json({ activeVersion: null });
            }

            const version: ModelVersion = {
                id: versionDoc.id,
                ...(versionDoc.data() as Omit<ModelVersion, 'id'>),
            };

            return c.json({ activeVersion: version });
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error getting active version:', error);
            throw new ApiError(
                500,
                'Failed to get active version',
                'Internal Server Error'
            );
        }
    }

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
