/** Root-anchored kinds: the SclRef wrapper element + implied fileType. */
export const ROOT_ANCHORS = {
	function: { tag: 'FunctionSclRef', fileType: 'FSD' },
	application: { tag: 'ApplicationSclRef', fileType: 'ASD' },
} as const
