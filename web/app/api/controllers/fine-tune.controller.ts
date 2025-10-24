import { AuthContext } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';

/**
 * Fine-tune Controller
 * Handles fine-tuning requests
 */
export class FineTuneController {

    static async initiateFineTune(c: AuthContext): Promise<Response> {
        const user = c.get('user') as AuthContext['user'];
        if (user?.isAnonymous) {
            throw new ApiError(
                403,
                'User is not authorized to perform this action',
                'Authorization Error'
            );
        }

        return new Response('Fine-tuning initiated');
    }

}