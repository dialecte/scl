import type { Scl } from '@/v2019C1/config'

export type UnlinkParams = {
	/** The signal to unlink from the element implementing it. */
	signal: Scl.Ref<'SourceRef' | 'ControlRef'>
}
