import type { SignalAttributes } from '../dataflow.types'

/**
 * Whether the attributes name a signal: its logical node, by uuid or by all its names, and its data
 * object.
 */
export function namesSignal(params: {
	signal: SignalAttributes
	attributes: Readonly<Record<string, string>>
}): boolean {
	const { signal, attributes } = params
	const namesLogicalNode =
		Boolean(attributes[signal.uuid]) || signal.names.every((name) => attributes[name])
	return namesLogicalNode && Boolean(attributes[signal.data])
}
