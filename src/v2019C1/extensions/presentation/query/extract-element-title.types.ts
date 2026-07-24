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
