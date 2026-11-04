import type { Scl } from '@/v2019C1/config'

/** A record the commit deletes, and a child of it that the commit leaves in the store without a parent. */
export type LeftChild = {
	record: Scl.Ref<Scl.ElementsOf>
	child: Scl.Ref<Scl.ElementsOf>
}

/** A record by its tag and its record id. */
export type IdentifiedRef = Scl.Ref<Scl.ElementsOf> & { id: string }
