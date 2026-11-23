import {
	FUNCTION_LIKE_TAGS,
	PROCESS_ROOT_TAGS,
	SUB_FUNCTION_TAGS,
} from '../transaction/build-ied.constants'

/** The function-like tags, as a set. */
export const FUNCTION_LIKES: ReadonlySet<string> = new Set(FUNCTION_LIKE_TAGS)

/** The subfunction tags, as a set. */
export const SUB_FUNCTIONS: ReadonlySet<string> = new Set(SUB_FUNCTION_TAGS)

/** The process section root tags, as a set. */
export const PROCESS_ROOTS: ReadonlySet<string> = new Set(PROCESS_ROOT_TAGS)
