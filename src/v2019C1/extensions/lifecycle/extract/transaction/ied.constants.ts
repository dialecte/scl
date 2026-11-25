/** What an IED export writes under the root of an empty target: a target already holding one is refused. */
export const EXPORTED_ROOT_TAGS: ReadonlySet<string> = new Set([
	'IED',
	'Substation',
	'Line',
	'Process',
])

/** The input modes an IED export offers: no input, or every input in later-binding form. */
export const INPUT_MODES: ReadonlySet<string> = new Set(['none', 'later-binding'])

/** The kinds of ISD an IED export writes. */
export const ISD_KINDS: ReadonlySet<string> = new Set(['instance', 'template'])

/** Which IEDs a CID holds besides the selected one: none, or the IEDs its inputs are bound to (see `InteractingIeds`). */
export const INTERACTING_IEDS = ['none', 'publishers'] as const

/** What a CID does with the receivers and report clients naming an IED absent from the file (see `ClientRefs`). */
export const CLIENT_REFS = ['keep', 'cleanAbsent'] as const

/** The files a real IED's export writes, by type: the extension of the name it suggests. */
export const REAL_IED_EXPORT_FILES = { CID: { extension: '.cid' } } as const

/** The extension of the name an ISD export suggests. */
export const ISD_FILE_EXTENSION = '.isd'
