import { buildExtractor } from './path-extractors'

import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { PathExtractor } from './path-segment.types'

/** The extractor of each tag a path names (`PATH_EXTRACTION_CONFIG`), built once. */
export const PATH_EXTRACTORS: Record<string, PathExtractor> = Object.fromEntries(
	Object.entries(PATH_EXTRACTION_CONFIG).map(([tag, strategy]) => [tag, buildExtractor(strategy)]),
)
