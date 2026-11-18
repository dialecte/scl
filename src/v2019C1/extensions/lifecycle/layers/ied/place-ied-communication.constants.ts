/** What an IED contributes into a subnetwork the project holds: its connections; the rest is the subnetwork's own. */
export const CONTRIBUTED_SUBNETWORK_CHILDREN: ReadonlySet<string> = new Set(['ConnectedAP'])

/** The container an IED's connections land in. */
export const SUBNETWORK_TAG = 'SubNetwork'
