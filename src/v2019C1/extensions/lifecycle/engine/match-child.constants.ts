/**
 * The attributes a vendor's `Private` of another namespace is paired by: its `type`. The trees walk through the SCL
 * `Private`, so a `Private` met in a pairing is a vendor's element, which the schema gives no key.
 */
export const VENDOR_PRIVATE_KEY_FIELDS: readonly string[] = ['type']
