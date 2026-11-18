import {
	emptiedContainers,
	lnodeNamings,
	movedRoots,
	moves,
	noChildLeftBehind,
	pathReferences,
	releasedLNodes,
	tupleNames,
	tupleReferences,
	unusedTypes,
} from './commit-steps'

import type { CommitStep } from './commit-plan.types'

/**
 * The steps of the commit, in the order they run. Each with `readsEarlier` reads what every step before it wrote; the
 * type prune reads the transaction's operations only.
 */
export const COMMIT_STEPS: readonly CommitStep[] = [
	{ name: 'movedRoots', readsEarlier: false, run: movedRoots },
	{ name: 'lnodeNamings', readsEarlier: true, run: lnodeNamings },
	{ name: 'tupleNames', readsEarlier: true, run: tupleNames },
	{ name: 'tupleReferences', readsEarlier: true, run: tupleReferences },
	{ name: 'pathReferences', readsEarlier: true, run: pathReferences },
	{ name: 'moves', readsEarlier: true, run: moves },
	{ name: 'releasedLNodes', readsEarlier: true, run: releasedLNodes },
	{ name: 'unusedTypes', readsEarlier: false, run: unusedTypes },
	{ name: 'emptiedContainers', readsEarlier: true, run: emptiedContainers },
	{ name: 'noChildLeftBehind', readsEarlier: true, run: noChildLeftBehind },
]
