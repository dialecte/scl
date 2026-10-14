import type { Scl } from '@/v2019C1/config'

export type ResolveResult = {
	record: Scl.TrackedRecord<Scl.ElementsOf>
	qualifier?: string
}
