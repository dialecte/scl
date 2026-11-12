import { GROUNDED_CONNECTIVITY_NODE_NAME } from '@/v2019C1/constants/naming'

/**
 * Whether a reference to a connectivity node names the predefined `grounded` node by its path: a file need not declare
 * it, so such a reference has no uuid and names nothing the file holds, by design.
 */
export function namesGroundedNode(params: { targets: readonly string[]; path: string }): boolean {
	const { targets, path } = params
	return (
		targets.includes('ConnectivityNode') &&
		path.split('/').at(-1) === GROUNDED_CONNECTIVITY_NODE_NAME
	)
}
