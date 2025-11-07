import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { ChatController } from '../controllers/chat.controller';
import { CompletionController } from '../controllers/completion.controller';
import { TrainingDataController } from '../controllers/training-data.controller';
import { FineTuneController } from '../controllers/fine-tune.controller';
import { ModelNameController } from '../controllers/model-name.controller';
import { ModelVersionsController } from '../controllers/model-versions.controller';
import { errorHandler } from '../middleware/error-handler';
import { API_CONFIG } from '../config/constants';
import { authMiddleware } from '../middleware/auth';
import { validateRequest, validateQuery, schemas } from '../middleware/validation';
import { rateLimitMiddleware, RateLimitPresets } from '../middleware/rate-limit';
import { setGlobalDispatcher, Agent } from 'undici';

// Workaround for Vercel Workflow long-running steps in local development
// See: https://github.com/vercel/workflow/issues/137
setGlobalDispatcher(new Agent({
    headersTimeout: 0,
}));

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const app = new Hono().basePath(API_CONFIG.BASE_PATH);
app.onError(errorHandler);

/**
 * Health check endpoint
 * GET /api/health
 */
app.get(
    '/health',
    rateLimitMiddleware(RateLimitPresets.generous),
    (c) => {
        return c.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'tuneloom-api',
        });
    }
);

/**
 * Chat endpoint
 * POST /api/chat
 * Stream chat responses using the custom model
 */
app.post(
    '/chat',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.streaming),
    validateRequest(schemas.chatRequest),
    ChatController.streamChat
);

/**
 * Completion endpoint
 * POST /api/completion
 * Stream text completions using the custom model
 */
app.post(
    '/completion',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.streaming),
    validateRequest(schemas.completionRequest),
    CompletionController.streamCompletion
);

/**
 * Training data generation endpoint
 * POST /api/generate-training-data
 * Generate training data examples for fine-tuning
 */
app.post(
    '/generate-training-data',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.trainingData),
    validateRequest(schemas.trainingDataRequest),
    TrainingDataController.generateTrainingData
);

/**
 * Fine-tune job endpoints
 * POST /api/fine-tune/start
 * Start a new fine-tune job
 */
app.post(
    '/fine-tune/start',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.fineTune),
    validateRequest(schemas.startFineTuneRequest),
    FineTuneController.startFineTune
);

/**
 * Get API key endpoint
 * GET /api/fine-tune/api-key/:keyId
 * Retrieve the decrypted API key for a model
 */
app.get(
    '/fine-tune/api-key/:keyId',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.moderate),
    FineTuneController.getApiKey
);

/**
 * Model name availability check endpoint
 * GET /api/check-model-name?name=<modelName>
 * Check if a model name is available for use
 */
app.get(
    '/check-model-name',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.moderate),
    validateQuery(schemas.checkModelNameQuery),
    ModelNameController.checkModelName
);

/**
 * Activate a specific version
 * POST /api/models/:modelId/versions/:versionId/activate
 */
app.post(
    '/models/:modelId/versions/:versionId/activate',
    authMiddleware,
    rateLimitMiddleware(RateLimitPresets.moderate),
    ModelVersionsController.activateVersion
);

/**
 * 404 handler for undefined routes
 */
app.notFound((c) => {
    return c.json(
        {
            error: 'Not Found',
            message: 'The requested endpoint does not exist',
            statusCode: 404,
        },
        404
    );
});

// Export handlers for Next.js API routes
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
