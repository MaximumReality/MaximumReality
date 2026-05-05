// CODE DUNGEON - enemies.js
// Modular enemy data. Add new enemies here to expand the game.

const ENEMIES = [
  {
    id: "null_wraith",
    name: "Null Wraith",
    ascii: [
      "  ░▒▓ NULL ▓▒░  ",
      "   (  ∅  ∅  )   ",
      "    \\ ~~~~ /    ",
      "     |NULL|     ",
      "    /|    |\\   ",
    ],
    description: "A spectral entity made of undefined variables. It flickers in and out of existence.",
    hp: 30,
    maxHp: 30,
    attack: 8,
    weakness: "debug",
    behavior: "aggressive",
    lore: "Born where a developer forgot to initialize a variable. It has been searching for its value ever since.",
    attackMessages: [
      "The Null Wraith phases through your defenses for {dmg} damage!",
      "A cold undefined value washes over you. {dmg} damage.",
      "The Wraith whispers 'undefined is not a function' — {dmg} damage.",
    ],
    weaknessMultiplier: 1.8,
    xpReward: 25,
    goldReward: [5, 15]
  },
  {
    id: "segfault_serpent",
    name: "Segfault Serpent",
    ascii: [
      "  ~SEG~ FAULT~  ",
      "  >===========> ",
      " / SEGMENTATION \\",
      "|   VIOLATION   |",
      "  >===========> ",
    ],
    description: "A massive serpent that crashes everything it touches. Its scales are forbidden memory addresses.",
    hp: 45,
    maxHp: 45,
    attack: 12,
    weakness: "logic",
    behavior: "defensive",
    lore: "It slithers through protected memory regions, leaving core dumps in its wake.",
    attackMessages: [
      "The Serpent strikes a protected region! {dmg} damage + you drop 1 item.",
      "Core dumped! The Serpent's bite deals {dmg} damage.",
      "Segmentation fault — {dmg} damage and your UI glitches briefly.",
    ],
    weaknessMultiplier: 2.0,
    xpReward: 40,
    goldReward: [10, 25]
  },
  {
    id: "infinite_loop_mimic",
    name: "Infinite Loop Mimic",
    ascii: [
      " ┌─ WHILE TRUE ─┐",
      " │  while(true) │",
      " │   { mimic(); │",
      " │  } // never  │",
      " └──────────────┘",
    ],
    description: "It looks like a treasure chest. Then it looks like you. Then it loops forever.",
    hp: 25,
    maxHp: 25,
    attack: 6,
    weakness: "luck",
    behavior: "tricky",
    lore: "An entity trapped in its own logic. Every iteration it becomes slightly more confused about what it is.",
    attackMessages: [
      "The Mimic loops its attack pattern — {dmg} damage, twice!",
      "You fight yourself for a moment. {dmg} confusion damage.",
      "The Mimic mimics your last action — {dmg} damage.",
    ],
    specialAbility: "loop_double",
    weaknessMultiplier: 2.2,
    xpReward: 30,
    goldReward: [8, 20]
  },
  {
    id: "regex_horror",
    name: "Regex Horror",
    ascii: [
      " /^[HORROR]+$/gi ",
      "   (?>MATCH ME)  ",
      "  (?:OR|DIE).*?  ",
      " [^\\w]\\s{2,}\\d+ ",
      "  \\.exec(PAIN)  ",
    ],
    description: "A pattern that matches all of your weaknesses simultaneously. Looking at it too long causes madness.",
    hp: 55,
    maxHp: 55,
    attack: 15,
    weakness: "debug",
    behavior: "pattern",
    lore: "Someone wrote a regex to validate email addresses. This is what escaped from it.",
    attackMessages: [
      "The Horror finds your pattern. {dmg} damage + 10% corruption.",
      "Catastrophic backtracking! {dmg} damage.",
      "It matches your soul for {dmg} existential damage.",
    ],
    weaknessMultiplier: 1.6,
    xpReward: 55,
    goldReward: [15, 30]
  },
  {
    id: "gc_golem",
    name: "Garbage Collector Golem",
    ascii: [
      "  [GC] RUNNING  ",
      " ██ COLLECTING ██",
      " ██  ████████  ██",
      " ██ ██GOLEM██  ██",
      " ████████████████",
    ],
    description: "A massive construct that wants to collect YOU. It believes you are unreachable memory.",
    hp: 70,
    maxHp: 70,
    attack: 18,
    weakness: "mana",
    behavior: "tank",
    lore: "The janitor of the dungeon. It has been running for 47 years and is very tired.",
    attackMessages: [
      "The Golem marks you as garbage — {dmg} damage.",
      "SWEEP PHASE: {dmg} crushing damage.",
      "You are swept from the heap for {dmg} damage.",
    ],
    weaknessMultiplier: 1.5,
    xpReward: 70,
    goldReward: [20, 40]
  }
];

// BOSS enemies
const BOSSES = [
  {
    id: "the_compiler",
    name: "THE COMPILER",
    ascii: [
      "╔══════════════════╗",
      "║  T H E           ║",
      "║  C O M P I L E R ║",
      "║  [ERROR: 999]    ║",
      "╚══════════════════╝",
    ],
    description: "The dungeon's architect. It speaks only in error messages and has never once said 'good job.'",
    hp: 150,
    maxHp: 150,
    attack: 25,
    weakness: "logic",
    behavior: "boss",
    phases: [
      { threshold: 1.0, name: "Parsing Phase" },
      { threshold: 0.66, name: "Optimization Phase" },
      { threshold: 0.33, name: "Linking Phase — FINAL FORM" }
    ],
    lore: "It built this dungeon to test developers for eternity. No one has ever satisfied its requirements.",
    attackMessages: [
      "ERROR {dmg}: Unexpected token <PAIN>.",
      "WARNING: {dmg} damage — implicit conversion from developer to victim.",
      "FATAL: {dmg} unhandled exception in your soul.",
    ],
    weaknessMultiplier: 2.5,
    xpReward: 250,
    goldReward: [50, 100]
  }
];

function getEnemy(id) {
  return ENEMIES.find(e => e.id === id) || BOSSES.find(b => b.id === id) || null;
}

function getRandomEnemy(floorDepth = 1) {
  // Higher floors = harder enemies
  let pool = ENEMIES.slice(0, Math.min(ENEMIES.length, 2 + floorDepth));
  return JSON.parse(JSON.stringify(pool[Math.floor(Math.random() * pool.length)]));
}

function getBoss(id = "the_compiler") {
  return JSON.parse(JSON.stringify(BOSSES.find(b => b.id === id) || BOSSES[0]));
}
