import { clsx, type ClassValue } from "clsx"
import { Timestamp } from "firebase/firestore"
import { Inter, Pacifico } from "next/font/google"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const interFont = Inter({ subsets: ["latin"] })

export const pacificoFont = Pacifico({ subsets: ["latin"], weight: "400" })

export function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(date)
}

/**
 * Convert Firestore timestamp to Date
 */
function convertTimestamp(timestamp: Timestamp | { toDate: () => Date } | Date): Date {
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp) {
        return timestamp.toDate();
    }
    return timestamp as Date;
}

/**
 * Recursively convert all Firestore Timestamps in an object to Date objects
 *
 * @param data - The object containing Firestore data (can be nested)
 * @returns A new object with all Timestamps converted to Dates
 *
 * @example
 * ```ts
 * const doc = await getDoc(docRef);
 * const data = convertFirestoreTimestamps(doc.data());
 * // All timestamp fields are now Date objects
 * ```
 */
export function convertFirestoreTimestamps<T = unknown>(data: unknown): T {
    if (data === null || data === undefined) {
        return data as T;
    }

    // Handle Timestamp conversion
    if (data instanceof Timestamp) {
        return convertTimestamp(data) as T;
    }

    if (typeof data === 'object' && data !== null && 'toDate' in data && typeof (data as { toDate?: unknown }).toDate === 'function') {
        return convertTimestamp(data as { toDate: () => Date }) as T;
    }

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => convertFirestoreTimestamps(item)) as T;
    }

    // Handle plain objects
    if (typeof data === 'object' && data.constructor === Object) {
        const converted: Record<string, unknown> = {};
        const dataRecord = data as Record<string, unknown>;
        for (const key in dataRecord) {
            if (Object.prototype.hasOwnProperty.call(dataRecord, key)) {
                converted[key] = convertFirestoreTimestamps(dataRecord[key]);
            }
        }
        return converted as T;
    }

    // Return primitive values as-is
    return data as T;
}