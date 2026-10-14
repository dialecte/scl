/**
 * Strategy-based path segment extraction for SCL elements.
 *
 * Extracts path segments from SCL elements and builds canonical paths
 * from element ancestry. Uses a strategy map for element-specific extraction
 * with a default fallback for named/LNode elements.
 *
 * Separator semantics: the `separator` field indicates how THIS segment
 * joins to the PREVIOUS accumulated path (not what comes after).
 *
 * Process section paths: "S1/V1/B1/XCBR1.TripInput"
 * IED section paths:     "IED1/LD0/XCBR1.TrCmd.stVal"
 */

import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { SPECIFIED_NAMING_ATTRIBUTES } from '@/v2019C1/constants/lnode-spec-naming'
import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants/naming'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type {
	PathSegment,
	PathSegmentContext,
	PathSegmentWithRef,
	ElementPath,
	PathExtractor,
} from './path-segment.types'
import type {
	ExtractionStrategy,
	LNodeStrategy,
	SignalStrategy,
} from '@/v2019C1/extensions/reference/constants/path-extraction.types'
import type { AnyRawRecord } from '@dialecte/core'

// ── Extractor builders ───────────────────────────────────────────────

function buildExtractor(strategy: ExtractionStrategy): PathExtractor {
	switch (strategy.type) {
		case 'transparent':
			return () => null
		case 'name': {
			const separator = strategy.separator ?? '/'
			return (record) => {
				const name = getAttribute(record, 'name')
				return name ? { segment: name, separator } : null
			}
		}
		case 'lnClass':
			return (record) => {
				const lnClass = getAttribute(record, 'lnClass')
				if (!lnClass) return null
				const prefix = getAttribute(record, 'prefix') ?? ''
				const inst = getAttribute(record, 'inst') ?? getAttribute(record, 'lnInst') ?? ''
				return { segment: `${prefix}${lnClass}${inst}`, separator: '/' }
			}
		case 'lnode':
			return (record, context) => {
				const segment = buildLNodeName({ strategy, record, specNaming: context?.specNaming })
				return segment ? { segment, separator: '/' } : null
			}
		case 'attribute':
			return (record) => {
				const val = getAttribute(record, strategy.attr)
				return val ? { segment: val, separator: strategy.separator } : null
			}
		case 'signal':
			return (record, context) => {
				const segment = buildSignalName({
					strategy,
					record,
					siblings: context?.siblings ?? [record],
				})
				return segment ? { segment, separator: '.' } : null
			}
	}
}

/**
 * The name of a signal among its siblings: the plain name while no
 * sibling of the same tag shares it; otherwise `name(instance)`, the instance read with its
 * schema default, then `.data` when that attribute is set.
 */
function buildSignalName(params: {
	strategy: SignalStrategy
	record: AnyRawRecord
	siblings: readonly AnyRawRecord[]
}): string | null {
	const { strategy, record, siblings } = params
	const name = getAttribute(record, strategy.name)
	if (!name) return null

	const sharing = siblings.filter(
		(sibling) =>
			sibling.tagName === record.tagName && getAttribute(sibling, strategy.name) === name,
	)
	if (sharing.length <= 1) return name

	const instance =
		getAttribute(record, strategy.instance) ?? schemaDefault(record, strategy.instance)
	const data = strategy.data ? getAttribute(record, strategy.data) : undefined
	return `${name}${instance ? `(${instance})` : ''}${data ? `.${data}` : ''}`
}

/**
 * The name of an LNode: prefix, class and instance of its own attributes while no IED is assigned
 * to it; once one is, of the naming it was specified with when its `LNodeSpecNaming` is given (the
 * class read from the LNode when the naming has none).
 */
