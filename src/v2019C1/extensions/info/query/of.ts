import { STATE_RULES } from '../constants/state'
import { TITLE_FIELDS_OVERRIDE } from '../constants/title'
import { createInfoContext } from './info-context'

import { toRawRecord } from '@dialecte/core/helpers'

import { DEFINITION } from '@/v2019C1/definition'
import { LINEAGE } from '@/v2019C1/extensions/lifecycle/constraints'
import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { readSignalName } from '@/v2019C1/extensions/reference/query/build/signal-name'

import type { ConditionalTitle, TitleSpec } from '../constants/title.types'
import type { InfoContext } from './info-context.types'
import type { ElementInfo, InfoOptions } from './of.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

// ── Public API ───────────────────────────────────────────────────────

/**
 * Query extension: what a consumer shows and checks about an SCL element - its title, and its
 * `<Labels>` when asked (`withLabels: true`, one more read per element).
 *
 * Resolution precedence for the title (first non-empty wins):
 * 1. `TITLE_FIELDS_OVERRIDE` spec for the tag (compact or full).
 * 2. `record.value` (XML text body) - handles BayType, IEDName, Val, etc.
 * 3. `DEFINITION.identityFields` fallback (name > id > first), lineage attributes left out.
 * 4. tagName.
 */
export async function of<GenericElement extends string = string>(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord & { readonly tagName: GenericElement },
	options: InfoOptions = {},
): Promise<ElementInfo<GenericElement>> {
	return describeElement({ query, refOrRecord, options, context: createInfoContext(query) })
}

/** `of`, with the document-wide facts of the call (`ofEach` shares one context). */
export async function describeElement<GenericElement extends string = string>(params: {
	query: Core.Query<Config>
	refOrRecord: AnyRefOrRecord & { readonly tagName: GenericElement }
	options: InfoOptions
	context: InfoContext
}): Promise<ElementInfo<GenericElement>> {
	const { query, refOrRecord, options, context } = params
	const record = await query.getRecord(refOrRecord as Scl.Ref<Scl.ElementsOf>)
	if (!record) return { title: '' }

	const tag = record.tagName
	const mode = options.mode ?? 'compact'
	const attributes = await query.any.getAttributes(record)

	const spec = TITLE_FIELDS_OVERRIDE[tag]
	const specAttributes = await readSpecAttributes({ query, record, spec, attributes })

	const title = resolveTitle({ tag, spec, mode, attributes, specAttributes, value: record.value })
	const state = await readState({ query, record, attributes, context })
	const labels = options.withLabels ? await collectLabels(query, record) : undefined

	return {
		title,
		...(state ? { state: state as ElementInfo<GenericElement>['state'] } : {}),
		...(labels ? { labels } : {}),
	}
}

// ── Internals ────────────────────────────────────────────────────────

/**
 * The attributes a title template reads: the element's own, or those of the child the spec
 * names; a signal also gets its `signalName`, its name among the signals of its LNode.
 */
async function readSpecAttributes(params: {
	query: Core.Query<Config>
	record: Scl.TrackedRecord<Scl.ElementsOf>
	spec: TitleSpec | undefined
	attributes: Record<string, string>
}): Promise<Record<string, string>> {
	const { query, record, spec, attributes } = params
	if (spec?.attributesFrom) return getChildAttributes(query, record, spec.attributesFrom)
	if (!SIGNAL_TAG_NAMES.has(record.tagName)) return attributes
	const signalName = await readSignalName(query, toRawRecord(record))
	return { ...attributes, signalName: signalName ?? '' }
}

async function readState(params: {
	query: Core.Query<Config>
	record: Scl.TrackedRecord<Scl.ElementsOf>
	attributes: Record<string, string>
	context: InfoContext
}): Promise<ElementInfo['state']> {
	const rule = STATE_RULES[params.record.tagName as keyof typeof STATE_RULES]
	return rule ? rule(params) : undefined
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

async function getChildAttributes(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
	childTag: string,
): Promise<Record<string, string>> {
	const [child] = await query.any.getChildren(record, childTag)
	return child ? query.any.getAttributes(child) : {}
}

async function collectLabels(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<Record<string, Record<string, string>>> {
	return groupByLang(await fetchLabelEntries(query, record))
}

type LabelEntry = { lang: string; id: string; text: string }

async function fetchLabelEntries(
	query: Core.Query<Config>,
	record: Core.AnyRawRecord,
): Promise<LabelEntry[]> {
	const entries: LabelEntry[] = []
	const containers = await query.any.getChildren(record, 'Labels')
	for (const container of containers) {
		const labelRecords = await query.any.getChildren(container, 'Label')
		for (const label of labelRecords) {
			const attrs = await query.any.getAttributes(label)
			const lang = (attrs['lang'] ?? '').toLowerCase()
			const text = (label.value ?? '').trim()
			if (lang && text) entries.push({ lang, id: attrs['id'] ?? '', text })
		}
	}
	return entries
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
				.filter((p) => p !== '')
				.join('.'),
		)
		.filter((segment) => segment !== '')
		.join('/')
}
