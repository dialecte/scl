/** What an IED export writes under the root of an empty target: a target already holding one is refused. */
export const EXPORTED_ROOT_TAGS: ReadonlySet<string> = new Set([
	'IED',
	'Substation',
	'Line',
	'Process',
])

/** The input modes an IED export offers: no input, or every input in later-binding form. */
export const INPUT_MODES: ReadonlySet<string> = new Set(['none', 'later-binding'])
