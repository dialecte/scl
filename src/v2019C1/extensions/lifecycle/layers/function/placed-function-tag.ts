/**
 * What a function placed under `parent` is: a subfunction under a function or a subfunction (a
 * function nested in a function is, per schema, a subfunction), else a function. The one rule the
 * placement and the lookup of its instances read.
 */
export function placedFunctionTag(parent: { tagName: string }): 'Function' | 'SubFunction' {
	return parent.tagName === 'Function' || parent.tagName === 'SubFunction'
		? 'SubFunction'
		: 'Function'
}
