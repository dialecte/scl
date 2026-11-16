import type { AnyTreeRecord } from '@dialecte/core'

/** What a pairing reads of an instance child: one identity per kind, read once per parent walk. */
export type PairingReadKind =
	| 'instance'
	| 'project'
	| 'raw'
	| 'own'
	| 'names'
	| 'name'
	| 'key'
	| 'path'
	| 'reference-names'
	| 'placeholder'

/**
 * The identities read of the instance children of one parent while its source children are paired: each read once,
 * whatever the number of source children asking for it (`createPairingMemo`).
 */
export type PairingMemo = {
	read: (params: {
		kind: PairingReadKind
		record: AnyTreeRecord
		read: () => Promise<string | undefined>
	}) => Promise<string | undefined>
}
