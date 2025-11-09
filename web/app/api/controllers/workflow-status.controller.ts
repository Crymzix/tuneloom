import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { getRun } from 'workflow/api';

/**
 * Workflow Status Controller
 * Handles status checking for long-running workflow jobs
 */
export class WorkflowStatusController {

    /**
     * Check the status of a workflow run
     * GET /api/workflows/status?runId=<runId>
     */
    static async checkStatus(c: AuthContext): Promise<Response> {
        const user = c.get('user');

        if (!user) {
            throw new ApiError(401, 'Authentication required', 'Unauthorized');
        }

        const runId = c.req.query('runId');

        if (!runId) {
            throw new ApiError(
                400,
                'runId query parameter is required',
                'Bad Request'
            );
        }

        try {
            // Retrieve the existing run
            const run = getRun(runId);

            // Check its status
            const status = await run.status;

            if (status === 'completed') {
                const result = await run.returnValue;
                return c.json({
                    status,
                    result
                });
            }

            return c.json({ status });
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Error checking workflow status:', error);
            throw new ApiError(
                500,
                'Failed to check workflow status',
                error instanceof Error ? error.message : 'Internal Server Error'
            );
        }
    }

}
