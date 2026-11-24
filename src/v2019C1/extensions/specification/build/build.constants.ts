import {
	FUNCTION_LIKE_TAGS,
	PROCESS_ROOT_TAGS,
	SUB_FUNCTION_TAGS,
} from '../transaction/build-ied.constants'

/** The function-like tags, as a set. */
export const FUNCTION_LIKES: ReadonlySet<string> = new Set(FUNCTION_LIKE_TAGS)

/** The subfunction tags, as a set. */
export const SUB_FUNCTIONS: ReadonlySet<string> = new Set(SUB_FUNCTION_TAGS)

/**
 * What a logical node may hold that uses it: control blocks, data sets, logs, inputs. Listed, not derived: the definition
 * gives the children an LN may hold, not which of them make it used (its DOIs, text and labels do not).
 */
export const LN_CONTENT_IN_USE: ReadonlySet<string> = new Set([
	'DataSet',
	'ReportControl',
	'LogControl',
	'GSEControl',
	'SampledValueControl',
	'SettingControl',
	'Log',
	'Inputs',
])

/** The process section root tags, as a set. */
export const PROCESS_ROOTS: ReadonlySet<string> = new Set(PROCESS_ROOT_TAGS)
