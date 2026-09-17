import { postExtractionCleanup } from './post-extraction-cleanup'

import { TEMPLATE_NAME, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { history } from '@/v2019C1/extensions/history'
import { TOPOLOGY_EXTRACT_OMIT } from '@/v2019C1/extensions/lifecycle/layers/omit-filters'
import { cloneTopologyContent } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Extract a bay-typical (or wider process scope) from a project into a standalone SSD template.
 *
 * Records an SSD `Header`, then `cloneTopologyContent` REPRODUCES the scope's structural frame
 * (Substation/VoltageLevel/Bay + BayType + equipment) and CONSUMES the application layer (each
 * `Application` + its composed `Function`s + type closure + satellites). The reproduced ancestors
 * above the selected entrypoint are then TEMPLATE-named (the scaffolding marker: the first named
 * level below the TEMPLATE-named ancestors is the instantiable root), the entrypoint keeps its name
 * with `templateUuid` stripped, uuid refs are repointed and orphans cleaned up.
 */
export async function ssd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		scopeRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
		tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		who: Scl.AttributesValueObjectOf<'Hitem'>['who']
		nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	},
): Promise<{ warnings: string[] }> {
	const { sourceQuery, scopeRef, tool, who, nameStructure } = params
	const root = await tx.getRoot()

	const scopeName = (await sourceQuery.getAttribute(scopeRef, { name: 'name' })) || 'Unnamed'

	// IED / Communication are out of the topology take-over - skip them and warn (they are
	// carried over once the IED/ISD layer exists).
	const warnings = await collectSkippedSectionWarnings(sourceQuery)

	await history.transaction.addEntry(tx, {
		filename: `SSD_${scopeName.replace(/\s+/g, '_')}`,
		header: {
			fileType: 'SSD',
			version: 'keep',
			tool,
			...(nameStructure ? { nameStructure } : {}),
		},
		item: {
			who,
			what: 'SSD initialization',
			why: 'Process scope was extracted from a previous file',
		},
	})

	const { mappings, frameIndex } = await cloneTopologyContent(tx, {
		sourceQuery,
		scopeRef,
		targetParent: root,
		omit: TOPOLOGY_EXTRACT_OMIT,
	})

	// TEMPLATE-name the reproduced ancestors above the entrypoint; the entrypoint is the named,
	// reusable root (templateUuid already stripped by the frame reproduction).
	const ancestors = await sourceQuery.findAncestors(scopeRef, { stopAtTagName: 'Substation' })
	for (const ancestor of ancestors) {
		if (!(TOPOLOGY_STRUCTURAL_TAGS as readonly string[]).includes(ancestor.tagName)) continue
		const target = ancestor.id ? frameIndex.get(ancestor.id) : undefined
		if (target) await tx.update(target, { attributes: { name: TEMPLATE_NAME } })
	}

	const entryTarget = scopeRef.id ? frameIndex.get(scopeRef.id) : undefined
	if (entryTarget) {
		await tx.update(entryTarget, { attributes: { name: scopeName, templateUuid: undefined } })
	}

	// Repoint cloned uuid refs across ALL clones before cleanup reads them to detect orphans.
	await applyUuidRemap(tx, { mappings })

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
