import { nameCreatedSharedElements } from './name-created-shared-elements'
import { resolveTargetStructure } from './resolve-target-structure'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { readSatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance'
import {
	cloneApplicationContent,
	resolveApplicationScope,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import {
	landOnStructure,
	landPrimaries,
	withLandedLevels,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import {
	findMissingReferencedRecords,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { AsdParams, AsdResult, PlaceApplicationParams, PlacedApplication } from './asd.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Instantiate the Application carried by an ASD into a target document.
 *
 * Clones the application-layer content (Application + its Functions, categories and
 * satellites, with type closure) under the structure resolved from `targetParent`
 * (`layers/application`), then writes the identity the scenario places with on every cloned element: instance
 * lineage stamped (`identity.writeIdentity` in `stamp-template` mode) for a new instance, the file's uuids kept
 * for a fork.
 *
 * The clone's uuid references are repointed by `reference.applyUuidRemap` over the
 * combined mappings. The instantiation provenance link (`ApplicationSclRef` -> `SclFileReference` back to
 * the ASD) is written on the cloned root by `reference.writeProvenance`; a consumer applies its
 * own policy (naming, application assignment) through the hooks it registers, not here.
 *
 * Returns the instantiated Application ref, its composed Function roots, and the clone
 * mappings of everything the operation cloned, so a consumer can drive follow-up rules against the fresh
 * instance without re-querying by templateUuid.
 *
 * @intent instantiate an ASD into a project, add an Application from a template, place an application template under a Bay
 */
export async function asd(tx: Core.Transaction<Config>, params: AsdParams): Promise<AsdResult> {
	const { applicationRef, ...placed } = await placeApplication(tx, params)
	if (!applicationRef) {
		throw new Error(`instantiate.asd: cloned Application not found for ${params.applicationRef.id}`)
	}
	return { applicationRef, ...placed }
}

/**
 * Place an application of an ASD as {@link asd} does, leaving out what the consumer left out: the
 * application left out, the functions it composes that are kept are placed without it — and
 * without provenance, which is the application's.
 */
export async function placeApplication(
	tx: Core.Transaction<Config>,
	params: PlaceApplicationParams,
): Promise<PlacedApplication> {
	const { sourceQuery, applicationRef, targetParent, overrides, keepNameTypesFrom } = params
	const { decisionMappings, leftOut } = params
	const policy = scenarioPolicy({ scenario: params.scenario ?? 'instantiate' })

	// capture the composed Function source refs BEFORE cloning (they are "missing" only
	// until placed) so their clones can be collision-checked at their structural level
	const composedFunctionRefs = await findMissingReferencedRecords(tx, {
		sourceQuery,
		scopeRef: applicationRef,
		refTagName: 'FunctionRef',
		targetTagName: 'Function',
	})
	const placedPrimaryRefs = [
		applicationRef,
		...(await findComposedFunctionRefs(sourceQuery, applicationRef)),
	].filter((ref) => !leftOut?.has(ref.id))

	// where the application and its functions land: on the levels of where the consumer started, or
	// — started above a level one of them was made for — on the levels their template says
	const landing = params.resolvePlacement
		? await landPrimaries(tx, {
				sourceQuery,
				primaryRefs: placedPrimaryRefs,
				anchor: targetParent,
				decisionMappings,
				operation: 'instantiate.asd',
				matchKey: policy.matchKey,
			})
		: undefined
	const structure = landing?.structure ?? (await resolveTargetStructure(tx, targetParent))
	// the levels of the template above the application land on the levels of the structure: a reference to one names it
	const landed = await landOnStructure(sourceQuery, { primaryRef: applicationRef, structure })
	// what the references of what travels with it may name: the application and the functions it composes, as placed,
	// and the levels it lands on
	const applicationScope = await resolveApplicationScope(sourceQuery, { applicationRef, leftOut })
	const scope = withLandedLevels({ scope: applicationScope, levels: landed.levels })

	// the satellites of the template, read once for what the roles refer to and what applies to the application
	const index = await readSatelliteIndex(sourceQuery)
	const content = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
		keepNameTypesFrom,
		decisionMappings,
		leftOut,
		matchKey: policy.matchKey,
		sharedFunctions: params.sharedFunctions,
		scope,
		index,
		landings: landed.redirects,
	})
	const { cloneMappings: contentMappings, redirectMappings } = content

	// external cross-cutting satellites (Variable / BehaviorDescription) applying to
	// any element in the Application subtree or in a function it places travel with it, one of each per instance
	// what the operation placed: a function it does not place (left out, or stood on — another application placed it)
	// keeps the satellites it has, and what it holds applies to nothing placed here
	const placedIds = new Set(contentMappings.flatMap((mapping) => mapping.source.id ?? []))
	const notPlaced = composedFunctionRefs
		.filter((ref) => !placedIds.has(ref.id))
		.map((ref) => ref.id)
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: applicationRef,
		composedRefs: composedFunctionRefs,
		structure,
		leftOut,
		notPlaced: new Set(notPlaced),
		bumpsCollisions: policy.bumpsCollisions,
		scope,
		// what its roles refer to, each whole
		referenced: content.referenced,
		index,
		held: content.held,
	})

	const allMappings = [
		...(landing?.cloneMappings ?? []),
		...contentMappings,
		...applied.cloneMappings,
	]

	// the identity the scenario places with: lineage stamped and the uuid references repointed, or the file's kept
	await finalizeClonedIdentity(tx, {
		cloneMappings: allMappings,
		mode: policy.placementIdentity,
		redirectMappings: [
			...(landing?.redirectMappings ?? []),
			...landed.redirects,
			...redirectMappings,
		],
	})

	// resolve a name collision for each placed composed Function at its own structural
	// level (a repeated instantiate would otherwise duplicate a Function name in the Bay)
	for (const functionRef of policy.bumpsCollisions ? composedFunctionRefs : []) {
		const functionMapping = contentMappings.find((mapping) => mapping.source.id === functionRef.id)
		if (!functionMapping) continue
		const functionParent = await resolveStructureRef(sourceQuery, functionRef, structure)
		await placeUniquely(tx, {
			ref: functionMapping.target,
			parentRef: functionParent,
			overrides: overrides?.get(functionRef.id),
		})
	}

	// a shared element created here (no project element to map onto) is named at its structural level
	async function placementStructure(): Promise<TargetStructure> {
		return structure
	}
	await nameCreatedSharedElements(tx, {
		sourceQuery,
		cloneMappings: allMappings,
		resolveStructure: placementStructure,
		decisionMappings,
	})

	const composedFunctionInstanceRefs = composedFunctionRefs
		.map(
			(functionRef) =>
				contentMappings.find((mapping) => mapping.source.id === functionRef.id)?.target,
		)
		.filter((target): target is Scl.Ref<Scl.ElementsOf> => Boolean(target)) as (
		| Scl.Ref<'Function'>
		| Scl.Ref<'SubFunction'>
	)[]

	const rootMapping = contentMappings.find((mapping) => mapping.source.id === applicationRef.id)
	if (!rootMapping) {
		return { composedFunctionRefs: composedFunctionInstanceRefs, cloneMappings: allMappings }
	}

	// validate the placed application against its parent context (resolved at the
	// application's own structural level, not the anchor): apply any user edits then
	// auto-resolve a name collision among siblings (schema constraint)
	if (policy.bumpsCollisions) {
		const applicationParent = await resolveStructureRef(sourceQuery, applicationRef, structure)
		await placeUniquely(tx, {
			ref: rootMapping.target,
			parentRef: applicationParent,
			overrides: overrides?.get(applicationRef.id),
		})
	}
	// an application placed as part of a larger template carries that template's provenance, not its own
	if (policy.writesProvenance && !params.partOfTemplate) {
		await writeProvenance(tx, {
			sourceQuery,
			target: { anchor: 'application', root: rootMapping.target as Scl.Ref<'Application'> },
		})
	}

	return {
		applicationRef: rootMapping.target as Scl.Ref<'Application'>,
		composedFunctionRefs: composedFunctionInstanceRefs,
		cloneMappings: allMappings,
	}
}
