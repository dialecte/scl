import { asd, fsd, ssd } from './source-root'

/** `query.lifecycle.sourceRoot.<verb>()`: what a template file holds to instantiate, one function per verb. */
export const sourceRoot = { fsd, asd, ssd }

export type {
	SourceRoot,
	SourceRootCandidate,
	SourceRootRef,
	SourceRootUnsupported,
	SourceRootVerb,
} from './source-root.types'
