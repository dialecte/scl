/**
 * A caller's rule for a value the standard leaves open: given what the verb knows about the point (its context,
 * read by the verb in one batch), the value to use, or `undefined` to leave it open (the verb then refuses, as the
 * standard gives no value). Pure and synchronous: no store read, so a plan and its write give the same answer.
 */
export type OpenValueRule<Context, Value = string> = (context: Context) => Value | undefined

/**
 * The rules a caller supplies for the open points a verb declares (`Points`: point name → its context). Every point
 * is optional: an absent rule leaves the point to the standard's behaviour.
 */
export type OpenValues<Points extends Record<string, unknown>> = {
	[Point in keyof Points]?: OpenValueRule<Points[Point]>
}
