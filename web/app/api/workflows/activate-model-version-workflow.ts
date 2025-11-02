import { FatalError } from "workflow";
import { getAdminFirestore } from "../../../lib/firebase-admin";
import { Model, ModelVersion } from "../types";

export interface ActivateModelVersionParams {
    modelId: string;
    modelVersionId: string;
    userId: string;
}

export async function activateModelVersion(params: ActivateModelVersionParams) {
    "use workflow";

    const modelName = await updateModelVersioning(
        params.modelId,
        params.modelVersionId,
        params.userId
    );

    if (modelName) {
        await invalidateInferenceCache(modelName);
    }
}

async function updateModelVersioning(
    modelId: string,
    modelVersionId: string,
    userId: string
) {
    "use step";

    const firestore = getAdminFirestore();

    let modelName: string = '';

    await firestore.runTransaction(async (transaction) => {
        const modelRef = firestore.collection('models').doc(modelId);
        const modelDoc = await transaction.get(modelRef);

        if (!modelDoc.exists) {
            throw new FatalError('Model not found when activating version');
        }

        const modelData = modelDoc.data() as Model;
        modelName = modelData.name; // Save for cache invalidation

        if (modelData.userId !== userId) {
            throw new FatalError('User does not own the model they are trying to activate a version for');
        }

        // Check that the version exists and is ready
        const versionRef = modelRef.collection('versions').doc(modelVersionId);
        const versionDoc = await transaction.get(versionRef);

        if (!versionDoc.exists) {
            throw new FatalError('Version not found when activating version');
        }

        const versionData = versionDoc.data() as Omit<ModelVersion, 'id'>;

        if (versionData.status !== 'ready') {
            throw new FatalError(
                `Cannot activate version with status: ${versionData.status}. Version must be ready.`
            );
        }

        transaction.update(modelRef, {
            activeVersionId: modelVersionId,
            updatedAt: new Date(),
        });
    });

    return modelName;
}

async function invalidateInferenceCache(modelName: string) {
    "use step";

    const inferenceUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!inferenceUrl) {
        console.warn('OPENAI_COMPATIBLE_BASE_URL not configured, skipping cache invalidation');
        return;
    }

    const url = `${inferenceUrl}/admin/invalidate-cache/${modelName}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BASE_MODEL_API_KEY}`,
        },
    });

    if (!response.ok) {
        console.warn(`Inference cache invalidation returned ${response.status} for ${modelName}`);
    } else {
        console.log(`Successfully invalidated inference cache for ${modelName}`);
    }
}