/**
 * The vitest config the mutation runner loads (`dialecte.mutation.fast.vitestConfig`): the package's config with the
 * node tier alone, under the name `mutation`. It needs no environment: the runner takes no project option and would
 * run every project of the package config, the browser ones included.
 */
import config, { nodeTierProject } from '../../vitest.config'
import { MUTATION_PROJECT_NAME } from './mutants.constants'

import { defineConfig } from 'vitest/config'

export default defineConfig({
	...config,
	test: { ...config.test, projects: [nodeTierProject({ name: MUTATION_PROJECT_NAME })] },
})
