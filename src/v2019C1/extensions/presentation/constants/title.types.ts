/**
 * Ordered list of conditional template variants. The renderer picks the first
 * variant whose `whenPresent` attribute is non-empty (a variant without
 * `whenPresent` is an unconditional fallback) and renders its template. Used
 * when a title must switch between a concrete binding and a specification hint
 * (e.g. SourceRef `source` vs `pLN.pDO.pDA`, ControlRef `controlled` vs
 * `pLN.pDO`).
 */
export type ConditionalTitle = { whenPresent?: string; template: string }[]

export type TitleSpec = {
	compact: string | string[] | ConditionalTitle
	full?: string | string[] | ConditionalTitle
	separator?: string
	fullSeparator?: string
	/**
	 * Source the template/list attributes from a named child element instead
	 * of the element itself. Used by composite refs whose data lives in a
	 * child (e.g. `ApplicationSclRef > SclFileReference`).
	 */
	attributesFrom?: string
}
