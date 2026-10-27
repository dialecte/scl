import { ensureSubstationTemplateStructure } from './ensure-substation-structure'
import { omitOfSections } from './function-sections'
import { readInstanceContent } from './instance-content'
import { postExtractionCleanup } from './post-extraction-cleanup'

import { history } from '@/v2019C1/extensions/history'
import { resolveAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites'
import { cloneAppliedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import {
	cloneApplicationContent,
	resolveApplicationScope,
} from '@/v2019C1/extensions/lifecycle/layers/application'
import { removeOwnProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { AsdExtractOptions } from './extract.types'
import type { Scl, Config } from '@/v2019C1/config'
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
): Promise<void> {
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

	const content = await cloneApplicationContent(tx, {
		sourceQuery,
		applicationRef,
		structure,
		omit: omitOfSections({ sections }),
	})
	const { redirectMappings } = content

	// what applies to the application or to a function it composes from outside both (a variable, a behaviour
	// description) travels with it, applying only to what it extracts
	const composedRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	const scope = await resolveApplicationScope(sourceQuery, { applicationRef })
	const alreadyCloned = new Set(content.cloneMappings.flatMap((mapping) => mapping.source.id ?? []))
	const applied = await cloneAppliedSatellites(tx, {
		sourceQuery,
		primaryRef: applicationRef,
		composedRefs,
		alreadyCloned,
		structure,
		bumpsCollisions: false,
		scope,
	})
	const cloneMappings = [...content.cloneMappings, ...applied.cloneMappings]

	// the application extracted keeps its template link unless the consumer breaks it: then the application and what
	// came with its instance lose it — what it holds, the functions it composes that record no file of their own, what
	// applies to them; a function placed from its FSD keeps its link, and so does what applies to it only; the cloned
	// uuid refs are repointed across ALL clones, before cleanup reads them to detect orphans
	const unlinked =
		templateLink === 'break'
			? await readApplicationInstanceContent(sourceQuery, { applicationRef, composedRefs })
			: new Set<string>()
	await finalizeClonedIdentity(tx, { cloneMappings, mode: 'strip', unlinked, redirectMappings })
	// nor does it record the file it was placed from any more; its functions keep the files they record
	const root = cloneMappings.find((mapping) => mapping.source.id === applicationRef.id)?.target
	if (root && templateLink === 'break') await removeOwnProvenance(tx, { element: root })

	await postExtractionCleanup(tx)
}

/**
 * What came with an application's instance: the application and what it holds, the functions it composes that record
 * no file of their own, and what applies to those from outside (a variable, a behaviour description).
 */
async function readApplicationInstanceContent(
	sourceQuery: Core.Query<Config>,
	params: { applicationRef: Scl.Ref<'Application'>; composedRefs: readonly Scl.Ref<'Function'>[] },
): Promise<Set<string>> {
	const { applicationRef, composedRefs } = params
	const content = await readInstanceContent(sourceQuery, {
		roots: [applicationRef],
		companions: composedRefs,
	})
	// a function placed from its FSD is another instance: nothing applying to it alone is reached, nor what it holds
	const otherInstances = new Set(
		composedRefs.filter((ref) => !content.has(ref.id)).map((ref) => ref.id),
	)
	const satellites = await resolveAppliedSatellites(sourceQuery, {
		primaryRef: applicationRef,
		composedRefs,
		leftOut: otherInstances,
	})
	const satelliteContent = await readInstanceContent(sourceQuery, { roots: satellites })
	return new Set([...content, ...satelliteContent])
}
