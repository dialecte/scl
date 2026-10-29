import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { omitOfSections } from './function-sections'
import { readInstanceContent } from './instance-content'
import { postExtractionCleanup } from './post-extraction-cleanup'
import { satelliteWarnings } from './satellite-warnings'

import { history } from '@/v2019C1/extensions/history'
import {
	readSatelliteIndex,
	resolveAppliedSatelliteTargets,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import {
	cloneApplicationContent,
	resolveApplicationScope,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import { landOnStructure, withLandedLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { removeOwnProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { ExtractWarning } from './extract.types'
import type { AsdExtractOptions } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { AppliedSatellite } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type * as Core from '@dialecte/core'

export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	} & AsdExtractOptions,
): Promise<{ warnings: ExtractWarning[] }> {
	const { sourceQuery, applicationRef, tool, who, nameStructure, sections } = params
	const { as = 'new', templateLink = 'keep' } = params

	const applicationName =
		(await sourceQuery.getAttribute(applicationRef, { name: 'name' })) || 'Unnamed Application'

	await history.transaction.startFile(tx, {
		as,
		filename: `ASD_${applicationName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'ASD',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'ASD initialization',
			why: 'Application was extracted from a previous file',
		},
	})

	const structure = await ensureSubstationTemplateStructure(tx)
	// the levels above the application land on the TEMPLATE levels of the file: a reference to one names it
	const landed = await landOnStructure(sourceQuery, { primaryRef: applicationRef, structure })
	const applicationScope = await resolveApplicationScope(sourceQuery, { applicationRef })
	const scope = withLandedLevels({ scope: applicationScope, levels: landed.levels })

	// the satellites of the source, read once for what the roles refer to and what applies to the application
	const index = await readSatelliteIndex(sourceQuery)
	const content = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
		omit: omitOfSections({ sections }),
		scope,
		index,
	})
	const redirectMappings = [...content.redirectMappings, ...landed.redirects]

	// what applies to the application or to a function it composes from outside both (a variable, a behaviour
	// description), and what its roles refer to, travels with it, applying only to what it extracts or lands on; resolved
	// once
	const composedRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	const satellites = await resolveAppliedSatelliteTargets(sourceQuery, {
		primaryRef: applicationRef,
		composedRefs,
		index,
	})
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: applicationRef,
		satellites,
		index,
		structure,
		// two held by elements of different levels may land on one level of the file: the second is numbered
		bumpsCollisions: true,
		scope,
		referenced: content.referenced,
	})
	const cloneMappings = [...content.cloneMappings, ...applied.cloneMappings]

	// the application extracted keeps its template link unless the consumer breaks it: then the application and what
	// came with its instance lose it — what it holds, the functions it composes that record no file of their own, what
	// applies to them, what its roles refer to; a function placed from its FSD keeps its link, and so does what applies
	// to it only; the cloned uuid refs are repointed across ALL clones, before cleanup reads them to detect orphans
	const unlinked =
		templateLink === 'break'
			? await readApplicationInstanceContent(sourceQuery, {
					applicationRef,
					composedRefs,
					satellites,
					referencedRefs: content.referenced.satelliteRefs,
				})
			: new Set<string>()
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })
	// nor does it record the file it was placed from any more; its functions keep the files they record
	const root = cloneMappings.find((mapping) => mapping.source.id === applicationRef.id)?.target
	if (root && templateLink === 'break') await removeOwnProvenance(tx, { element: root })

	await postExtractionCleanup(tx)

	return {
		warnings: satelliteWarnings({ applied, notPlaced: content.satellitesNotPlaced }),
	}
}

/**
 * What came with an application's instance: the application and what it holds, the functions it composes that record
 * no file of their own, what applies to those from outside (a variable, a behaviour description), and what its roles
 * refer to.
 */
async function readApplicationInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: {
		applicationRef: Scl.Ref<'Application'>
		composedRefs: readonly Scl.Ref<'Function'>[]
		/** What applies to the application or to what it composes, with what each applies to. */
		satellites: readonly AppliedSatellite[]
		referencedRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	},
): Promise<Set<string>> {
	const { applicationRef, composedRefs } = params
	const content = await readInstanceContent(sourceQuery, {
		roots: [applicationRef],
		companions: composedRefs,
	})
	// a function placed from its FSD is another instance: what applies to it alone is not reached, nor what it holds
	const satellites = params.satellites
		.filter(function appliesToContent(satellite) {
			return satellite.targetIds.some(function isContent(targetId) {
				return content.has(targetId)
			})
		})
		.map(function satelliteOf(satellite) {
			return satellite.satelliteRef
		})
	const satelliteContent = await readInstanceContent(sourceQuery, {
		roots: [...satellites, ...params.referencedRefs],
	})
	return new Set([...content, ...satelliteContent])
}
