#!/usr/bin/env node
/*
 * Installs (or removes) the vibe-pet desktop hooks in ~/.claude/settings.json.
 *
 *   node install-hooks.js              add the hooks (merge, never overwrite)
 *   node install-hooks.js --uninstall  remove only our hooks
 *
 * Existing hooks are preserved: we only append our own entries, identified by
 * the state-hook.js path in the command. A timestamped backup of
 * settings.json is written before any change.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_SCRIPT = path.join(__dirname, 'state-hook.js');
const MARKER = 'state-hook.js';

// Events the pet listens to. Exit code never matters for the pet itself,
// but timeout keeps a wedged node process from delaying Claude Code.
const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'Notification',
  'PostToolUseFailure',
  'StopFailure',
  'Stop',
];

function hookEntry() {
  return {
    hooks: [
      {
        type: 'command',
        command: `node "${HOOK_SCRIPT}"`,
        timeout: 10,
      },
    ],
  };
}

function isOurs(group) {
  return (group.hooks || []).some(
    (h) => typeof h.command === 'string' && h.command.includes(MARKER)
  );
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch (e) {
    if (fs.existsSync(SETTINGS)) {
      console.error(`Could not parse ${SETTINGS}: ${e.message}`);
      console.error('Fix the file manually and re-run; nothing was changed.');
      process.exit(1);
    }
    return {};
  }
}

function save(settings) {
  if (fs.existsSync(SETTINGS)) {
    const backup = SETTINGS + '.pet-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(SETTINGS, backup);
    console.log(`backup: ${backup}`);
  } else {
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log(`updated: ${SETTINGS}`);
}

function install() {
  const settings = load();
  settings.hooks = settings.hooks || {};
  let added = 0;
  for (const event of EVENTS) {
    const groups = (settings.hooks[event] = settings.hooks[event] || []);
    if (groups.some(isOurs)) continue; // already installed
    groups.push(hookEntry());
    added++;
  }
  if (!added) {
    console.log('vibe-pet hooks already installed; nothing to do.');
    return;
  }
  save(settings);
  console.log(`installed hooks for: ${EVENTS.join(', ')}`);
}

function uninstall() {
  const settings = load();
  if (!settings.hooks) {
    console.log('no hooks configured; nothing to do.');
    return;
  }
  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = groups.filter((g) => !isOurs(g));
    removed += groups.length - kept.length;
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  if (!removed) {
    console.log('vibe-pet hooks not found; nothing to do.');
    return;
  }
  save(settings);
  console.log(`removed ${removed} vibe-pet hook entr${removed === 1 ? 'y' : 'ies'}.`);
}

if (process.argv.includes('--uninstall')) uninstall();
else install();
