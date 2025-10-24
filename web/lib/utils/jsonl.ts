interface TrainingDataRow {
    input: string
    output: string
}

/**
 * Convert training data rows to JSONL format
 * Each row becomes a single line of JSON
 */
export function convertToJSONL(rows: TrainingDataRow[]): string {
    // Filter out empty rows
    const nonEmptyRows = rows.filter(
        row => row.input.trim() !== '' || row.output.trim() !== ''
    )

    // Convert each row to a JSON string and join with newlines
    return nonEmptyRows
        .map(row => JSON.stringify(row))
        .join('\n')
}

/**
 * Parse JSONL format back to training data rows
 * Each line should be a valid JSON object
 */
export function parseJSONL(jsonlContent: string): TrainingDataRow[] {
    if (!jsonlContent.trim()) {
        return []
    }

    const lines = jsonlContent.split('\n').filter(line => line.trim())
    const rows: TrainingDataRow[] = []

    for (const line of lines) {
        try {
            const parsed = JSON.parse(line)
            rows.push({
                input: parsed.input || '',
                output: parsed.output || ''
            })
        } catch (error) {
            console.error('Failed to parse JSONL line:', line, error)
        }
    }

    return rows
}
