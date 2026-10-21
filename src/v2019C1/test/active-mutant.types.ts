declare global {
	/** Replaced by the vitest config: the mutant a mutation run tests, empty outside such a run. */
	const __STRYKER_ACTIVE_MUTANT__: string
}

export {}
