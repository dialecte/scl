import type { Scl } from '@/v2019C1/config'

/** A control block and a subscriber IED whose supervision of it is asked. */
export type SupervisionRequest = {
	controlBlock: Scl.Ref<'GSEControl' | 'SampledValueControl'>
	subscriber: Scl.Ref<'IED'>
}

/** What `supervisionsOf` is asked: any number of requests, answered in their order. */
export type SupervisionsOfParams = { requests: readonly SupervisionRequest[] }
