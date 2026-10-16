/** The key of an element in an index of tuple targets: its address and its tag (kinds of control block may share a name). */
export function targetKey(params: { address: string; tagName: string }): string {
	return `${params.tagName}|${params.address}`
}
