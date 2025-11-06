import { Context, Next } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { ApiError } from './error-handler';
import { AuthContext } from './auth';
import { Redis } from '@upstash/redis';

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
    /**
     * Maximum number of requests allowed
     */
    maxRequests: number;

    /**
     * Time window in seconds or string format (e.g., "10 s", "1 m", "1 h", "1 d")
     */
    window: number | string;

    /**
     * Rate limit strategy
     * - 'ip': Rate limit based on IP address (default)
     * - 'user': Rate limit based on authenticated user ID
     * - 'both': Apply both IP and user rate limits
     */
    strategy?: 'ip' | 'user' | 'both';

    /**
     * Algorithm to use
     * - 'slidingWindow': More accurate, prevents bursts
     * - 'fixedWindow': Simple, cheaper on Redis
     * - 'tokenBucket': Allows controlled bursts
     */
    algorithm?: 'slidingWindow' | 'fixedWindow' | 'tokenBucket';

    /**
     * Prefix for Redis keys
     */
    prefix?: string;

    /**
     * Custom error message
     */
    errorMessage?: string;
}

/**
 * Normalize window to milliseconds
 */
function normalizeWindow(window: number | string): number {
    if (typeof window === 'number') {
        return window * 1000; // Convert seconds to milliseconds
    }

    const match = window.match(/^(\d+)\s*([smhd])$/);
    if (!match) {
        throw new Error(`Invalid window format: ${window}. Use format like "10 s", "1 m", "1 h", "1 d"`);
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const units: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    return num * units[unit];
}

/**
 * Create a rate limiter instance
 */
function createRateLimiter(config: RateLimitConfig): Ratelimit {
    const windowMs = normalizeWindow(config.window);
    const algorithm = config.algorithm || 'slidingWindow';

    const algorithmConfig = {
        slidingWindow: () =>
            Ratelimit.slidingWindow(config.maxRequests, `${windowMs} ms`),
        fixedWindow: () =>
            Ratelimit.fixedWindow(config.maxRequests, `${windowMs} ms`),
        tokenBucket: () =>
            Ratelimit.tokenBucket(config.maxRequests, `${windowMs} ms`, config.maxRequests),
    };

    return new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: algorithmConfig[algorithm](),
        prefix: config.prefix || 'ratelimit',
        analytics: true, // Enable analytics in Upstash console
    });
}

/**
 * Get client IP address from request
 */
function getClientIP(c: Context): string {
    // Check various headers in order of preference
    const headers = [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip', // Cloudflare
        'true-client-ip',   // Cloudflare Enterprise
        'x-client-ip',
    ];

    for (const header of headers) {
        const value = c.req.header(header);
        if (value) {
            // x-forwarded-for can contain multiple IPs, take the first one
            return value.split(',')[0].trim();
        }
    }

    // Fallback to a default (this shouldn't happen on Vercel)
    return 'unknown';
}

