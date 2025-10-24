const DB_NAME = 'modelsmith-db'
const DB_VERSION = 1
const STORE_NAME = 'training-data'

interface TrainingDataRow {
    input: string
    output: string
}

// Open or create the IndexedDB database
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'))
        }

        request.onsuccess = () => {
            resolve(request.result)
        }

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result

            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
    })
}

// Save training data to IndexedDB
export async function saveTrainingData(modelId: string, data: TrainingDataRow[]): Promise<void> {
    try {
        const db = await openDatabase()

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const key = `training-rows-${modelId}`
            const request = store.put(data, key)

            request.onsuccess = () => {
                resolve()
            }

            request.onerror = () => {
                reject(new Error('Failed to save training data'))
            }

            transaction.oncomplete = () => {
                db.close()
            }
        })
    } catch (error) {
        console.error('Error saving to IndexedDB:', error)
        throw error
    }
}

// Load training data from IndexedDB
export async function loadTrainingData(modelId: string): Promise<TrainingDataRow[] | null> {
    try {
        const db = await openDatabase()

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly')
            const store = transaction.objectStore(STORE_NAME)
            const key = `training-rows-${modelId}`
            const request = store.get(key)

            request.onsuccess = () => {
                resolve(request.result || null)
            }

            request.onerror = () => {
                reject(new Error('Failed to load training data'))
            }

            transaction.oncomplete = () => {
                db.close()
            }
        })
    } catch (error) {
        console.error('Error loading from IndexedDB:', error)
        return null
    }
}

// Clear training data from IndexedDB
export async function clearTrainingData(modelId: string): Promise<void> {
    try {
        const db = await openDatabase()

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const key = `training-rows-${modelId}`
            const request = store.delete(key)

            request.onsuccess = () => {
                resolve()
            }

            request.onerror = () => {
                reject(new Error('Failed to clear training data'))
            }

            transaction.oncomplete = () => {
                db.close()
            }
        })
    } catch (error) {
        console.error('Error clearing IndexedDB:', error)
        throw error
    }
}