function buildLNodeName(params: {
	strategy: LNodeStrategy
	record: AnyRawRecord
	specNaming: AnyRawRecord | undefined
}): string | null {
	const { strategy, record, specNaming } = params
	const iedName = getAttribute(record, strategy.ied)
	const assigned = Boolean(iedName) && iedName !== UNALLOCATED_IED_NAME
	const named =
		assigned && specNaming
			? {
					prefix: getAttribute(specNaming, specifiedName(strategy.prefix)),
					lnClass:
						getAttribute(specNaming, specifiedName(strategy.lnClass)) ??
						getAttribute(record, strategy.lnClass),
					inst: getAttribute(specNaming, specifiedName(strategy.inst)),
				}
			: {
					prefix: getAttribute(record, strategy.prefix),
					lnClass: getAttribute(record, strategy.lnClass),
					inst: getAttribute(record, strategy.inst),
				}
	if (!named.lnClass) return null
	return `${named.prefix ?? ''}${named.lnClass}${named.inst ?? ''}`
}

/** The `LNodeSpecNaming` attribute keeping an LNode attribute's specified value. */
function specifiedName(name: string): string {
	return SPECIFIED_NAMING_ATTRIBUTES.get(name) ?? name
}

function schemaDefault(record: AnyRawRecord, attributeName: string): string | undefined {
	return getAttributeRules({ dialecteConfig: SCL_DIALECTE_CONFIG, record, attributeName }).default
}

const PATH_EXTRACTORS: Record<string, PathExtractor> = Object.fromEntries(
	Object.entries(PATH_EXTRACTION_CONFIG).map(([tag, strategy]) => [tag, buildExtractor(strategy)]),
)

// ── Public Methods ───────────────────────────────────────────────────

/**
 * Returns the path segment for an SCL element.
 *
 * Uses a strategy map for element-specific extraction (SourceRef, ControlRef,
 * LDevice, ExtRef, ExtCtrl).
 * Returns null for transparent containers (AccessPoint, Server) and
 * elements without identifiable attributes.
 */
export function getPathSegment(
	record: AnyRawRecord,
	context?: PathSegmentContext,
): PathSegment | null {
	const extractor = PATH_EXTRACTORS[record.tagName]
	if (extractor) return extractor(record, context)
	return null
}

/**
 * Builds the canonical path for any SCL element from its record and ancestry.
 *
 * Expects ancestry in top-down order: [root, ..., parent].
 *
 * Process section:
 * - "S1/V1/B1/XCBR1"           (LNode under Bay)
 * - "S1/V1/B1/XCBR1.Trip"      (SourceRef under LNode)
 *
 * IED section:
 * - "IED1/LD0/XCBR1"           (LN under LDevice, AccessPoint/Server transparent)
 * - "IED1/LD0/XCBR1.TrCmd"     (ExtRef under LN)
 *
 * Returns null when no segments exist.
 */
export function buildPathFromAncestry(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	/** The children of the record's parent, itself included: read by a signal's name. */
	siblings?: readonly AnyRawRecord[]
	/** The `LNodeSpecNaming` of each LNode of the path, by LNode id: read by an LNode's name. */
	specNamings?: ReadonlyMap<string, AnyRawRecord>
}): ElementPath | null {
	const { record, ancestry, siblings, specNamings } = params
	const parts: PathSegmentWithRef[] = []

	for (const ancestor of ancestry) {
		const seg = getPathSegment(ancestor, { specNaming: specNamings?.get(ancestor.id) })
		if (seg) parts.push({ ...seg, ref: { tagName: ancestor.tagName, id: ancestor.id } })
	}

	const ownSeg = getPathSegment(record, { siblings, specNaming: specNamings?.get(record.id) })
	if (ownSeg) parts.push({ ...ownSeg, ref: { tagName: record.tagName, id: record.id } })

	if (parts.length === 0) return null
	return { path: joinPathParts(parts), segments: parts }
}

// ── Helpers ──────────────────────────────────────────────────────────

function getAttribute(record: AnyRawRecord, name: string): string | undefined {
	return record.attributes.find((attribute) => attribute.name === name)?.value
}

export function joinPathParts(parts: readonly PathSegment[]): string {
	let result = parts[0].segment
	for (let i = 1; i < parts.length; i++) {
		result += parts[i].separator + parts[i].segment
	}
	return result
}
