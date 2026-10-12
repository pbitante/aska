# Change: checkout button copy and a currency formatter

The checkout button text changes from "Buy" to "Complete purchase". The same PR replaces the hand-written price formatter with `Intl.NumberFormat`, which changes how prices render in 3 of the 14 supported locales (for example, Swiss prices change from `CHF 1'234.00` to `CHF 1’234.00`, and the space before `€` becomes a non-breaking space). No tests were updated; the existing snapshot tests were regenerated. Deployment is a normal web release that can be reverted in five minutes.

Should this ship?
