import { Context } from 'hono';
import { z, ZodSchema } from 'zod';

/**
 * Validation schemas for API requests
 */
export const schemas = {
    chatRequest: z.object({
        messages: z.array(
            z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string().min(1, 'Message content cannot be empty'),
            })
        ).min(1, 'At least one message is required'),
    }),

    trainingDataRequest: z.object({
        prompt: z.string().min(10, 'Prompt must be at least 10 characters long')
            .max(5000, 'Prompt cannot exceed 5000 characters'),
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
