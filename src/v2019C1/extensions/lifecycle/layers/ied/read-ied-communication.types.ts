import type { LinkedSectionDescription } from '@/v2019C1/extensions/lifecycle/linked-sections/description.types'

export type IedCommunicationDescription = LinkedSectionDescription & {
	leaveOut: ReadonlySet<string>
}
