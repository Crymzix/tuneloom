import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { ChatController } from '../controllers/chat.controller';
import { TrainingDataController } from '../controllers/training-data.controller';
import { errorHandler } from '../middleware/error-handler';
import { API_CONFIG } from '../config/constants';
import { authMiddleware } from '../middleware/auth';

// Next.js configuration
export const dynamic = 'force-dynamic'
export const maxDuration = API_CONFIG.MAX_DURATION;

/**
 * Initialize Hono app with base path
 */
const app = new Hono().basePath(API_CONFIG.BASE_PATH);

/**
 * Global error handler
 */
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
app.post('/chat', authMiddleware, ChatController.streamChat);

/**
 * Training data generation endpoint
 * POST /api/generate-training-data
 * Generate training data examples for fine-tuning
 */
app.post('/generate-training-data', authMiddleware, TrainingDataController.generateTrainingData);

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
