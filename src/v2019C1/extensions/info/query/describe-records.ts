import { STATE_RULES } from '../constants/state'
import { TITLE_FIELDS_OVERRIDE } from '../constants/title'

import { readAttributes, toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { DEFINITION } from '@/v2019C1/definition'
import { LINEAGE } from '@/v2019C1/extensions/lifecycle/constraints'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { readSiblingsOfEach } from '@/v2019C1/extensions/reference/query/build/read-siblings-of-each'
import { nameAmongSiblings } from '@/v2019C1/extensions/reference/query/build/signal-name'

import type { ConditionalTitle, TitleSpec } from '../constants/title.types'
import type {
	DescribedRecord,
	DescribeRecordsParams,
	LabelEntry,
	RecordReads,
} from './describe-records.types'
import type { InfoContext } from './info-context.types'
import type { ElementInfo } from './of.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * `of` for records already in hand, in the order given (`undefined` answers an empty title): what the titles and labels
 * read beyond the records themselves is read once for all of them, then each one is described.
 *
 * Perf: the siblings of every signal by one `readSiblingsOfEach` (at most 3 reads), the child an `attributesFrom` title
 * reads by one `getChildrenOfEach` per child tag, the labels by two `getChildrenOfEach` (`Labels`, then `Label`) - a
 * fixed number of reads whatever the number of records; a record is never read again.
 */
export async function describeRecords(params: DescribeRecordsParams): Promise<ElementInfo[]> {
	const { query, records, options, context } = params
	const [signalNames, childAttributes, labels] = await Promise.all([
		readSignalNames({ query, records }),
		readChildAttributes({ query, records }),
		options.withLabels ? readLabels({ query, records }) : undefined,
	])

	const infos: ElementInfo[] = []
	for (const [index, record] of records.entries()) {
		if (!record) {
			infos.push({ title: '' })
			continue
		}
		const attributes = readRecordAttributes(record)
		const specAttributes =
			childAttributes.get(index) ??
			(signalNames.has(index)
				? { ...attributes, signalName: signalNames.get(index) ?? '' }
				: attributes)
		const info = await describeOne({
			query,
			record,
			attributes,
			reads: { specAttributes, labels: labels?.[index] },
			options,
			context,
		})
		infos.push(info)
	}
	return infos
}

// ── Internals ────────────────────────────────────────────────────────

async function describeOne(params: {
	query: Core.Query<Config>
	record: Core.AnyRawRecord
	attributes: Record<string, string>
	reads: RecordReads
	options: DescribeRecordsParams['options']
	context: InfoContext
}): Promise<ElementInfo> {
	const { query, record, attributes, reads, options, context } = params
	const tag = record.tagName
	const spec = TITLE_FIELDS_OVERRIDE[tag]
	const title = resolveTitle({
		tag,
		spec,
		mode: options.mode ?? 'compact',
		attributes,
		specAttributes: reads.specAttributes,
		value: record.value,
	})
	const state = options.withState
		? await readState({ query, record, attributes, context })
		: undefined

	return {
		title,
		...(state ? { state } : {}),
		...(reads.labels ? { labels: reads.labels } : {}),
	}
}

/**
 * The name of each signal (SourceRef, ControlRef) among the signals of its LNode, by record position; `null` where
 * it has none. The siblings of all the signals in one batch.
 */
async function readSignalNames(params: {
	query: Core.Query<Config>
	records: readonly DescribedRecord[]
}): Promise<Map<number, string | null>> {
	const { query } = params
	const signals = [...params.records.entries()].flatMap(([index, record]) =>
		record && SIGNAL_TAG_NAMES.has(record.tagName) ? [{ index, raw: toRawRecord(record) }] : [],
	)
	if (signals.length === 0) return new Map()
	const siblings = await readSiblingsOfEach({ query, records: signals.map(({ raw }) => raw) })
	return new Map(
		signals.map(({ index, raw }, position) => [
			index,
			nameAmongSiblings({ record: raw, siblings: siblings[position] }),
		]),
	)
}

/**
 * For each record whose title reads a child (`attributesFrom`), that child's attributes (its first child of the tag,
 * `{}` when it has none), by record position; one read per child tag.
 */
async function readChildAttributes(params: {
	query: Core.Query<Config>
	records: readonly DescribedRecord[]
}): Promise<Map<number, Record<string, string>>> {
	const { query } = params
	const byChildTag = new Map<string, { index: number; record: Core.AnyRawRecord }[]>()
	for (const [index, record] of params.records.entries()) {
		const childTag = record && TITLE_FIELDS_OVERRIDE[record.tagName]?.attributesFrom
		if (!record || !childTag) continue
		const group = byChildTag.get(childTag) ?? []
		group.push({ index, record })
		byChildTag.set(childTag, group)
	}

	const answers = await Promise.all(
		[...byChildTag].map(async function readFirstChildren([tagName, group]) {
			// dialecte-allow query-in-loop: one read per child tag a title reads (one today), whatever the number of records: core reads one tag per call
			const children = await query.any.getChildrenOfEach(
				group.map(({ record }) => record),
				{ tagName },
			)
			return group.map(({ index }, position) => {
				const [child] = children[position]
				return [index, child ? readRecordAttributes(child) : {}] as const
			})
		}),
	)
	const attributesByIndex = new Map<number, Record<string, string>>(answers.flat())
	return attributesByIndex
}

/**
 * The labels of each record, by record position (`{}` for a record without `<Labels>`): the `Labels` of every record
 * in one read, the `Label` of every `Labels` in one more.
 */
async function readLabels(params: {
	query: Core.Query<Config>
	records: readonly DescribedRecord[]
}): Promise<(Record<string, Record<string, string>> | undefined)[]> {
	const { query, records } = params
	const held = records.flatMap((record) => (record ? [record] : []))
	const containers =
		held.length > 0 ? await query.any.getChildrenOfEach(held, { tagName: 'Labels' }) : []
	const everyContainer = containers.flat()
	const labelsOfContainers =
		everyContainer.length > 0
			? await query.any.getChildrenOfEach(everyContainer, { tagName: 'Label' })
			: []
	const labelsByContainer = new Map(
		everyContainer.map((container, position) => [container, labelsOfContainers[position]]),
	)

	let heldPosition = 0
	const labels: (Record<string, Record<string, string>> | undefined)[] = []
	for (const record of records) {
		if (!record) {
			labels.push(undefined)
			continue
		}
		const entries: LabelEntry[] = []
		for (const container of containers[heldPosition]) {
			for (const label of labelsByContainer.get(container) ?? []) {
				const attributes = readRecordAttributes(label)
				const lang = (attributes['lang'] ?? '').toLowerCase()
				const text = (label.value ?? '').trim()
				if (lang && text) entries.push({ lang, id: attributes['id'] ?? '', text })
			}
		}
		labels.push(groupByLang(entries))
		heldPosition++
	}
	return labels
}

/**
 * The attributes of a record in hand, as `query.getAttributes` reads them once it holds the record: the records here
 * were read through the call's query (staged state included) or given by the caller, described as given.
 */
function readRecordAttributes(record: Core.AnyRawRecord): Record<string, string> {
	return readAttributes({ record, dialecteConfig: SCL_DIALECTE_CONFIG })
}

async function readState(params: {
	query: Core.Query<Config>
	record: Core.AnyRawRecord
	attributes: Record<string, string>
	context: InfoContext
}): Promise<ElementInfo['state']> {
	const rule = STATE_RULES[params.record.tagName as keyof typeof STATE_RULES]
	return rule
		? rule({ ...params, record: params.record as Scl.TrackedRecord<Scl.ElementsOf> })
		: undefined
}

function resolveTitle(input: {
	tag: string
	spec: TitleSpec | undefined
	mode: 'compact' | 'full'
	attributes: Record<string, string>
	specAttributes: Record<string, string>
	value: string | undefined
}): string {
	const { tag, spec, mode, attributes, specAttributes, value } = input

	// 1. Override spec
	if (spec) {
		const rendered = renderSpec(spec, specAttributes, mode)
		if (rendered) return rendered
	}

	// 2. Text body
	const text = (value ?? '').trim()
	if (text) return text

	// 3. identityFields fallback - lineage attributes identify, a uuid is never a title
	const definition = DEFINITION[tag as keyof typeof DEFINITION]
	const identityFields = (
		(definition?.attributes as { identityFields?: string[] } | undefined)?.identityFields ?? []
	).filter((f) => !LINEAGE.has(f))
	const preferred = identityFields.find((f) => f === 'name' || f === 'id') ?? identityFields[0]
	if (preferred && attributes[preferred]) return attributes[preferred]

	// 4. tagName
	return attributes['name'] || tag
}

function groupByLang(entries: LabelEntry[]): Record<string, Record<string, string>> {
	const labels: Record<string, Record<string, string>> = {}
	for (const { lang, id, text } of entries) {
		;(labels[lang] ??= {})[id] = text
	}
	return labels
}

function renderSpec(
	spec: TitleSpec,
	attributes: Record<string, string>,
	mode: 'compact' | 'full',
): string {
	const useFull = mode === 'full' && spec.full !== undefined
	const fields = useFull ? spec.full! : spec.compact
	const separator = useFull ? (spec.fullSeparator ?? spec.separator ?? '') : (spec.separator ?? '')

	if (typeof fields === 'string') {
		return renderTemplate(fields, attributes)
	}
	if (isConditionalTitle(fields)) {
		for (const variant of fields) {
			if (variant.whenPresent && !attributes[variant.whenPresent]) continue
			const rendered = renderTemplate(variant.template, attributes)
			if (rendered) return rendered
		}
		return ''
	}
	const parts = fields.map((f) => attributes[f]).filter(Boolean)
	return parts.length > 0 ? parts.join(separator) : ''
}

function isConditionalTitle(fields: string[] | ConditionalTitle): fields is ConditionalTitle {
	return typeof fields[0] === 'object'
}

/**
 * Substitute `{attr}` placeholders and aggressively drop empty fragments so
 * optional attributes do not produce malformed output:
 * - drop empty bracket/paren pairs (`[]`, `()`)
 * - split on `/`, then on `.`, drop empty pieces, rejoin
 *
 * Cleanup only touches structural delimiters `/`, `.`, `[]`, `()`. Custom
 * literals inside templates (e.g. `:`, `->`) pass through untouched.
 */
function renderTemplate(template: string, attributes: Record<string, string>): string {
	const raw = template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => attributes[name] ?? '')
	const cleaned = raw.replace(/\[\]/g, '').replace(/\(\)/g, '')
	return cleaned
		.split('/')
		.map((segment) =>
			segment
				.split('.')
				.filter((piece) => piece !== '')
				.join('.'),
		)
		.filter((segment) => segment !== '')
		.join('/')
}
