import { FUNCTION_SECTION_TAGS } from './function-sections.constants'

import type { FunctionSection, FunctionSections } from './extract.types'
import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

/** Whether a section of a function is written: every one is, unless the caller leaves it out. */
export function keepsSection(params: {
	sections: FunctionSections | undefined
	section: FunctionSection
}): boolean {
	const { sections, section } = params
	return sections?.[section] !== false
}

/** The elements left out of a function: those of every section the caller leaves out. */
export function omitOfSections(params: {
	sections: FunctionSections | undefined
}): OmitEntry<Config>[] {
	const { sections } = params
	return (Object.keys(FUNCTION_SECTION_TAGS) as (keyof typeof FUNCTION_SECTION_TAGS)[])
		.filter((section) => !keepsSection({ sections, section }))
		.flatMap((section) => FUNCTION_SECTION_TAGS[section])
}
