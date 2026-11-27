import {
	emptiedContainers,
	emptiedTypeContainers,
	lnodeNamings,
	movedRoots,
	moves,
	noChildLeftBehind,
	pathReferences,
	releasedLNodes,
	repeatedLNodeUuids,
	tupleNames,
	tupleReferences,
	unusedTypes,
	uuidReferences,
} from './commit-steps'

import type { CommitStep } from './commit-plan.types'

/**
 * The steps of the commit, in the order they run. Each with `readsEarlier` reads what every step before it wrote; the
 * moved roots read the transaction's operations only (first: a refused move stops the commit before anything is read
 * for the others). The containers emptied are pruned before the types, so the type prune judges the names over what
 * every cascade of the commit left; the containers that prune empties in turn (a `DataTypeTemplates` holding only the
 * types it removes) go in a second pass after it.
 */
export const COMMIT_STEPS: readonly CommitStep[] = [
	{ name: 'movedRoots', readsEarlier: false, run: movedRoots },
	{ name: 'lnodeNamings', readsEarlier: true, run: lnodeNamings },
	{ name: 'tupleNames', readsEarlier: true, run: tupleNames },
	{ name: 'tupleReferences', readsEarlier: true, run: tupleReferences },
	{ name: 'pathReferences', readsEarlier: true, run: pathReferences },
	{ name: 'moves', readsEarlier: true, run: moves },
	{ name: 'releasedLNodes', readsEarlier: true, run: releasedLNodes },
	{ name: 'repeatedLNodeUuids', readsEarlier: true, run: repeatedLNodeUuids },
	{ name: 'uuidReferences', readsEarlier: true, run: uuidReferences },
	{ name: 'emptiedContainers', readsEarlier: true, run: emptiedContainers },
	{ name: 'unusedTypes', readsEarlier: true, run: unusedTypes },
	{ name: 'emptiedTypeContainers', readsEarlier: true, run: emptiedTypeContainers },
	{ name: 'noChildLeftBehind', readsEarlier: true, run: noChildLeftBehind },
]
