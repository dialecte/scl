import type { PairingMemo } from './pairing-memo.types'

/**
 * A memo for the pairing of one parent's children: an identity of an instance child is read the first time a source
 * child asks for it, then answered from the memo. One per parent walk (the identities depend on the walk's key and
 * redirects, which do not change within it).
 */
export function createPairingMemo(): PairingMemo {
	const reads = new Map<string, Promise<string | undefined>>()
	return {
		read: function readOnce({ kind, record, read }) {
			const key = `${kind}:${record.id}`
			const known = reads.get(key)
			if (known) return known
			const reading = read()
			reads.set(key, reading)
			return reading
		},
	}
}
