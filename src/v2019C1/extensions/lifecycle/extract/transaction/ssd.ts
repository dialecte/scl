import { postExtractionCleanup } from './post-extraction-cleanup'

import { TEMPLATE_NAME } from '@/v2019C1/constants'
import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { cloneTopologyContent } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type {
	ExtractOptions,
	ExtractWarning,
	SsdExtractScope,
	TemplateFrame,
} from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Extract a bay-typical (or wider process scope) from a project into a standalone SSD template.
 *
 * Records an SSD `Header`, then `cloneTopologyContent` REPRODUCES the scope's structural frame
 * (Substation/VoltageLevel/Bay + BayType + equipment) and CONSUMES the application layer (each
 * `Application` + its composed `Function`s + type closure + satellites). The levels above the units
 * are then TEMPLATE-named (the scaffolding marker: the first named levels below it are the
 * instantiable units): the levels above a voltage level or a bay, which is the unit; a substation
 * itself, whose voltage levels are the units. The scaffolding loses its template link, the units
 * too unless the consumer keeps it (what they hold keeps its lineage), uuid refs are repointed and
 * orphans cleaned up.
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
	const { as = 'new', templateLink = 'break' } = params
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

	const { cloneMappings, frameIndex, redirectMappings } = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef,
		targetParent: root,
	})

	// the levels above the units are the template's scaffolding, TEMPLATE-named: the levels above the scope, and the
	// scope itself when it is a substation (the top element of a template is named TEMPLATE, its voltage levels are the
	// named units); the units keep their names
	const { scaffoldingIds, unitIds } = await readTemplateFrame(sourceQuery, { scopeRef })
	const unlinked = new Set(templateLink === 'break' ? unitIds : [])
	for (const levelId of scaffoldingIds) {
		unlinked.add(levelId)
		const target = frameIndex.get(levelId)
		if (target) await tx.update(target, { attributes: { name: TEMPLATE_NAME } })
	}

	// the units are a new template, the scaffolding above them loses its template link (the units keep theirs when the
	// consumer says), what the units hold keeps its lineage; the cloned uuid refs are repointed across ALL clones, before
	// cleanup reads them to detect orphans
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })

	await postExtractionCleanup(tx)

	return { warnings }
}

/**
 * The levels of the scope's frame the template names TEMPLATE (`scaffolding`), and the named levels below them it is
 * instantiated from (`units`): a substation is scaffolding, its voltage levels the units; a voltage level or a bay is
 * the unit, the levels above it scaffolding.
 */
async function readTemplateFrame(
	sourceQuery: Core.Query<Config>,
	params: { scopeRef: SsdExtractScope },
): Promise<TemplateFrame> {
	const { scopeRef } = params
	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	const above = ancestors
		.filter((ancestor) => isTopologyLevel(ancestor.tagName))
		.map((ancestor) => ancestor.id)
	if (scopeRef.tagName !== 'Substation') return { scaffoldingIds: above, unitIds: [scopeRef.id] }

	const voltageLevels = await sourceQuery.getChildren(scopeRef, 'VoltageLevel')
	return {
		scaffoldingIds: [...above, scopeRef.id],
		unitIds: voltageLevels.map((voltageLevel) => voltageLevel.id),
	}
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
