import { sortInDocumentOrder } from './document-order'
import { ASD_ROOT_TAG, FSD_UNSUPPORTED_ROOT_TAG } from './source-root.constants'

import { FSD_PLACEABLE_ROOT_TAGS } from '@/v2019C1/extensions/lifecycle/contract.constants'
import { readSsdScope } from '@/v2019C1/extensions/lifecycle/layers/topology'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	SourceRoot,
	SourceRootCandidate,
	SourceRootRef,
	SourceRootTag,
	SourceRootVerb,
} from './source-root.types'
import type { Config } from '@/v2019C1/config'
import type { SsdScopeUnit } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * What an FSD template file holds to instantiate, read-only and never throwing on the shape of the
 * file: the one function (`found`), none, several to choose from, or an equipment function (`unsupported`).
 * The placeable roots (a function, a function template) are judged first; an equipment function counts
 * only when the file holds no placeable root. A function and an equipment function resolve to the function.
 *
 * @intent which function of an FSD template file to instantiate, root of a function template file, is the FSD file ambiguous
 */
export async function fsd(query: Core.Query<Config>): Promise<SourceRoot<'fsd'>> {
	const functions = await readInDocumentOrder(query, { tagNames: FSD_PLACEABLE_ROOT_TAGS })
	if (functions.length === 0) {
		const [equipmentFunction] = await readInDocumentOrder(query, {
			tagNames: [FSD_UNSUPPORTED_ROOT_TAG],
		})
		return equipmentFunction
			? {
					kind: 'unsupported',
					ref: { tagName: FSD_UNSUPPORTED_ROOT_TAG, id: equipmentFunction.id },
				}
			: { kind: 'none' }
	}
	return oneOrSeveral(
		functions.map((record) => ({
			ref: { tagName: record.tagName as (typeof FSD_PLACEABLE_ROOT_TAGS)[number], id: record.id },
			name: nameOf(record),
			linked: [],
		})),
	)
}

/**
 * What an ASD template file holds to instantiate, read-only and never throwing on the shape of the
 * file: the one application (`found`), none, or several to choose from.
 *
 * @intent which application of an ASD template file to instantiate, root of an application template file, is the ASD file ambiguous
 */
export async function asd(query: Core.Query<Config>): Promise<SourceRoot<'asd'>> {
	const applications = await readInDocumentOrder(query, { tagNames: [ASD_ROOT_TAG] })
	return oneOrSeveral(
		applications.map((record) => ({
			ref: { tagName: ASD_ROOT_TAG, id: record.id },
			name: nameOf(record),
			linked: [],
		})),
	)
}

/**
 * What an SSD template file holds to instantiate, read-only and never throwing on the shape of the
 * file: the one unit, or the scaffolding of units linked together (`found`), none, or several to choose
 * from, each with the units linked to it. A scaffolding with nothing named below it is found at its
 * deepest level.
 *
 * @intent which unit of an SSD template file to instantiate, root of a substation template file, is the SSD file ambiguous
 */
export async function ssd(query: Core.Query<Config>): Promise<SourceRoot<'ssd'>> {
	const read = await readSsdScope(query, {})
	if (read.kind === 'scope') return { kind: 'found', ref: read.scope.root }
	if (read.kind !== 'ambiguous') return { kind: 'none' }
	return {
		kind: 'several',
		candidates: read.candidates.map((candidate) => ({
			ref: unitRef(candidate),
			name: candidate.name,
			linked: candidate.linked.map((unit) => ({ ref: unitRef(unit), name: unit.name })),
		})),
	}
}

/** Every element of the tags the file holds, read by tag once each, in document order. */
async function readInDocumentOrder(
	query: Core.Query<Config>,
	params: { tagNames: readonly SourceRootTag[] },
): Promise<AnyTrackedRecord[]> {
	const records: AnyTrackedRecord[] = []
	for (const tagName of params.tagNames) {
		const ofTag = await query.any.getRecordsByTagName(tagName)
		records.push(...ofTag)
	}
	return sortInDocumentOrder(query, { records })
}

/** The one candidate (`found`), none, or several (`several`, in the order given). */
function oneOrSeveral<GenericVerb extends SourceRootVerb>(
	candidates: SourceRootCandidate<GenericVerb>[],
): SourceRoot<GenericVerb> {
	if (candidates.length === 0) return { kind: 'none' }
	if (candidates.length === 1) return { kind: 'found', ref: candidates[0].ref }
	return { kind: 'several', candidates }
}

function nameOf(record: AnyTrackedRecord): string {
	return readAttribute({ record, name: 'name', defaults: 'none' }) ?? ''
}

function unitRef(unit: SsdScopeUnit): SourceRootRef<'ssd'> {
	return { tagName: unit.tagName, id: unit.id }
}
