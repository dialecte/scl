import type { ReadAttributesBaseParams } from '@dialecte/core/helpers'

/** What every SCL attribute read takes: core's parameters, the SCL configuration bound. */
export type SclReadAttributesBaseParams = Omit<ReadAttributesBaseParams, 'dialecteConfig'>

/** One attribute of a record held: its `name`, in a `namespace` scope when given. */
export type ReadAttributeParams = SclReadAttributesBaseParams & {
	name: string
	namespace?: string
}

/** The attributes of a record held, in a `namespace` scope when given. */
export type ReadAttributesParams = SclReadAttributesBaseParams & { namespace?: string }
