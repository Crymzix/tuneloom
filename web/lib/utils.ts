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
function convertTimestamp(timestamp: any): Date {
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    if (timestamp?.toDate) {
        return timestamp.toDate();
    }
    return timestamp;
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
export function convertFirestoreTimestamps<T = any>(data: any): T {
    if (data === null || data === undefined) {
        return data as T;
    }

    // Handle Timestamp conversion
    if (data instanceof Timestamp || data?.toDate) {
        return convertTimestamp(data) as T;
    }

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => convertFirestoreTimestamps(item)) as T;
    }

    // Handle plain objects
    if (typeof data === 'object' && data.constructor === Object) {
        const converted: any = {};
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                converted[key] = convertFirestoreTimestamps(data[key]);
            }
        }
        return converted as T;
    }

    // Return primitive values as-is
    return data as T;
}