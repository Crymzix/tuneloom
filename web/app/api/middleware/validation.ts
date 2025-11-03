import { Context } from 'hono';
import { z, ZodSchema } from 'zod';
import { MODEL_IDS } from '../config/constants';

/**
 * Validation schemas for API requests
 */
export const schemas = {
    chatRequest: z.object({
        modelId: z.string().min(1, 'Model ID is required'),
        messages: z.array(
            z.object({
                role: z.enum(['user', 'assistant', 'system']),
                parts: z.array(
                    z.object({
                        type: z.string(),
                        text: z.string().optional(),
                        state: z.string().optional(),
                    }).loose()
                ).min(1, 'At least one part is required'),
                id: z.string().optional(),
            })
        ).min(1, 'At least one message is required'),
        apiKey: z.string().optional(),
    }).loose(), // Allow extra fields

    completionRequest: z.object({
        modelId: z.string().min(1, 'Model ID is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        apiKey: z.string().optional(),
    }).loose(), // Allow extra fields

    trainingDataRequest: z.object({
        prompt: z.string().min(10, 'Prompt must be at least 10 characters long')
            .max(5000, 'Prompt cannot exceed 5000 characters'),
    }),

    modelName: z.string()
        .min(1, 'Model name is required')
        .max(26, 'Model name must be 26 characters or less')
        .regex(/^[a-z0-9-]+$/, 'Model name must contain only lowercase letters, numbers, and hyphens')
        .refine(
            (name) => !name.startsWith('-') && !name.endsWith('-'),
            'Model name cannot start or end with a hyphen'
        )
        .refine(
            (name) => !name.includes('--'),
            'Model name cannot contain consecutive hyphens'
        ),

    startFineTuneRequest: z.object({
        modelId: z.string().optional(),
        modelName: z.string().optional(),
        baseModel: z.string().min(1, 'Base model is required'),

        // Fine-tune hyperparameters as nested object (optional)
        settings: z.object({
            epochs: z.number().min(1).max(100).optional(),
            learningRate: z.number().min(0.000001).max(1).optional(),
            loraRank: z.number().min(1).max(256).optional(),
            loraAlpha: z.number().min(1).max(512).optional(),
            loraDropout: z.number().min(0).max(1).optional(),
        }).optional(),
    }).refine(
        (data) => !!(data.modelId) !== !!(data.modelName),
        {
            message: 'Either modelId or modelName must be provided, but not both',
        }
    ),

    checkModelNameQuery: z.object({
        name: z.string()
            .min(1, 'Model name is required')
            .max(26, 'Model name must be 26 characters or less')
            .regex(/^[a-z0-9-]+$/, 'Model name must contain only lowercase letters, numbers, and hyphens')
            .refine(
                (name) => !name.startsWith('-') && !name.endsWith('-'),
                'Model name cannot start or end with a hyphen'
            )
            .refine(
                (name) => !name.includes('--'),
                'Model name cannot contain consecutive hyphens'
            ),
    }),
};

/**
 * Middleware to validate request body against a Zod schema
 */
export const validateRequest = <T>(schema: ZodSchema<T>) => {
    return async (c: Context, next: () => Promise<void>) => {
        try {
            const body = await c.req.json();
            const validated = schema.parse(body);

            // Store validated data in context for use in handlers
            c.set('validatedData', validated);

            await next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return c.json(
                    {
                        error: 'Validation Error',
                        message: 'Invalid request data',
                        issues: error.issues.map(err => ({
                            path: err.path.join('.'),
                            message: err.message,
                        })),
                    },
                    400
                );
            }

            return c.json(
                {
                    error: 'Bad Request',
                    message: 'Failed to parse request body',
                },
                400
            );
        }
    };
};

/**
 * Middleware to validate query parameters against a Zod schema
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => {
    return async (c: Context, next: () => Promise<void>) => {
        try {
            const query = c.req.query();
            const validated = schema.parse(query);

            // Store validated data in context for use in handlers
            c.set('validatedQuery', validated);

            await next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return c.json(
                    {
                        error: 'Validation Error',
                        message: 'Invalid query parameters',
                        issues: error.issues.map(err => ({
                            path: err.path.join('.'),
                            message: err.message,
                        })),
                    },
                    400
                );
            }

            return c.json(
                {
                    error: 'Bad Request',
                    message: 'Failed to parse query parameters',
                },
                400
            );
        }
    };
};
