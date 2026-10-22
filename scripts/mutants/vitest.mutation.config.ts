/**
 * The vitest config the mutation runner loads: the package's config with the `mutation` project alone. The runner
 * takes no project option and would run every project of the config, the browser ones included.
 */
import config from '../../vitest.config'
import { MUTATION_PROJECT_ENV, MUTATION_PROJECT_NAME } from './mutants.constants'

import { defineConfig } from 'vitest/config'

import type { TestProjectConfiguration } from 'vitest/config'

const projects = (config.test?.projects ?? []).filter(isMutationProject)
if (projects.length === 0)
	throw new Error(
		`the ${MUTATION_PROJECT_NAME} project exists only with ${MUTATION_PROJECT_ENV} set: run it through npm run mutants:fast`,
	)

export default defineConfig({ ...config, test: { ...config.test, projects } })

function isMutationProject(project: TestProjectConfiguration): boolean {
	return (
		typeof project === 'object' && 'test' in project && project.test?.name === MUTATION_PROJECT_NAME
	)
}
