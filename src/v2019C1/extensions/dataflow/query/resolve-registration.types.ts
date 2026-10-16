import type { Registration } from '../dataflow.types'

/**
 * What names the subscriber of an ExtRef: its IED, its logical device and its logical node (as tuple
 * addresses), the uuid of its logical device and logical node, the uuids of the access points of its
 * IED (a registration may name any of them, not only the one holding the ExtRef), and, for a logical
 * node held directly by an access point (it has no logical device), the names of both.
 */
export type Subscriber = {
	ied: string | undefined
	logicalDevice: string | undefined
	logicalNode: string | undefined
	accessPointUuids: ReadonlySet<string>
	uuids: Readonly<Record<Exclude<Registration['names'], 'ap'>, string | undefined>>
	accessPointLogicalNode: { accessPoint: string | undefined; logicalNode: string } | undefined
}
