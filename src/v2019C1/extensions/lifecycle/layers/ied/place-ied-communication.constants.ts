/** What an IED contributes into a subnetwork the project holds: its connections; the rest is the subnetwork's own. */
export const CONTRIBUTED_SUBNETWORK_CHILDREN: ReadonlySet<string> = new Set(['ConnectedAP'])

/** The container an IED's connections land in. */
export const SUBNETWORK_TAG = 'SubNetwork'

/**
 * What the IED contributes below a subnetwork the project holds by its name or by lineage (a first placement, an update
 * of a template's instance): its connections only, the subnetwork's own settings (its bit rate, its text, its private
 * data) being the project's, shared by every IED on it. A subnetwork a fork update matches by uuid is the file's own and
 * follows it; a subnetwork the project lacks is added whole.
 */
export const CONTRIBUTED_CHILDREN: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	[SUBNETWORK_TAG, CONTRIBUTED_SUBNETWORK_CHILDREN],
])
