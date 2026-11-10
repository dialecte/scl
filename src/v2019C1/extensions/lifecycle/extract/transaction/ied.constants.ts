/** What an IED export writes under the root of an empty target: a target already holding one is refused. */
export const EXPORTED_ROOT_TAGS: ReadonlySet<string> = new Set([
	'IED',
	'Substation',
	'Line',
	'Process',
])
