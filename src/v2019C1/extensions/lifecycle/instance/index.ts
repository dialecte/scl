export { collectComposedFunctionUuids, findComposedFunctionRefs } from './composed-functions'
export {
	findByOwnUuid,
	findInstanceByTemplateUuid,
	findInstancesByTemplateUuid,
	findInstancesUnder,
	findInstanceUnder,
	scopeToTargetInstance,
} from './find-instance'
export { collectInstanceScope } from './instance-scope'
export {
	collectForeignReferenceIds,
	collectForeignScopes,
	foreignScopeResolver,
	pointsInto,
} from './foreign-scope'
export type { ForeignScopes, ResolveForeignScope } from './foreign-scope.types'
export { isLastReferrer } from './is-last-referrer'
export { carriesOwnProvenance } from './own-provenance'
