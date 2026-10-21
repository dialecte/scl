import type {} from './active-mutant.types'

/**
 * The mutant the mutation runner tests in this run, handed over by the vitest config; empty outside such a run, and
 * in a project the config hands nothing to.
 */
export const ACTIVE_MUTANT: string =
	typeof __STRYKER_ACTIVE_MUTANT__ === 'string' ? __STRYKER_ACTIVE_MUTANT__ : ''
