#!/usr/bin/env node
/*
 * vibe-pet : a tiny terminal pet that grows while you code.
 *
 * Inspired by the Codex pet. Zero dependencies, works anywhere Node.js runs
 * (Windows Terminal / PowerShell / cmd / Git Bash / WSL).
 *
 * Usage:
 *   node pet/pet.js              live view (f = feed, p = play, q = quit)
 *   node pet/pet.js status       one-shot status card
 *   node pet/pet.js feed         feed the pet
 *   node pet/pet.js play         play with the pet
 *   node pet/pet.js name <name>  rename the pet
 *   node pet/pet.js xp <n>       add XP (used by Claude Code hooks)
 *   node pet/pet.js statusline   compact one-liner for the Claude Code status line
 *   node pet/pet.js reset        start over with a new egg
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_FILE = path.join(os.homedir(), '.vibe-pet.json');
const HOUR = 60 * 60 * 1000;

/* ------------------------------------------------------------------ state */

function defaultState() {
  return {
    name: 'Vibe',
    born: Date.now(),
    xp: 0,
    lastFed: Date.now(),
    lastPlayed: 0,
    lastWorked: 0,
    lastActivity: '',
  };
}

function loadState() {
  try {
    return Object.assign(defaultState(), JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

/* ------------------------------------------------------------- derived */

const STAGES = [
  { id: 'egg',   label: 'Egg',   min: 0 },
  { id: 'baby',  label: 'Baby',  min: 30 },
  { id: 'kid',   label: 'Kid',   min: 150 },
  { id: 'adult', label: 'Adult', min: 500 },
];

function stageOf(state) {
  let stage = STAGES[0];
  for (const s of STAGES) if (state.xp >= s.min) stage = s;
  return stage;
}

function nextStage(state) {
  return STAGES.find((s) => s.min > state.xp) || null;
}

function levelOf(state) {
  return Math.floor(Math.sqrt(state.xp / 5)) + 1;
}

// 100 right after a meal, drains ~8 points per hour.
function fullnessOf(state, now = Date.now()) {
  const hours = (now - state.lastFed) / HOUR;
  return Math.max(0, Math.min(100, Math.round(100 - hours * 8)));
}

function moodOf(state, now = Date.now()) {
  if (stageOf(state).id === 'egg') return 'incubating';
  if (now - state.lastWorked < 90 * 1000) return 'working';
  if (fullnessOf(state, now) < 30) return 'hungry';
  if (now - state.lastPlayed < 2 * 60 * 1000) return 'happy';
  const hour = new Date(now).getHours();
  if (hour >= 23 || hour < 6) return 'sleepy';
  return 'content';
}

/* ----------------------------------------------------------------- art */

// Pixel-art sprites modeled on the Codex pet: a small terracotta creature
// with two ears, dot eyes and stubby legs. Each pixel is one palette key;
// '.' is transparent. Rendered with half-block characters (two pixels per
// terminal cell) in 24-bit color, with a plain-ASCII fallback.

const PALETTE = {
  o: [209, 123, 85], // terracotta body
  e: [59, 37, 29], // eyes
  p: [236, 160, 120], // blush
  t: [120, 170, 230], // tear
  m: [125, 70, 48], // mini-icon eyes (midtone keeps the tiny silhouette solid)
};

const SPRITES = {
  egg: {
    body: [
      '...oooo...',
      '..oooooo..',
      '.oooooooo.',
      '.oooooooo.',
      '..oooooo..',
    ],
    eyes: [],
  },
  baby: {
    body: [
      '.oooooo.',
      '.oooooo.',
      '.oooooo.',
      '..o..o..',
    ],
    eyes: [[1, 2], [1, 5]],
  },
  kid: {
    body: [
      '.o......o.',
      '.oooooooo.',
      '.oooooooo.',
      '.oooooooo.',
      '..o.oo.o..',
    ],
    eyes: [[2, 2], [2, 7]],
  },
  adult: {
    body: [
      '..o......o..',
      '.oooooooooo.',
      'oooooooooooo',
      'oooooooooooo',
      '..o..oo..o..',
    ],
    eyes: [[2, 2], [2, 9]],
  },
};

function buildGrid(stageId, mood, frame) {
  const def = SPRITES[stageId];
  const g = def.body.map((r) => r.split(''));

  if (stageId === 'egg') {
    // wobble side to side
    const rows = g.map((r) => r.join(''));
    return frame === 0 ? rows : rows.map((r) => '.' + r.slice(0, -1));
  }

  const blink = mood === 'sleepy' || (mood === 'content' && frame === 1);
  for (const [r, c] of def.eyes) {
    if (blink) continue;
    g[r][c] = 'e';
    if (mood === 'happy') g[r + 1][c] = 'p';
    if (mood === 'hungry') g[r + 1][c] = 't';
  }

  // gentle one-pixel bob between frames
  const rows = g.map((r) => r.join(''));
  const blank = '.'.repeat(rows[0].length);
  return frame === 0 ? [...rows, blank] : [blank, ...rows];
}

const RESET = '\x1b[0m';

function useColor() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.VIBE_PET_ASCII !== '1';
}

function renderHalfBlocks(rows) {
  if (rows.length % 2) rows = [...rows, '.'.repeat(rows[0].length)];
  const fg = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
  const bg = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
  const lines = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = '';
    for (let x = 0; x < rows[y].length; x++) {
      const top = PALETTE[rows[y][x]];
      const bot = PALETTE[(rows[y + 1] || '')[x]];
      if (top && bot) line += fg(top) + bg(bot) + '▀';
      else if (top) line += RESET + fg(top) + '▀';
      else if (bot) line += RESET + fg(bot) + '▄';
      else line += RESET + ' ';
    }
    lines.push(line + RESET);
  }
  return lines;
}

function renderRows(rows) {
  if (!useColor()) {
    const map = { o: '#', e: 'o', p: '~', t: ',' };
    return rows.map((r) => [...r].map((ch) => map[ch] || ' ').join(''));
  }
  return renderHalfBlocks(rows);
}

// Two-pixel-tall versions of each stage: exactly one terminal line when
// rendered with half blocks, so the pet can live in the status line.
const MINI = {
  egg: ['.oo.', 'oooo'],
  baby: ['.ooo.', 'omomo'],
  kid: ['.o..o.', 'omoomo'],
  adult: ['.o....o.', 'oomoomoo'],
};

function miniIcon(state, mood) {
  if (process.env.NO_COLOR) return null;
  let rows = MINI[stageOf(state).id];
  if (mood === 'sleepy') rows = rows.map((r) => r.replace(/m/g, 'o'));
  return renderHalfBlocks(rows)[0];
}

const FACES = {
  egg: { incubating: '(egg)' },
  default: {
    working: '(o.o)*',
    happy: '(^.^)',
    hungry: '(;.;)',
    sleepy: '(-.-)zz',
    content: '(o.o)',
  },
};

function framesFor(state, now = Date.now()) {
  const stage = stageOf(state).id;
  const mood = moodOf(state, now);
  return [0, 1].map((f) => {
    const lines = renderRows(buildGrid(stage, mood, f));
    if (mood === 'sleepy') lines[0] += f === 0 ? '  z' : '  Z';
    return lines;
  });
}

function bar(value, width = 10) {
  const filled = Math.round((value / 100) * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

/* ------------------------------------------------------------- commands */

function feed(state) {
  state.lastFed = Date.now();
  state.xp += 2;
  saveState(state);
}

function play(state) {
  state.lastPlayed = Date.now();
  state.xp += 3;
  saveState(state);
}

function addXp(state, amount, activity) {
  state.xp += amount;
  state.lastWorked = Date.now();
  if (activity) state.lastActivity = activity;
  saveState(state);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}

// Build a short "what is Claude doing" label from a hook payload
// (Claude Code pipes the hook event as JSON on stdin).
function summarizeActivity(payload) {
  if (payload.hook_event_name === 'Stop') return 'task done!';
  const tool = payload.tool_name;
  if (!tool) return '';
  const input = payload.tool_input || {};
  let detail =
    input.description ||
    (input.file_path && path.basename(input.file_path)) ||
    input.pattern ||
    input.command ||
    input.skill ||
    '';
  detail = String(detail).replace(/\s+/g, ' ').trim();
  return truncate(detail ? `${tool}: ${detail}` : tool, 48);
}

function readHookPayload() {
  if (process.stdin.isTTY) return null;
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Activity is "current" while Claude is plausibly still working on it.
function currentActivity(state, now = Date.now()) {
  if (state.lastActivity && now - state.lastWorked < 10 * 60 * 1000) return state.lastActivity;
  return '';
}

function statusCard(state) {
  const now = Date.now();
  const stage = stageOf(state);
  const next = nextStage(state);
  const frame = framesFor(state, now)[0];
  const ageDays = Math.floor((now - state.born) / (24 * HOUR));
  const lines = [
    '',
    ...frame.map((l) => '   ' + l),
    '',
    `   ${state.name}  (${stage.label}, Lv.${levelOf(state)})`,
    `   mood: ${moodOf(state, now)}   age: ${ageDays}d`,
    `   food ${bar(fullnessOf(state, now))} ${fullnessOf(state, now)}%`,
    `   xp   ${state.xp}` + (next ? `  (next stage at ${next.min})` : '  (fully grown)'),
    ...(currentActivity(state, now) ? [`   now  ${currentActivity(state, now)}`] : []),
    '',
  ];
  return lines.join('\n');
}

function statusLine(state) {
  const now = Date.now();
  const stage = stageOf(state).id;
  const mood = moodOf(state, now);
  let lead = miniIcon(state, mood);
  if (!lead) {
    lead = (FACES[stage] && FACES[stage][mood]) || FACES.default[mood] || FACES.default.content;
  }
  const tail = currentActivity(state, now) || mood;
  return `${lead} ${state.name} Lv.${levelOf(state)} ${bar(fullnessOf(state, now), 5)} | ${truncate(tail, 48)}`;
}

/* ------------------------------------------------------------ live view */

function live(state) {
  process.stdout.on('error', () => process.exit(0)); // e.g. piped into `head`
  let tick = 0;
  let toast = '';
  let toastUntil = 0;

  const render = () => {
    // pick up XP / activity written by Claude Code hooks while we run
    Object.assign(state, loadState());
    const now = Date.now();
    const frames = framesFor(state, now);
    const frame = frames[tick % frames.length];
    const activity = currentActivity(state, now);
    const out = [
      '',
      `   vibe-pet  --  ${state.name}  (${stageOf(state).label}, Lv.${levelOf(state)})`,
      '',
      ...frame.map((l) => '      ' + l),
      '',
      `   mood: ${moodOf(state, now)}${activity ? `   now: ${activity}` : ''}`,
      `   food ${bar(fullnessOf(state, now))} ${fullnessOf(state, now)}%   xp ${state.xp}`,
      '',
      `   ${now < toastUntil ? toast : '[f] feed   [p] play   [q] quit'}`,
      '',
    ];
    process.stdout.write('\x1b[2J\x1b[H' + out.join('\n') + '\n');
    tick++;
  };

  const timer = setInterval(render, 600);
  render();

  const quit = () => {
    clearInterval(timer);
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(`${state.name} waves goodbye. See you next session!\n`);
    process.exit(0);
  };

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      const k = key.toString();
      if (k === 'f') {
        feed(state);
        toast = `${state.name} munches happily! (+2 xp)`;
        toastUntil = Date.now() + 2500;
        render();
      } else if (k === 'p') {
        play(state);
        toast = `${state.name} is having a blast! (+3 xp)`;
        toastUntil = Date.now() + 2500;
        render();
      } else if (k === 'q' || k === '') {
        quit();
      }
    });
  }
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

/* ----------------------------------------------------------------- main */

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const state = loadState();

  switch (cmd) {
    case undefined:
    case 'live':
      live(state);
      break;
    case 'status':
      console.log(statusCard(state));
      break;
    case 'feed':
      feed(state);
      console.log(`${state.name} munches happily! (+2 xp)`);
      break;
    case 'play':
      play(state);
      console.log(`${state.name} is having a blast! (+3 xp)`);
      break;
    case 'name':
      if (!arg) {
        console.error('usage: pet.js name <new-name>');
        process.exit(1);
      }
      state.name = arg;
      saveState(state);
      console.log(`Your pet is now called ${state.name}.`);
      break;
    case 'xp': {
      const n = parseInt(arg, 10);
      if (!Number.isFinite(n) || n <= 0) {
        console.error('usage: pet.js xp <positive-number>');
        process.exit(1);
      }
      const before = stageOf(state).id;
      const payload = readHookPayload();
      addXp(state, n, payload ? summarizeActivity(payload) : '');
      if (stageOf(state).id !== before) {
        console.log(`${state.name} evolved to ${stageOf(state).label}!`);
      }
      break;
    }
    case 'statusline':
      // Claude Code pipes session JSON via stdin; the pet ignores it.
      console.log(statusLine(state));
      break;
    case 'reset':
      saveState(defaultState());
      console.log('A new egg appears...');
      break;
    default:
      console.error(`unknown command: ${cmd}`);
      console.error('commands: live | status | feed | play | name | xp | statusline | reset');
      process.exit(1);
  }
}

main();
