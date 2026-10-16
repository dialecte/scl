import { all } from '../all'
import { ofControlRef } from '../of-control-ref'
import { ofSourceRef } from '../of-source-ref'

import { expect } from 'vitest'

import type { ParityParams } from './dataflow-fixture.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Asserts that the dataflow of a signal, asked alone, is the entry of that signal in `all`: the two
 * read through one description, so they cannot differ.
 */
export async function assertParity(params: ParityParams): Promise<void> {
	const { query, signal } = params
	const alone =
		signal.tagName === 'SourceRef'
			? await ofSourceRef(query, { ref: signal as Scl.Ref<'SourceRef'> })
			: await ofControlRef(query, { ref: signal as Scl.Ref<'ControlRef'> })
	const entry = (await all(query)).find(
		(dataflow) => dataflow.kind === 'specified' && dataflow.signal.id === signal.id,
	)
	expect(entry).toEqual(alone)
}
