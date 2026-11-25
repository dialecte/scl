// The clean-up extension's types a consumer names: the preview of what a commit removes and refuses.
// The runtime extension object (registered via `createSclProject`) is not re-exported here.

export type {
	CommitPrune,
	CommitPruneOptions,
	CommitPrunedContainer,
	CommitPrunedElement,
	CommitPrunedIdentity,
	CommitPrunedType,
} from './transaction/commit-prune.types'
export type {
	CommitRefusal,
	CommitRefusalElement,
} from '@/v2019C1/hooks/before-commit/commit-plan.types'
export type { OutOfScopeVariable } from './query/out-of-scope-variables.types'
export type { RepairedVariables } from './transaction/repair-out-of-scope-variables.types'
