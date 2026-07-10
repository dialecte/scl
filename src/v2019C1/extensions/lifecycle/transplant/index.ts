import { deep } from './transaction'

/**
 * Transplant engine — the shared clone/graft primitives that move an SCL subtree
 * (with its type closure and identity) between documents. Consumed internally by
 * the `extraction` and `instantiation` recipes; exposes `deep` as its public verb
 * (`tx.transplant.deep`).
 */
export const transplant = {
	transaction: { deep },
}
