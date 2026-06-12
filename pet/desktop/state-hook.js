#!/usr/bin/env node
/*
 * vibe-pet desktop : Claude Code hook -> state file bridge.
 *
 * Reads the hook event JSON from stdin and writes the pet state to
 * ~/.claude/pet/state.json. The desktop pet watches that file.
 *
 * This script must NEVER fail or block Claude Code:
 *   - always exits 0 (a non-zero/2 exit could block tool calls)
 *   - works fine when the pet app is not running (it only writes a file)
 *   - writes atomically (tmp + rename) so the watcher never sees half a file
 */

'use strict';

process.on('uncaughtException', () => process.exit(0));

const fs = require('fs');
const os = require('os');
const path = require('path');

function shortDetail(p) {
  const input = p.tool_input || {};
  const d =
    input.description ||
    (input.file_path && path.basename(input.file_path)) ||
    input.command ||
    '';
  return String(d).replace(/\s+/g, ' ').trim().slice(0, 60);
}

// hook event -> pet state; return null to ignore the event
function mapState(p) {
  switch (p.hook_event_name) {
    case 'SessionStart':
      return { state: 'idle', detail: '' };
    case 'PreToolUse':
      return { state: 'working', detail: [p.tool_name, shortDetail(p)].filter(Boolean).join(': ') };
    case 'Stop':
      return { state: 'done', detail: '' };
    default:
      return null;
  }
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const mapped = mapState(payload);
  if (!mapped) return;

  const dir = path.join(os.homedir(), '.claude', 'pet');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(
    tmp,
    JSON.stringify({
      state: mapped.state,
      detail: mapped.detail,
      hook_event: payload.hook_event_name,
      session_id: payload.session_id || '',
      updated_ms: Date.now(),
    })
  );
  fs.renameSync(tmp, file);
}

try {
  main();
} catch {
  /* never fail */
}
process.exit(0);
