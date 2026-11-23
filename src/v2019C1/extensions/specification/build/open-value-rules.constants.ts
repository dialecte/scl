import { firstOfClass, sameClassInTargetIed } from './open-value-rules'

/** The built-in `lnType` rules by name, for a caller that names a rule instead of passing a function. */
export const OPEN_VALUE_RULES = { sameClassInTargetIed, firstOfClass } as const
