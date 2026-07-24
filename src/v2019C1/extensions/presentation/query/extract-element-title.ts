import { TITLE_FIELDS_OVERRIDE } from '../constants/title'

import { DEFINITION } from '@/v2019C1/definition'

import type { ConditionalTitle, TitleSpec } from '../constants/title.types'
import type {
	ElementTitle,
	ExtractElementTitleOptions,
	ExtractElementTitleOptionsWithLabels,
} from './extract-element-title.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

// ── Public API ───────────────────────────────────────────────────────

/**
 * Query extension: extracts a human-readable title for an SCL element.
 *
 * Default returns the title string. Pass `{ withLabels: true }` to also
 * collect `<Labels>/<Label lang="...">` children (IEC 61850-6 i18n); this
 * incurs extra child-record traversal so it is opt-in.
 *
 * Resolution precedence for the title (first non-empty wins):
 * 1. `TITLE_FIELDS_OVERRIDE` spec for the tag (compact or full).
 * 2. `record.value` (XML text body) - handles BayType, IEDName, Val, etc.
 * 3. `DEFINITION.identityFields` fallback (name > id > first).
 * 4. tagName.
 */
export function extractElementTitle(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord,
	options: ExtractElementTitleOptionsWithLabels,
): Promise<ElementTitle>
export function extractElementTitle(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord,
	options?: ExtractElementTitleOptions,
): Promise<string>
export async function extractElementTitle(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord,
	options: ExtractElementTitleOptions & { withLabels?: boolean } = {},
): Promise<string | ElementTitle> {
	const record = await query.getRecord(refOrRecord as Scl.Ref<Scl.ElementsOf>)
	if (!record) return options.withLabels ? { title: '', labels: {} } : ''

	const tag = record.tagName
	const mode = options.mode ?? 'compact'
	const attributes = await query.any.getAttributes(record)

	const spec = TITLE_FIELDS_OVERRIDE[tag]
	const specAttributes = spec?.attributesFrom
		? await getChildAttributes(query, record, spec.attributesFrom)
		: attributes

	const title = resolveTitle({ tag, spec, mode, attributes, specAttributes, value: record.value })
	if (!options.withLabels) return title

	const labels = await collectLabels(query, record)
	return { title, labels }
}

// ── Internals ────────────────────────────────────────────────────────

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

	// 3. identityFields fallback
	const definition = DEFINITION[tag as keyof typeof DEFINITION]
	const identityFields = (definition?.attributes as { identityFields?: string[] } | undefined)
		?.identityFields
	const preferred = identityFields?.find((f) => f === 'name' || f === 'id') ?? identityFields?.[0]
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
