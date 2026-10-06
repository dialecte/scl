export { diff, assembleReport, allGroups, collectTreeIds } from './diff'
export { groupChanges, placeFor } from './group'
export { reconcile } from './reconcile'
export {
	acceptedRefIds,
	assertDecisionsCoherent,
	collisionOverrides,
	decisionAction,
	firstTimeGroups,
	firstTimeReportInstance,
	firstTimeReportInstances,
} from './decide'
export { visibleAttributes } from './visible-attributes'

export type { AcceptedIds, CollisionOverrides } from './decide.types'
export type * from './diff.types'
