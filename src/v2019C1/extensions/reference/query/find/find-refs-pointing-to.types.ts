import { Scl } from '@/v2019C1/config'

export type ResolvedReference = {
	ref: Scl.TrackedRecord<Scl.ElementsOf>
	container: Scl.TrackedRecord<Scl.ElementsOf> | undefined
}
