import { TITLE_FIELDS_OVERRIDE } from '../constants/title'

import { DEFINITION } from '@/v2019C1/definition'

import type { TitleSpec } from '../constants/title'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

// ── Types ────────────────────────────────────────────────────────────

export type ExtractElementTitleOptions = {
	mode?: 'compact' | 'full'
}

export type ExtractElementTitleOptionsWithLabels = ExtractElementTitleOptions & {
	withLabels: true
}

/**
 * Rich title payload (returned when `withLabels: true`).
 *
 * - `title` is the engineering identifier computed from override -> text body
 *   -> identityFields -> tagName.
 * - `labels` is a two-level map `[lang][id]` → text:
 *   - outer key: lowercased BCP 47 language tag (e.g. `en`, `en-us`, `fr`).
 *   - inner key: IEC `id` attribute of the `<Label>` element; `''` when absent.
 *   Empty object when no `<Labels>` element is present.
 *
 * Typical UI usage:
 *   const display = labels[currentLang]?.[''] ?? labels.en?.[''] ?? title
 */
export type ElementTitle = {
	title: string
	labels: Record<string, Record<string, string>>
}

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

	const title = resolveTitle({ tag, mode, attributes, value: record.value })
	if (!options.withLabels) return title

	const labels = await collectLabels(query, record)
	return { title, labels }
}

// ── Internals ────────────────────────────────────────────────────────

function resolveTitle(input: {
	tag: string
	mode: 'compact' | 'full'
	attributes: Record<string, string>
	value: string | undefined
}): string {
	const { tag, mode, attributes, value } = input

	// 1. Override spec
	const spec = TITLE_FIELDS_OVERRIDE[tag]
	if (spec) {
		const rendered = renderSpec(spec, attributes, mode)
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
	const parts = fields.map((f) => attributes[f]).filter(Boolean)
	return parts.length > 0 ? parts.join(separator) : ''
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
