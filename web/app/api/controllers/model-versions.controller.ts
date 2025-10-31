import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { ModelVersion, Model } from '../types';

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
            const firestore = getAdminFirestore();

            let modelName: string = '';

            // Run as transaction to ensure consistency
            await firestore.runTransaction(async (transaction) => {
                const modelRef = firestore.collection('models').doc(modelId);
                const modelDoc = await transaction.get(modelRef);

                if (!modelDoc.exists) {
                    throw new ApiError(404, 'Model not found', 'Not Found');
                }

                const modelData = modelDoc.data() as Model;
                modelName = modelData.name; // Save for cache invalidation

                if (modelData.userId !== user.uid) {
                    throw new ApiError(
                        403,
                        'You do not have permission to modify this model',
                        'Forbidden'
                    );
                }

                // Check that the version exists and is ready
                const versionRef = modelRef.collection('versions').doc(versionId);
                const versionDoc = await transaction.get(versionRef);

                if (!versionDoc.exists) {
                    throw new ApiError(404, 'Version not found', 'Not Found');
                }

                const versionData = versionDoc.data() as Omit<ModelVersion, 'id'>;

                if (versionData.status !== 'ready') {
                    throw new ApiError(
                        400,
                        `Cannot activate version with status: ${versionData.status}. Version must be ready.`,
                        'Bad Request'
                    );
                }

                transaction.update(modelRef, {
                    activeVersionId: versionId,
                    updatedAt: new Date(),
                });
            });

            // Invalidate inference service cache for this model (best effort, don't fail activation if this fails)
            if (modelName) {
                try {
                    await this.invalidateInferenceCache(modelName);
                } catch (error) {
                    console.warn(`Failed to invalidate inference cache for ${modelName}:`, error);
                }
            }

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
                'Internal Server Error'
            );
        }
    }

    /**
     * Invalidate inference service cache for a model
     * Called after activating a new version to force re-resolution
     * This is a helper method, not exposed as an endpoint
     */
    private static async invalidateInferenceCache(modelName: string): Promise<void> {
        const inferenceUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;

        if (!inferenceUrl) {
            console.warn('OPENAI_COMPATIBLE_BASE_URL not configured, skipping cache invalidation');
            return;
        }

        const url = `${inferenceUrl}/admin/invalidate-cache/${modelName}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.BASE_MODEL_API_KEY}`,
                },
            });

            if (!response.ok) {
                console.warn(`Inference cache invalidation returned ${response.status} for ${modelName}`);
            } else {
                console.log(`Successfully invalidated inference cache for ${modelName}`);
            }
        } catch (error) {
            // Don't throw - this is best effort
            console.warn(`Failed to call inference cache invalidation for ${modelName}:`, error);
        }
    }
}
