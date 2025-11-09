import { TrainingExample } from "../types";

/**
 * Parse examples from LLM response, handling various formats
 */
export function parseExamples(text: string): TrainingExample[] {
    try {
        let parsed = JSON.parse(text);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            if (Array.isArray(parsed.examples)) {
                parsed = parsed.examples;
            } else if (Array.isArray(parsed.data)) {
                parsed = parsed.data;
            }
        }

        if (!Array.isArray(parsed)) {
            console.error('Parsed response is not an array');
            return [];
        }

        return parsed.filter(item =>
            item &&
            typeof item === 'object' &&
            typeof item.input === 'string' &&
            typeof item.output === 'string' &&
            item.input.trim().length > 0 &&
            item.output.trim().length > 0
        );
    } catch (error) {
        const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) {
            try {
                const parsed = JSON.parse(codeBlockMatch[1]);
                if (Array.isArray(parsed)) {
                    return parsed.filter(item =>
                        item &&
                        typeof item === 'object' &&
                        typeof item.input === 'string' &&
                        typeof item.output === 'string' &&
                        item.input.trim().length > 0 &&
                        item.output.trim().length > 0
                    );
                }
            } catch {
                // Fall through to return empty array
            }
        }

        console.error('Failed to parse examples:', error);
        return [];
    }
}

/**
 * Step: Deduplicate training examples by input text
 *
 * Uses case-insensitive comparison of trimmed inputs to identify duplicates.
 * Keeps the first occurrence of each unique input.
 *
 * @param examples - Array of training examples from all agents
 * @returns Deduplicated array of training examples
 */
export function deduplicateExamples(
    examples: TrainingExample[]
): TrainingExample[] {

    const seen = new Map<string, TrainingExample>();

    for (const example of examples) {
        const normalizedInput = example.input.toLowerCase().trim();

        // Keep first occurrence of each unique input
        if (!seen.has(normalizedInput)) {
            seen.set(normalizedInput, example);
        }
    }

    const deduplicated = Array.from(seen.values());
    const removedCount = examples.length - deduplicated.length;

    console.log(
        `Deduplication: ${examples.length} -> ${deduplicated.length} examples ` +
        `(removed ${removedCount} duplicates)`
    );

    return deduplicated;
}