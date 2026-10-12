// A trimmed slice (events 33-49) of the real `evals/results/panel-2026-10-09T15-29-48-750Z.jsonl`
// transcript, with tool inputs/outputs stripped to just the shape `parallelPanelistLaunch` reads.
// `msg_B` carries the two `aska:panelist` launches, split across two top-level `assistant`
// events with a `Read` tool_use from guardian's own subagent (`parent_tool_use_id` set)
// interleaved between them — the real shape Claude Code's `stream-json` output never collapses
// into one event, however many blocks one message has.
export const trimmedRealTranscript: unknown[] = [
  { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_A', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } },
  { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } },
  { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_A', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } },
  { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } },
  { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_B', content: [{ type: 'text' }] } },
  { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_B', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] } },
  { type: 'system' },
  { type: 'system' },
  { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } },
  { type: 'assistant', parent_tool_use_id: 'toolu_outer', message: { id: 'msg_C', content: [{ type: 'thinking' }] } },
  { type: 'assistant', parent_tool_use_id: 'toolu_outer', message: { id: 'msg_C', content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
  { type: 'system' },
  { type: 'user', parent_tool_use_id: 'toolu_outer', message: { content: [{ type: 'tool_result' }] } },
  { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_B', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'aska:panelist' } }] } },
  { type: 'system' },
  { type: 'system' },
  { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } },
];
