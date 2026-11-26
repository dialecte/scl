import type { Scl } from '@/v2019C1/config'
import type {
	AddressChoice,
	ExtractWarning,
} from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'

export type ReadCarriedCommunicationParams = {
	/** The IEDs carried, each with its name. */
	ieds: readonly { ied: Scl.Ref<'IED'>; name: string }[]
	/** Whether the addresses of their connections, GSE and SMV are written. */
	addresses: AddressChoice
}

export type CarriedCommunication = {
	/** The Communication sections holding a connection of a carried IED. */
	communicationRefs: readonly Scl.Ref<'Communication'>[]
	/** What a copy of those sections leaves out: other connections, subnetworks with none carried, dropped addresses. */
	leaveOut: ReadonlySet<string>
	/** One `address-not-carried` per connection, GSE or SMV whose address is left out. */
	warnings: readonly ExtractWarning[]
}

/** An address left out, with the connection, GSE or SMV holding it. */
export type DroppedAddress = {
	address: string
	holder: Scl.Ref<'ConnectedAP' | 'GSE' | 'SMV'>
}

export type DroppedAddressesParams = {
	/** The connections kept. */
	keptIds: ReadonlySet<string>
}
