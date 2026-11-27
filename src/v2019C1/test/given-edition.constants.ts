import { EXTENSION } from './given-extension-version.constants'

/** What each root opt-in of a case needs when it is given: the reason, said in its refusal. */
export const ROOT_OPT_IN_NEEDS = {
	editionOneRoot: 'the reason a given document is a first-edition file',
	noExtensionVersion: `the reason a given document carries the ${EXTENSION.prefix} namespace without its version`,
} as const

/** The attributes an `SCL` root states its edition by: a root stating its version states the other two as well. */
export const SCL_EDITION_ATTRIBUTES = ['version', 'revision', 'release'] as const
