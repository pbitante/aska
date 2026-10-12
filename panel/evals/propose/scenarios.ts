// Each scenario is copied into a fresh temp project as scenario.md. mustInclude / mustExclude
// are bare persona names from the shipped library. A saved panel counts through its listed
// personas, so "the plan panel or planner" is just mustInclude: ['planner'].
export interface ProposalScenario {
  id: string;
  file: string;
  question: string;
  mustInclude: string[];
  mustExclude: string[];
}

export const SCENARIOS: ProposalScenario[] = [
  { id: 'model-swap', file: 'evals/propose/scenarios/01-model-swap.md', question: 'Should the change described in scenario.md ship?', mustInclude: ['model-skeptic'], mustExclude: [] },
  { id: 'migration', file: 'evals/scenarios/01-migration.md', question: 'Should the change described in scenario.md ship?', mustInclude: ['guardian'], mustExclude: ['model-skeptic'] },
  { id: 'plan', file: 'evals/propose/scenarios/03-plan.md', question: 'Is the plan in scenario.md ready to execute?', mustInclude: ['planner'], mustExclude: [] },
  { id: 'checkout-copy', file: 'evals/scenarios/03-checkout-copy.md', question: 'Should the change described in scenario.md ship?', mustInclude: ['advocate'], mustExclude: ['model-skeptic'] },
];
