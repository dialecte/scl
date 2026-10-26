import { postExtractionCleanup } from './post-extraction-cleanup'

import { TEMPLATE_NAME } from '@/v2019C1/constants'
import { history } from '@/v2019C1/extensions/history'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { cloneTopologyContent } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type { ExtractOptions } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Extract a bay-typical (or wider process scope) from a project into a standalone SSD template.
 *
 * Records an SSD `Header`, then `cloneTopologyContent` REPRODUCES the scope's structural frame
 * (Substation/VoltageLevel/Bay + BayType + equipment) and CONSUMES the application layer (each
 * `Application` + its composed `Function`s + type closure + satellites). The reproduced ancestors
 * above the selected entrypoint are then TEMPLATE-named (the scaffolding marker: the first named
 * level below the TEMPLATE-named ancestors is the instantiable root), the entrypoint keeps its name.
 * The entrypoint and the scaffolding above it lose their template link (what the entrypoint holds keeps its
 * lineage), uuid refs are repointed and orphans cleaned up.
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	} & ExtractOptions,
): Promise<{ warnings: string[] }> {
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

	// TEMPLATE-name the reproduced ancestors above the entrypoint; the entrypoint is the named,
	// reusable root.
	const unlinked = new Set(templateLink === 'break' ? [scopeRef.id] : [])
	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	for (const ancestor of ancestors) {
		if (!isTopologyLevel(ancestor.tagName)) continue
		unlinked.add(ancestor.id)
		const target = frameIndex.get(ancestor.id)
		if (target) await tx.update(target, { attributes: { name: TEMPLATE_NAME } })
	}

	// the entrypoint is a new template, the levels above it its scaffolding: they lose their template link (the
	// entrypoint keeps it when the consumer says), what the entrypoint holds keeps its lineage; the cloned uuid refs
	// are repointed across ALL clones, before cleanup reads them to detect orphans
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })

	await postExtractionCleanup(tx)

	return { warnings }
}

/** IED / Communication are dropped by the SSD extract until the IED/ISD layer lands. */
async function collectSkippedSectionWarnings(sourceQuery: Core.Query<Config>): Promise<string[]> {
	const ieds = await sourceQuery.getRecordsByTagName('IED')
	const communications = await sourceQuery.getRecordsByTagName('Communication')

	if (ieds.length === 0 && communications.length === 0) return []

	return [
		`Skipped ${ieds.length} IED and ${communications.length} Communication section(s): not yet carried into an SSD (available once the IED/ISD layer exists).`,
	]
}
