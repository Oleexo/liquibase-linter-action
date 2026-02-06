import { context } from '@actions/github';

/**
 * GitHub context information extracted from the action environment
 */
export interface GitHubContext {
    owner: string;
    repo: string;
    sha: string;
    runId: number;
    eventName: string;
}

/**
 * Extracts GitHub context information from the action environment
 */
export function getGitHubContext(): GitHubContext {
    return {
        owner: context.repo.owner,
        repo: context.repo.repo,
        sha: context.sha,
        runId: context.runId,
        eventName: context.eventName,
    };
}