/**
 * Rate limiting middleware factory
 * Creates a middleware function with the specified rate limit configuration
 *
 * @example
 * // IP-based rate limiting (60 requests per minute)
 * app.post('/api/chat', rateLimitMiddleware({ maxRequests: 60, window: '1 m' }), handler);
 *
 * @example
 * // User-based rate limiting (1000 requests per day)
 * app.post('/api/chat',
 *   authMiddleware,
 *   rateLimitMiddleware({ maxRequests: 1000, window: '1 d', strategy: 'user' }),
 *   handler
 * );
 *
 * @example
 * // Both IP and user rate limiting
 * app.post('/api/expensive',
 *   authMiddleware,
 *   rateLimitMiddleware({ maxRequests: 10, window: '1 h', strategy: 'both' }),
 *   handler
 * );
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
    const strategy = config.strategy || 'ip';

    // Create rate limiters based on strategy
    const ipLimiter = (strategy === 'ip' || strategy === 'both')
        ? createRateLimiter({ ...config, prefix: `${config.prefix || 'ratelimit'}:ip` })
        : null;

    const userLimiter = (strategy === 'user' || strategy === 'both')
        ? createRateLimiter({ ...config, prefix: `${config.prefix || 'ratelimit'}:user` })
        : null;

    return async function (c: AuthContext, next: Next) {
        try {
            const results: Array<{ success: boolean; limit: number; remaining: number; reset: number }> = [];

            // Check IP-based rate limit
            if (ipLimiter) {
                const ip = getClientIP(c);
                const ipResult = await ipLimiter.limit(ip);
                results.push(ipResult);

                if (!ipResult.success) {
                    const retryAfter = Math.ceil((ipResult.reset - Date.now()) / 1000);

                    throw new ApiError(
                        429,
                        config.errorMessage || `Rate limit exceeded. Too many requests from your IP address. Try again in ${retryAfter} seconds.`,
                        'Too Many Requests',

                    );
                }
            }

            // Check user-based rate limit
            if (userLimiter) {
                const user = c.get('user');

                if (!user) {
                    throw new ApiError(
                        401,
                        'Authentication required for this endpoint',
                        'Unauthorized'
                    );
                }

                const userResult = await userLimiter.limit(user.uid);
                results.push(userResult);

                if (!userResult.success) {
                    const retryAfter = Math.ceil((userResult.reset - Date.now()) / 1000);

                    throw new ApiError(
                        429,
                        config.errorMessage || `Rate limit exceeded. You have reached your usage quota. Try again in ${retryAfter} seconds.`,
                        'Too Many Requests',
                    );
                }
            }

            // Add rate limit headers to response
            if (results.length > 0) {
                // Use the most restrictive limit for headers
                const mostRestrictive = results.reduce((prev, curr) =>
                    curr.remaining < prev.remaining ? curr : prev
                );

                c.header('X-RateLimit-Limit', mostRestrictive.limit.toString());
                c.header('X-RateLimit-Remaining', mostRestrictive.remaining.toString());
                c.header('X-RateLimit-Reset', new Date(mostRestrictive.reset).toISOString());
            }

            await next();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            // Log unexpected errors but don't block the request
            console.error('Rate limiting error:', error);
            await next();
        }
    };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimitPresets = {
    /**
     * Strict rate limit for expensive operations (e.g., fine-tuning)
     * 5 requests per hour per user
     */
    strict: {
        maxRequests: 5,
        window: '1 h',
        strategy: 'user' as const,
        algorithm: 'slidingWindow' as const,
    },

    /**
     * Moderate rate limit for API endpoints
     * 60 requests per minute per IP, 1000 per day per user
     */
    moderate: {
        maxRequests: 60,
        window: '1 m',
        strategy: 'ip' as const,
        algorithm: 'slidingWindow' as const,
    },

    /**
     * Generous rate limit for lightweight operations
     * 200 requests per minute per IP
     */
    generous: {
        maxRequests: 200,
        window: '1 m',
        strategy: 'ip' as const,
        algorithm: 'fixedWindow' as const,
    },

    /**
     * Streaming endpoint protection
     * Limits concurrent requests to prevent resource exhaustion
     * 10 requests per 10 seconds per IP, with user limits on top
     */
    streaming: {
        maxRequests: 10,
        window: '10 s',
        strategy: 'both' as const,
        algorithm: 'tokenBucket' as const,
    },

    /**
     * Fine-tuning job protection
     * Very strict limits to prevent GCP credit exhaustion
     * 5 jobs per month per user
     */
    fineTune: {
        maxRequests: 5,
        window: '30 d',
        strategy: 'user' as const,
        algorithm: 'slidingWindow' as const,
        errorMessage: 'You have reached your monthly fine-tuning limit. Please try again next month or contact support for higher limits.',
    },

    /**
     * Training data generation
     * 100 requests per day per user (uses Google AI API)
     */
    trainingData: {
        maxRequests: 100,
        window: '1 d',
        strategy: 'user' as const,
        algorithm: 'slidingWindow' as const,
    },
};
