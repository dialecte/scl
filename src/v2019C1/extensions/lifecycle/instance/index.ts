export { collectComposedFunctionUuids, findComposedFunctionRefs } from './composed-functions'
export {
	findByOwnUuid,
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
export { isNamedOutside } from './named-outside'
export { carriesOwnProvenance } from './own-provenance'
