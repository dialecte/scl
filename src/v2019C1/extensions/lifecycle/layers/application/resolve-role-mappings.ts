import { findMappingPolicy, resolveMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	ResolvedRole,
	ResolveRoleMappingsParams,
	RoleMappings,
} from './resolve-role-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

/**
 * Where the roles each application refers to land in the project (`resolveMapping`), resolved before the placement
 * writes anything, as the report reads them: a role the placement creates for one application is never the one
 * another application's role maps onto. A role several applications refer to is resolved once.
 */
export async function resolveRoleMappings(
	query: MappingReader,
	params: ResolveRoleMappingsParams,
): Promise<RoleMappings> {
	const { sourceQuery, applicationRefs, decisionMappings, matchKey, landings } = params
	const policy = findMappingPolicy('AllocationRole')
	if (!policy) return new Map()

	const roleUuidsByApplication = await readRoleUuids(sourceQuery, { applicationRefs })
	const roleUuids = new Set([...roleUuidsByApplication.values()].flatMap(toArray))
	const sourceRoles =
		roleUuids.size > 0
			? await sourceQuery.findByAttributes({
					tagName: 'AllocationRole',
					attributes: { uuid: [...roleUuids] },
				})
			: []

	const resolvedByUuid = new Map<string, ResolvedRole>()
	for (const sourceRole of sourceRoles) {
		const sourceUuid = readAttribute({ record: sourceRole, name: 'uuid', defaults: 'none' })
		// two roles of one uuid in the template: the first is the one referred to
		if (resolvedByUuid.has(sourceUuid)) continue
		const sourceRef = { tagName: 'AllocationRole' as const, id: sourceRole.id }
		const mapping = await resolveMapping(query, {
			sourceQuery,
			sourceRef,
			policy,
			decision: decisionMappings?.get(sourceRole.id),
			matchKey,
			landings,
		})
		resolvedByUuid.set(sourceUuid, { sourceRef, sourceUuid, mapping })
	}

	const roleMappings = new Map<string, readonly ResolvedRole[]>()
	for (const [applicationId, uuids] of roleUuidsByApplication) {
		roleMappings.set(
			applicationId,
			[...uuids].flatMap(function resolvedOf(uuid) {
				return resolvedByUuid.get(uuid) ?? []
			}),
		)
	}
	return roleMappings
}

/** The uuids of the roles each application of the template refers to, by application record id: one read. */
async function readRoleUuids(
	query: Core.Query<Config>,
	params: { applicationRefs: readonly Scl.Ref<'Application'>[] },
): Promise<Map<string, Set<string>>> {
	const roleUuidsByApplication = new Map<string, Set<string>>()
	for (const applicationRef of params.applicationRefs)
		roleUuidsByApplication.set(applicationRef.id, new Set())

	// a role reference sits right below its application
	const references = await query.getRecordsByTagName('AllocationRoleRef')
	for (const reference of references) {
		const uuids = reference.parent ? roleUuidsByApplication.get(reference.parent.id) : undefined
		const roleUuid = readAttribute({ record: reference, name: 'allocationRoleUuid' })
		if (uuids && roleUuid) uuids.add(roleUuid)
	}
	return roleUuidsByApplication
}

function toArray(uuids: ReadonlySet<string>): string[] {
	return [...uuids]
}
