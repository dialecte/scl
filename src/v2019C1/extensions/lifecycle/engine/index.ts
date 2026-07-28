export { diff, assembleReport, allGroups, collectTreeIds } from './diff'
export { groupChanges } from './group'
export { reconcile } from './reconcile'
export {
	acceptedRefIds,
	assertDecisionsCoherent,
	collisionOverrides,
	decisionAction,
} from './decide'
export { visibleAttributes } from './visible-attributes'

export type { AcceptedIds, CollisionOverrides } from './decide.types'
export type * from './diff.types'
