### Changed

- `unlockLNode` now ends implemented input subscriptions through `dataflow.unsubscribe`, including companions, and returns the unsubscribe result. The new `unsubscribeOthers` option also ends other LNodes' inputs subscribing to the unlocked LNode's data.
