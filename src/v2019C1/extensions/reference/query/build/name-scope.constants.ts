/**
 * Joins the path of a name's scope and the name in the key a scoped name is looked up by: a line
 * feed, which no SCL name holds (they are normalized strings), so the key never equals the path of
 * an element, a name holding "/" included.
 */
export const SCOPED_NAME_KEY_SEPARATOR = '\n'
