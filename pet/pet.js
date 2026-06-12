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

// Two frames per pose; ASCII only so it renders in plain cmd.exe too.
const ART = {
  egg: {
    idle: [
      ['   .-"-.   ', '  /     \\  ', '  | o o |  ', '  \\     /  ', "   '-.-'   "],
      ['   .-"-.   ', '  /     \\  ', '  | . . |  ', '  \\     /  ', "   '-.-'   "],
    ],
  },
  baby: {
    idle: [
      ['   .---.   ', '  ( o.o )  ', "   `---'   "],
      ['   .---.   ', '  ( -.- )  ', "   `---'   "],
    ],
    happy: [
      ['   .---.   ', '  ( ^.^ )  ', "   `---'   "],
      ['   .---.   ', '  ( ^o^ )  ', "   `---'   "],
    ],
    hungry: [
      ['   .---.   ', '  ( ;.; )  ', "   `---'   "],
      ['   .---.   ', '  ( ;o; )  ', "   `---'   "],
    ],
    sleepy: [
      ['   .---.   ', '  ( -.- )z ', "   `---'   "],
      ['   .---.  Z', '  ( -.- )  ', "   `---'   "],
    ],
    working: [
      ['   .---.   ', '  ( o.o )_ ', "   `---'   "],
      ['   .---. _ ', '  ( o.o )  ', "   `---'   "],
    ],
  },
  kid: {
    idle: [
      ['   /\\_/\\   ', '  ( o.o )  ', '   (___)   '],
      ['   /\\_/\\   ', '  ( -.- )  ', '   (___)   '],
    ],
    happy: [
      ['   /\\_/\\   ', '  ( ^.^ )  ', '   (___)~  '],
      ['   /\\_/\\   ', '  ( ^o^ )  ', '  ~(___)   '],
    ],
    hungry: [
      ['   /\\_/\\   ', '  ( ;.; )  ', '   (___)   '],
      ['   /\\_/\\   ', '  ( ;o; )  ', '   (___)   '],
    ],
    sleepy: [
      ['   /\\_/\\   ', '  ( -.- )z ', '   (___)   '],
      ['   /\\_/\\  Z', '  ( -.- )  ', '   (___)   '],
    ],
    working: [
      ['   /\\_/\\   ', '  ( o.o )_ ', '   (___)   '],
      ['   /\\_/\\ _ ', '  ( o.o )  ', '   (___)   '],
    ],
  },
  adult: {
    idle: [
      ['   /\\_/\\   ', '  ( o.o )  ', '   > ^ <   '],
      ['   /\\_/\\   ', '  ( -.- )  ', '   > ^ <   '],
    ],
    happy: [
      ['   /\\_/\\   ', '  ( ^.^ )  ', '   > w <~  '],
      ['   /\\_/\\   ', '  ( ^o^ )  ', '  ~> w <   '],
    ],
    hungry: [
      ['   /\\_/\\   ', '  ( ;.; )  ', '   > ^ <   '],
      ['   /\\_/\\   ', '  ( ;o; )  ', '   > ^ <   '],
    ],
    sleepy: [
      ['   /\\_/\\   ', '  ( -.- )z ', '   > ^ <   '],
      ['   /\\_/\\  Z', '  ( -.- )  ', '   > ^ <   '],
    ],
    working: [
      ['   /\\_/\\   ', '  ( o.o )_ ', '   > ^ <   '],
      ['   /\\_/\\ _ ', '  ( o.o )  ', '   > ^ <   '],
    ],
  },
};

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
  const set = ART[stage];
  return set[mood] || set.idle;
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

function addXp(state, amount) {
  state.xp += amount;
  state.lastWorked = Date.now();
  saveState(state);
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
    '',
  ];
  return lines.join('\n');
}

function statusLine(state) {
  const now = Date.now();
  const stage = stageOf(state).id;
  const mood = moodOf(state, now);
  const face = (FACES[stage] && FACES[stage][mood]) || FACES.default[mood] || FACES.default.content;
  return `${face} ${state.name} Lv.${levelOf(state)} ${bar(fullnessOf(state, now), 5)}`;
}

/* ------------------------------------------------------------ live view */

function live(state) {
  process.stdout.on('error', () => process.exit(0)); // e.g. piped into `head`
  let tick = 0;
  let toast = '';
  let toastUntil = 0;

  const render = () => {
    const now = Date.now();
    const frames = framesFor(state, now);
    const frame = frames[tick % frames.length];
    const out = [
      '',
      `   vibe-pet  --  ${state.name}  (${stageOf(state).label}, Lv.${levelOf(state)})`,
      '',
      ...frame.map((l) => '      ' + l),
      '',
      `   mood: ${moodOf(state, now)}`,
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
      addXp(state, n);
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
