# Change: new onboarding checklist behind a flag

A new onboarding checklist replaces the welcome email for new sign-ups. It is behind the `onboarding_v2` flag, off by default, enabled for 5% of new users at launch. The checklist reads the user's profile; if the profile is empty it shows a generic list. Tests cover the happy path and the empty-profile case. Three of the five checklist items link to help pages that are still being written and will 404 for the first week. The product manager wants it live before Friday's marketing push.

Should this ship?
