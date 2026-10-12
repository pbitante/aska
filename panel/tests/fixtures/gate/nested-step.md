# Step 4: Webhook delivery

## Implementation check

    npm test

## Adversarial review targets

- Signature checks: a request signed with an old key; a replayed delivery; a delivery for another
  account or endpoint; a delivery after the subscription was cancelled.
- Payload handling on the receiving side:
  - the sender including fields the schema never defined (the sender is trusted, but its payload
    must still go through every server check);
  - oversized payloads;
  - event types outside the schema.
- Data exposure: deliveries carry the full record (names, addresses). Check that it goes only to
  the subscriber's own endpoint, that nothing logs it, and that it isn't cached by a proxy.
- Retry lifecycle: workers waiting forever, deliveries left pending after a restart, the queue
  lock never released, a `sending` row left behind, and a retry delivering the event twice.
- Parity: any rule that holds for HTTP subscribers but not for queue subscribers (ordering,
  filtering, rate limits, dead-lettering).
- Size edges: the batch size estimate under-counting, which makes the sender truncate silently,
  and very long event names.
- Dashboard: a delivery log that parses but is semantically wrong (an empty event list, both
  success and error), live status that differs from what is stored, a page reload between
  sending the event and recording the reply.
- Compatibility: the Step 3 sender against the Step 4 receiver, and the Step 4 sender against a
  receiver with batching turned off.

## Corrections (2026-01-04)

1. **Signed headers, not signed bodies.**
