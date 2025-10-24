import { Context } from 'hono';
import { ErrorResponse } from '../types';
import { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    constructor(
        public statusCode: number,
        public message: string,
        public error: string = 'API Error'
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Global error handler middleware
 */
export const errorHandler = async (err: Error, c: Context) => {
    console.error('API Error:', err);

    if (err instanceof ApiError) {
        const response: ErrorResponse = {
            error: err.error,
            message: err.message,
            statusCode: err.statusCode,
        };

        return c.json(response, err.statusCode as ContentfulStatusCode);
    }

    // Handle unexpected errors
    const response: ErrorResponse = {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err.message,
        statusCode: 500,
    };

    return c.json(response, 500);
};

/**
 * Async handler wrapper to catch errors
 */
export const asyncHandler = (
    fn: (c: Context) => Promise<Response>
) => {
    return async (c: Context) => {
        try {
            return await fn(c);
        } catch (error) {
            return errorHandler(error as Error, c);
        }
    };
};
