import { readScopeInstanceContent } from './instance-content'
import { postExtractionCleanup } from './post-extraction-cleanup'
import { satelliteWarnings } from './satellite-warnings'

import { TEMPLATE_NAME } from '@/v2019C1/constants'
import { history } from '@/v2019C1/extensions/history'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	cloneTopologyContent,
	resolveFrameStructure,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type { ExtractOptions, ExtractWarning, SsdExtractScope } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Extract a bay-typical (or wider process scope) from a project into a standalone SSD template.
 *
 * Records an SSD `Header`, then `cloneTopologyContent` REPRODUCES the scope's structural frame
 * (Substation/VoltageLevel/Bay + BayType + equipment) and CONSUMES the application layer (each
 * `Application` + its composed `Function`s + type closure + satellites), with what its levels hold and what applies
 * to it from outside (a variable, a behaviour description). The levels above the units
 * are then TEMPLATE-named (the scaffolding marker: the first named levels below it are the
 * instantiable units): the levels above a voltage level or a bay, which is the unit; a substation
 * itself, whose voltage levels are the units. The scaffolding loses its template link; the scope
 * keeps its own unless the consumer breaks it, which reaches what came with its instance. Uuid refs
 * are repointed and orphans cleaned up.
 *
 * @intent extract a bay typical into an SSD template, create an SSD from a bay or voltage level of a project, save a process section as a reusable template
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: SsdExtractScope
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	} & ExtractOptions,
): Promise<{ warnings: ExtractWarning[] }> {
	const { sourceQuery, scopeRef, tool, who, nameStructure } = params
	const { as = 'new', templateLink = 'keep' } = params
	const root = await tx.getRoot()

	const scopeName = (await sourceQuery.getAttribute(scopeRef, { name: 'name' })) || 'Unnamed'

	// IED / Communication are out of the topology take-over - skip them and warn (they are
	// carried over once the IED/ISD layer exists).
	const warnings = await collectSkippedSectionWarnings(sourceQuery)

	await history.transaction.startFile(tx, {
		as,
		filename: `SSD_${scopeName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'SSD',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'SSD initialization',
			why: 'Process scope was extracted from a previous file',
		},
	})

	const content = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef,
		targetParent: root,
	})
	const { frameIndex, redirectMappings, unit } = content

	// what applies to the scope from outside it, what its levels hold and what the roles of its applications refer to (a
	// variable, a behaviour description) travels with it, each where the file holds it, applying only to what the extract
	// places; resolved once
	const structure = await resolveFrameStructure(tx, sourceQuery, scopeRef, frameIndex)
	const { satellites } = content
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: scopeRef,
		satellites,
		carried: content.carried,
		index: content.index,
		structure,
		// one held by an element of another level may land beside one of its name: numbered — one landing in the copy of
		// its holder is placed first, and keeps its name
		bumpsCollisions: true,
		scope: unit.scope,
		frame: { cloneMappings: content.cloneMappings, redirectMappings },
		// what the roles of its applications refer to, each whole
		referenced: content.referenced,
	})
	const cloneMappings = [...content.cloneMappings, ...applied.cloneMappings]

	// the levels above the units are the template's scaffolding, TEMPLATE-named: the levels above the scope, and the
	// scope itself when it is a substation (the top element of a template is named TEMPLATE, its voltage levels are the
	// named units); the units keep their names
	const scaffoldingIds = await readScaffoldingIds(sourceQuery, { scopeRef })
	const unlinked =
		templateLink === 'break'
			? await readScopeInstanceContent(sourceQuery, {
					scopeRef,
					satellites,
					referencedBy: content.referencedBy,
				})
			: new Set<string>()
	for (const levelId of scaffoldingIds) {
		unlinked.add(levelId)
		const target = frameIndex.get(levelId)
		if (target) await tx.update(target, { attributes: { name: TEMPLATE_NAME } })
	}

	// the scaffolding loses its template link; the scope keeps its own unless the consumer breaks it: then the scope and
	// what came with its instance lose it, an application or a function placed from its own file keeps its link; the
	// cloned uuid refs are repointed across ALL clones, before cleanup reads them to detect orphans
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })

	await postExtractionCleanup(tx)

	return {
		warnings: [
			...warnings,
			...satelliteWarnings({ applied, notPlaced: content.satellitesNotPlaced }),
		],
	}
}

/**
 * The levels of the scope's frame the template names TEMPLATE, its scaffolding (source record ids): the levels above the
 * scope, and a substation scope itself, whose voltage levels are the named units.
 */
async function readScaffoldingIds(
	sourceQuery: Core.Query<Config>,
	params: { scopeRef: SsdExtractScope },
): Promise<string[]> {
	const { scopeRef } = params
	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	const above = ancestors
		.filter((ancestor) => isTopologyLevel(ancestor.tagName))
		.map((ancestor) => ancestor.id)
	return scopeRef.tagName === 'Substation' ? [...above, scopeRef.id] : above
}

/** IED / Communication are dropped by the SSD extract until the IED/ISD layer lands: counted in one warning. */
async function collectSkippedSectionWarnings(
	sourceQuery: Core.Query<Config>,
): Promise<ExtractWarning[]> {
	const ieds = await sourceQuery.getRecordsByTagName('IED')
	const communications = await sourceQuery.getRecordsByTagName('Communication')

	if (ieds.length === 0 && communications.length === 0) return []

	return [
		{
			code: 'sections-not-carried',
			counts: { IED: ieds.length, Communication: communications.length },
		},
	]
}
