import { DEFINITION } from '@/v2019C1/definition/definition.generated'

/** The element a hand-made test document may lack. */
export const HEADER = 'Header'

/** The children of the SCL root, in the order the schema sets: a supplied Header goes before what follows it there. */
export const SCL_ROOT_CHILD_ORDER: readonly string[] = DEFINITION.SCL.children.sequence
