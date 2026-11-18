import type { Scl } from '@/v2019C1/config'

export type NameConnectionsParams = {
	/** The IED placed or updated. */
	ied: Scl.Ref<'IED'>
	/** What the Communication part of the placement or the update cloned. */
	cloneMappings: readonly Scl.CloneMapping[]
}
