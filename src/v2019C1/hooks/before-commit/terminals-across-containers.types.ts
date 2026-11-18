import type { AnyRawRecord } from '@dialecte/core'

/** The nearest substation, line or process holding a terminal and the node it names, when there is one. */
export type TerminalContainers = {
	terminal: AnyRawRecord | undefined
	node: AnyRawRecord | undefined
}
