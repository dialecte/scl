export { collectComposedFunctionUuids, findComposedFunctionRefs } from './composed-functions'
export {
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
