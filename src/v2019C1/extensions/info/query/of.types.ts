import type { ElementState } from '../constants/state.types'

export type InfoOptions = {
	/** `compact` (default) for tree labels and breadcrumbs, `full` for tooltips and panels. */
	mode?: 'compact' | 'full'
	/** Also collect the element's `<Labels>` (one more read per element, so asked for). */
	withLabels?: boolean
	/**
	 * Also compute the element's state (see `ElementStateByTag`), so asked for: an LNode's reads what implements it
	 * and the kind of that IED. Without it the info has no `state` key.
	 */
	withState?: boolean
}

/**
 * What a consumer shows and checks about one element.
 *
 * - `title` is the engineering identifier computed from override -> text body
 *   -> identityFields -> tagName.
 * - `labels` (with `withLabels: true`) is a two-level map `[lang][id]` → text:
 *   - outer key: lowercased BCP 47 language tag (e.g. `en`, `en-us`, `fr`).
 *   - inner key: `id` attribute of the `<Label>` element; `''` when absent.
 *   Empty object when no `<Labels>` element is present.
 *
 * Typical UI usage:
 *   const display = info.labels?.[currentLang]?.[''] ?? info.title
 */
export type ElementInfo<GenericElement extends string = string> = {
	title: string
	/** The element's state (with `withState: true`), for a tag that has one (see `ElementStateByTag`). */
	state?: ElementState<GenericElement>
	labels?: Record<string, Record<string, string>>
}
