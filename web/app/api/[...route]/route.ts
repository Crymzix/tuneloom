import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { ChatController } from '../controllers/chat.controller';
import { TrainingDataController } from '../controllers/training-data.controller';
import { FineTuneController } from '../controllers/fine-tune.controller';
import { ModelNameController } from '../controllers/model-name.controller';
import { errorHandler } from '../middleware/error-handler';
import { API_CONFIG } from '../config/constants';
import { authMiddleware } from '../middleware/auth';
import { validateRequest, validateQuery, schemas } from '../middleware/validation';

export const dynamic = 'force-dynamic'
export const maxDuration = API_CONFIG.MAX_DURATION;

const app = new Hono().basePath(API_CONFIG.BASE_PATH);
app.onError(errorHandler);

/**
 * Health check endpoint
 * GET /api/health
 */
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'modelsmith-api',
    });
});

/**
 * Chat endpoint
 * POST /api/chat
 * Stream chat responses using the custom model
 */
app.post(
    '/chat',
    authMiddleware,
    validateRequest(schemas.chatRequest),
    ChatController.streamChat
);

/**
 * Training data generation endpoint
 * POST /api/generate-training-data
 * Generate training data examples for fine-tuning
 */
app.post(
    '/generate-training-data',
    authMiddleware,
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
    validateQuery(schemas.checkModelNameQuery),
    ModelNameController.checkModelName
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
