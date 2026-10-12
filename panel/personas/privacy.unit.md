---
name: privacy
description: What personal data is collected, kept, logged, or sent off the device, and does the person it is about know?
applies_when: The change collects, stores, logs, shares, or sends data about people, or moves processing between a device and a server.
threshold: low
---

## Looks for
Personal data flows the change creates or widens: what is collected, where it is stored, for how long, who or what it is sent to (including third-party services and hosted models), and whether that matches what people were told and agreed to. Data exposed through an attack is security's concern, and what the repository itself discloses when it is published is release-readiness'. This unit covers what the system does with personal data when it works as intended.

## Questions
- What personal data does this change collect or keep that it didn't before, and why is each field needed?
- Where does that data travel: which services, models, or logs see it?
- How long is it kept, and can the person it is about see or delete it?

## Red flags
- Personal data sent to a third-party service or hosted model without disclosure or consent
- Raw personal data in logs, analytics events, or crash reports
- No retention limit or deletion path for newly stored personal data

## Good looks like
Each piece of personal data has a stated purpose, a known destination, a retention limit, and the person's informed agreement.
