/**
 * Below a root of these tags, the changes of an element of the tags listed are decided apart from the root's own: a
 * group of their own, where the element's parent stays (an IED's access point, logical device or logical node added,
 * removed or changed while the IED's own attributes change too). Below an element added or removed whole, they travel
 * with it.
 */
export const GROUPED_APART_BELOW: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	['IED', new Set(['AccessPoint', 'LDevice', 'LN0', 'LN'])],
])
