import type { CidSenders } from './ied.types'

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

/** The options only a CID takes: given to another file type, refused rather than ignored. */
export const CID_ONLY_OPTIONS = ['interactingIeds', 'clientRefs'] as const

/**
 * The files a real IED's export writes, by type: the extension of the name it suggests, what its first history item says,
 * whether the IED's owner is written as the project it comes from when the IED holds none (an IID goes back to the project,
 * which recognises its own IEDs by it), and whether the LNodes the IED implements are listed when its substation part is
 * not written (an IID's configuration tool may not remove a logical node they are bound to).
 */
export const REAL_IED_EXPORT_FILES = {
	CID: {
		extension: '.cid',
		initialization: 'CID initialization',
		ownerFromProject: false,
		listsBoundLNodes: false,
	},
	IID: {
		extension: '.iid',
		initialization: 'IID initialization',
		ownerFromProject: true,
		listsBoundLNodes: true,
	},
} as const

/** The extension of the name an ISD export suggests. */
export const ISD_FILE_EXTENSION = '.isd'

/**
 * The substation part of a CID: the frames of the IED's LNodes only, no application, allocation role or power system
 * relation; a data specification keeps its mapping (the file holds the logical node it maps to).
 */
export const CID_PROCESS_OPTIONS = {
	applications: false,
	allocationRoles: false,
	powerSystemRelations: false,
	keepMappings: true,
} as const

/** The senders of a file holding no other IED (an IID, a CID with `interactingIeds: 'none'`): none. */
export const NO_SENDERS: CidSenders = {
	roots: [],
	senders: [],
	connections: new Map(),
	unresolvedMembers: [],
}
