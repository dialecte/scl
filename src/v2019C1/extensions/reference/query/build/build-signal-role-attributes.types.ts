import type { Scl } from '@/v2019C1/config'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'

/** A signal role reference and the attributes it holds for the element it names. */
export type SignalRoleAttributes = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	values: DerivedAttributeValue[]
}
