---
name: llm-behavior
description: Does the model-driven feature fail safely when the model hallucinates, is manipulated, refuses, or meets a situation it shouldn't handle?
applies_when: The change adds or alters a prompt, a model, a tool the model can call, or how model output is used.
threshold: low
---

## Looks for
What happens when the model is wrong or misled: invented facts presented as true, instructions smuggled in through content it reads, refusals that leave the user stuck, risky actions taken through tools, and situations (emergencies, safety, money) where it should defer instead of answer. Classic injection into queries, commands, and templates is security's concern; this unit covers failures specific to model behaviour.

## Questions
- What does the user see when the model's answer is confidently wrong?
- Can text the model reads (documents, messages, web pages) change what it does?
- Which tool calls can the model make without confirmation, and what is the worst one?
- What does the model do when asked about an emergency or something outside its role?

## Red flags
- Model output acted on or stored without any check
- Untrusted content placed in the prompt alongside instructions
- A tool with side effects callable with no confirmation or limit
- No defined behaviour for refusals, timeouts, or empty answers

## Good looks like
Every model failure mode has a defined, safe outcome, and nothing irreversible happens on the model's word alone.
