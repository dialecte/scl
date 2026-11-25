/** Why staging an ISD is refused, one per rule. */
export const STAGE_REFUSAL_REASONS = [
	'target-not-empty',
	'lnode-outside-process',
	'shell-not-specification',
	'no-lnodes',
	'ied-name',
	'type-missing',
] as const

/** The verb named in a refusal's meta: the stage refused, not the build. */
export const STAGE_VERB = 'stageIsd'

/** The header of the staging document: never exported, its provenance comes from the project at the extract. */
export const STAGE_FILE = {
	filename: 'ISD_STAGE',
	fileType: 'SCD',
	tool: 'stageIsd',
	who: 'stageIsd',
	what: 'ISD staging',
	why: 'logical nodes staged with the IED built from them, for an ISD export',
} as const

/** What the shell's IED leaves behind: the files it came from are not the staged IED's. */
export const SHELL_OMITTED_TAGS = ['IEDSourceFiles', 'MinRequestedSCDFiles'] as const
