import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** What the satellites are folded into: a primary's diff, or the report of a placed frame. */
export type SatelliteFoldTarget = Pick<InstanceDiff, 'root' | 'groups' | 'mappings'>
