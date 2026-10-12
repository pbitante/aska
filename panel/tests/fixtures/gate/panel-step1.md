# Step 1: Judgment contract and panelist CLI

## Adversarial review targets

- Prompt and validator agree: the example JSON in the panel prompt, with placeholder values replaced by valid ones, must validate.
- `check-judgment` given JSON wrapped in a code fence. The panelist is told not to fence its output, so this is invalid; the violation message must say why.
- stdin handling in the bundle: `echo '{}' | node skills/operator/scripts/persona.mjs check-judgment x` must not hang.
- Exit-code consistency with the existing commands.

## Implementation check

