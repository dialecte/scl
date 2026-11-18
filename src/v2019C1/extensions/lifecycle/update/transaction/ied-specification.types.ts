import type { ReconcileIedParams } from './ied.types'
import type { Scl } from '@/v2019C1/config'
import type { IedSpecification } from '@/v2019C1/extensions/lifecycle/layers/ied/read-ied-specification.types'

/** What `reconcileIedSpecification` takes. */
export type ReconcileIedSpecificationParams = ReconcileIedParams & {
	/** The IED of the project updated, its own part reconciled. */
	instanceRef: Scl.Ref<'IED'>
	/** Its specification, read before the IED's own part was reconciled. */
	specification: IedSpecification
}
