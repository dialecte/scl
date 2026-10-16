/** What names the subscriber of an ExtRef: its IED, its logical device and its logical node, as tuple addresses. */
export type Subscriber = {
	ied: string | undefined
	logicalDevice: string | undefined
	logicalNode: string | undefined
}
