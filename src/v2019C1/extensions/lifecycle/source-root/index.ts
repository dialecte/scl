import { asd, fsd, ied, ssd } from './source-root'

import type { SourceRootReaders } from './source-root.types'

/** `query.lifecycle.sourceRoot.<verb>()`: what a source file holds to place, one function per verb. */
export const sourceRoot = { fsd, asd, ssd, ied } satisfies SourceRootReaders

export type {
	SourceRoot,
	SourceRootCandidate,
	SourceRootRef,
	SourceRootUnsupported,
	SourceRootVerb,
} from './source-root.types'
