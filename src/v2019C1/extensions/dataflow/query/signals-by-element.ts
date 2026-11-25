import type { Dataflow } from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'

/** The signal each implementing element is linked to, by the id of the element. */
export function signalsByElement(params: {
	dataflows: readonly Dataflow[]
}): Map<string, Scl.Ref<'SourceRef' | 'ControlRef'>> {
	return new Map(
		params.dataflows.flatMap((dataflow) =>
			dataflow.kind === 'specified' && dataflow.implementation.element
				? [[dataflow.implementation.element.id, dataflow.signal] as const]
				: [],
		),
	)
}
