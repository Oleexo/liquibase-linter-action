import * as core from '@actions/core';
import { run } from './run.js';

/**
 * Entry point for the GitHub Action
 * Wraps the main logic for error handling
 */
async function main(): Promise<void> {
    try {
        await run();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.setFailed(`Action failed: ${errorMessage}`);

        // Print stack trace for debugging
        if (error instanceof Error && error.stack) {
            core.debug(error.stack);
        }
    }
}

main();
