/**
 * Test setup for mutation testing (`dialecte mutants run`): the mutation runner names the mutant a run tests in the
 * environment of the command, which the browser the tests run in does not see. The vitest config hands it over as a
 * constant; this file gives it to the mutated code, which reads it from `globalThis.__stryker__`. Without a mutant
 * (every other run) it does nothing.
 */
import { ACTIVE_MUTANT } from './active-mutant.constants'

if (ACTIVE_MUTANT) {
	const scope = globalThis as typeof globalThis & { __stryker__?: { activeMutant?: string } }
	scope.__stryker__ = { ...scope.__stryker__, activeMutant: ACTIVE_MUTANT }
}
