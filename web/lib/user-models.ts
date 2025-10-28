import { getAdminFirestore } from '@/lib/firebase-admin';
import { Model } from '@/app/api/types';

/**
 * Find a model by name and userId
 * @param name - The model name
 * @param userId - The user ID who owns the model
 * @returns The model document or null if not found
 */
export async function findModelByName(
    name: string,
    userId: string
): Promise<{ id: string; data: Omit<Model, 'id'> } | null> {
    const firestore = getAdminFirestore();
    const modelsRef = firestore.collection('models');

    const snapshot = await modelsRef
        .where('name', '==', name)
        .where('userId', '==', userId)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    return {
        id: doc.id,
        data: doc.data() as Omit<Model, 'id'>
    };
}

/**
 * Verify that a model belongs to a specific user
 * @param modelId - The model ID
 * @param userId - The user ID
 * @returns True if model belongs to user, false otherwise
 */
export async function verifyModelOwnership(
    modelId: string,
    userId: string
): Promise<boolean> {
    const firestore = getAdminFirestore();
    const modelRef = firestore.collection('models').doc(modelId);
    const modelDoc = await modelRef.get();

    if (!modelDoc.exists) {
        return false;
    }

    const modelData = modelDoc.data() as Omit<Model, 'id'>;
    return modelData.userId === userId;
}
