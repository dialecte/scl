import { readScopeInstanceContent } from './instance-content'
import { postExtractionCleanup } from './post-extraction-cleanup'
import { readImplementationUuids } from './read-implementation-uuids'
import { satelliteWarnings } from './satellite-warnings'
import { selectCarriedIeds } from './select-carried-ieds'
import { ALL_BOUND_IEDS } from './ssd.constants'

import { TEMPLATE_NAME } from '@/v2019C1/constants'
import { importTypes } from '@/v2019C1/extensions/data-model/transaction'
import { history } from '@/v2019C1/extensions/history'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { withProgressPhases } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases'
import { EXTRACT_PROGRESS_PHASES } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.constants'
import { cloneCarriedIeds } from '@/v2019C1/extensions/lifecycle/layers/ied/clone-carried-ieds'
import { readCarriedCommunication } from '@/v2019C1/extensions/lifecycle/layers/ied/read-carried-communication'
import { planReferences } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/plan-references'
import { SSD_REFERENCE_POLICY } from '@/v2019C1/extensions/lifecycle/layers/reference-closure/reference-closure.constants'
import {
	cloneTopologyContent,
	resolveFrameStructure,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type {
	ExtractOptions,
	ExtractWarning,
	SsdExtractOptions,
	SsdExtractResult,
	SsdExtractScope,
} from './extract.types'
import type {
	CarriedIedSections,
	CarriedIedSectionsParams,
	ResolveFileTypeParams,
} from './ssd.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	EnterPhase,
	ExtractProgressPhaseKey,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.types'
import type * as Core from '@dialecte/core'

/**
 * Extract a bay-typical (or wider process scope) from a project into a standalone template, with the IEDs its LNodes
 * are tied to.
 *
 * Chooses the IEDs (`ieds`: a rule by kind and assignment, or a list; default every IED tied to the scope) and the file
 * type (`fileType`: SSD by default, `'by-content'` an SCD when a real IED is carried), and records the `Header`. Writes
 * the carried IEDs whole, with their data types, source files and lineage, their references cut to what the file holds,
 * and their communication (addresses left out by default). Then `cloneTopologyContent` REPRODUCES the scope's
 * structural frame (Substation/VoltageLevel/Bay + BayType + equipment, the LNodes they hold with their data types) and
 * CONSUMES the application layer (each `Application` + its composed `Function`s + type closure + satellites), with what
 * its levels hold and what applies to it from outside (a variable, a behaviour description). The levels above the units
 * are then TEMPLATE-named (the scaffolding marker: the first named levels below it are the
 * instantiable units): the levels above a voltage level or a bay, which is the unit; a substation
 * itself, whose voltage levels are the units. The scaffolding loses its template link; the scope
 * keeps its own unless the consumer breaks it, which reaches what came with its instance; a carried IED keeps its own.
 * Uuid refs are repointed in one pass and orphans cleaned up: an LNode bound to an IED not carried is released.
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
	} & ExtractOptions &
		SsdExtractOptions,
): Promise<SsdExtractResult> {
	return await withProgressPhases(tx, {
		phases: EXTRACT_PROGRESS_PHASES,
		run: async function extractInPhases(enter) {
			return await extractSsdInPhases(tx, { params, enter })
		},
	})
}

/** Extract a process scope, entering each progress phase as it starts. */
async function extractSsdInPhases(
	tx: Core.Transaction<Config>,
	context: { params: Parameters<typeof ssd>[1]; enter: EnterPhase<ExtractProgressPhaseKey> },
): Promise<SsdExtractResult> {
	const { params, enter } = context
	enter('header')
	const { sourceQuery, scopeRef, tool, who, nameStructure } = params
	const { as = 'new', templateLink = 'keep', ieds = ALL_BOUND_IEDS } = params
	const root = await tx.getRoot()

	const scopeName = (await sourceQuery.getAttribute(scopeRef, { name: 'name' })) || 'Unnamed'

	const carriedSections = await readCarriedIedSections(tx, {
		sourceQuery,
		scopeRef,
		ieds,
		fileType: params.fileType ?? 'SSD',
		addresses: params.addresses,
	})
	const { selection, fileType, references, communication, implementationUuids } = carriedSections

	await history.transaction.startFile(tx, {
		as,
		filename: `${fileType}_${scopeName.replace(/\s+/g, '_')}`,
		header: {
			fileType,
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: `${fileType} initialization`,
			why: 'Process scope was extracted from a previous file',
		},
	})

	enter('copy')
	// the IEDs first: what the frame and the functions write names their logical nodes, present when it is written
	const iedMappings = await cloneCarriedIeds(tx, {
		sourceQuery,
		targetParent: root,
		ieds: selection.carried.map(({ ied }) => ied),
		references,
		communication,
	})
	const content = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef,
		targetParent: root,
		implementationUuids,
	})
	const { frameIndex, redirectMappings, unit } = content
	// an LNode the frame writes (under a level or an equipment) brings the data types it names, as one a function holds
	await importTypes(tx, {
		sourceQuery,
		records: content.cloneMappings.flatMap(function writtenLNode(mapping) {
			// a function's LNodes came with their function's types
			const ofFrame =
				mapping.source.tagName === 'LNode' && !unit.functionContentIds.has(mapping.source.id)
			return ofFrame ? [mapping.source as Scl.TrackedRecord<'LNode'>] : []
		}),
		cloneMappings: [...content.cloneMappings],
		keepNameTypesFrom: 'source',
	})

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
	const cloneMappings = [...content.cloneMappings, ...applied.cloneMappings, ...iedMappings]

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
	enter('identity')
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })

	enter('cleanup')
	await postExtractionCleanup(tx)

	return {
		warnings: [
			...selection.warnings,
			...references.warnings,
			...communication.warnings,
			...satelliteWarnings({ applied, notPlaced: content.satellitesNotPlaced }),
		],
		fileType,
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

/**
 * What an SSD extract reads of the IEDs before writing: those the selection carries among the IEDs the scope's LNodes are
 * tied to, the file type, the cut of their references to what the file holds, their communication, and the uuids of the
 * source's logical nodes, inputs and outputs (an LNode of the frame may name any; the cleanup releases or clears those
 * the file does not hold).
 */
async function readCarriedIedSections(
	tx: Core.Transaction<Config>,
	params: CarriedIedSectionsParams,
): Promise<CarriedIedSections> {
	const { sourceQuery, scopeRef, ieds } = params
	const selection = await selectCarriedIeds(sourceQuery, { scopeRef, ieds })
	const fileType = resolveFileType({ fileType: params.fileType, carried: selection.carried })
	// a complete SCD gives each connection an address: its default keeps them; an SSD may describe the topology only
	const addresses = params.addresses ?? (fileType === 'SCD' ? 'keep' : 'drop')
	const references = await planReferences({
		roots: selection.carried.map(({ ied }) => ({ ref: ied, depth: 'whole' })),
		sourceQuery,
		destinationQuery: tx,
		policy: SSD_REFERENCE_POLICY,
	})
	const communication = await readCarriedCommunication(sourceQuery, {
		ieds: selection.carried.map(({ ied, name }) => ({ ied, name })),
		addresses,
	})
	const implementationUuids = await readImplementationUuids(sourceQuery)
	const incomplete: ExtractWarning[] =
		fileType === 'SCD' && addresses === 'drop' ? [{ code: 'scd-incomplete' }] : []
	return {
		selection: { ...selection, warnings: [...selection.warnings, ...incomplete] },
		fileType,
		references,
		communication,
		implementationUuids,
	}
}

/** The file type an extract writes: the one given, or by its content (an SCD when it carries an implemented IED). */
function resolveFileType(params: ResolveFileTypeParams): 'SSD' | 'SCD' {
	const { fileType, carried } = params
	if (fileType !== 'by-content') return fileType
	return carried.some((entry) => entry.kind === 'implemented') ? 'SCD' : 'SSD'
}
