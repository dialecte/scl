import type { Config } from '@/v2019C1/config'
import type { TreeSelect } from '@dialecte/core'

/**
 * What one read of the process section keeps: every substation, line, process and function
 * template, whatever their depth (an LNode sits at many of them).
 */
export const PROCESS_SECTION_SELECT = {
	Substation: true,
	Line: true,
	Process: true,
	FunctionTemplate: true,
} satisfies TreeSelect<Config, 'SCL'>
