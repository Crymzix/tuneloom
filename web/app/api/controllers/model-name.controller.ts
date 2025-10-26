import { Context } from 'hono';
import { getStorage } from 'firebase-admin/storage';

/**
 * Controller for model name validation and availability checking
 */
export class ModelNameController {
    /**
     * Check if a model name is available
     * GET /api/check-model-name?name=<modelName>
     *
     * Note: Validation is handled by Zod middleware
     */
    static async checkModelName(c: Context) {
        try {
            // Get validated query from context (validated by Zod middleware)
            const validatedQuery = c.get('validatedQuery') as { name: string };
            const modelName = validatedQuery.name;

            // Check if model exists in Firebase Storage
            const bucket = getStorage().bucket();
            const folderPath = `models/${modelName}/`;

            // Check if any files exist with this model name prefix
            const [files] = await bucket.getFiles({
                prefix: folderPath,
                maxResults: 1,
            });

            const available = files.length === 0;

            return c.json({
                available,
                modelName,
            });
        } catch (error) {
            console.error('Error checking model name availability:', error);
            return c.json(
                {
                    available: false,
                    error: 'Failed to check model name availability',
                },
                500
            );
        }
    }
}
