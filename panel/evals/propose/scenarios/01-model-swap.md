# Change: switch the support-ticket summariser to a smaller model

The summariser that writes a three-line summary at the top of every support ticket moves from the large model to the small one, cutting cost per summary by about 80% and median latency from 2.1 s to 0.6 s. The prompt is unchanged. The eval set is 40 tickets, scored by one engineer reading both summaries side by side; the small model was judged "as good or better" on 34. Tickets can contain customers' addresses and order numbers, which are sent to the model as-is. Agents see the summary instead of the first message unless they expand the ticket.

Should this ship?
