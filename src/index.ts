import * as core from '@actions/core'
import { getContext, getOctokit } from './github.js'
import { run } from './run.js'

try {
  await run(
    {
      path: core.getInput('path', { required: false }) || '.',
      config: core.getInput('config', { required: false }),
      version: core.getInput('version', { required: false }) || 'latest',
      failOnCritical: core.getInput('fail-on-critical', { required: false }) !== 'false',
    },
    getOctokit(),
    await getContext(),
  )
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
