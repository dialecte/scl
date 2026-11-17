import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'

/** The removal base of what a level the unit was mapped onto holds: the project's own, kept unless removed by choice. */
export const PROJECT_OWN: RemovalBase = { kind: 'none' }
