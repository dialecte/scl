/** What clearing an input's source removes: its whole source (`data`), or the control block sending it only. */
export type InputSourceScope = 'data' | 'control-block'

/** What losing its source does to an input or output: deleted, or its source attributes cleared. */
export type InputSourceEffect =
	| { effect: 'deleted' }
	| { effect: 'cleared'; attributes: readonly string[] }
