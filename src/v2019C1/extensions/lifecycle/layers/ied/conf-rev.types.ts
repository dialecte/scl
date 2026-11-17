/** A next configuration revision, or why there is none: see `nextConfRev`. */
export type NextConfRev = { next: string } | { refusal: 'invalid' | 'overflow' }
