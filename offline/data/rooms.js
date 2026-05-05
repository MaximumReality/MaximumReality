// CODE DUNGEON - rooms.js
// Room templates and generation logic.

const ROOM_TYPES = {
  BUG_PIT: "BUG_PIT",
  LOGIC_LOCK: "LOGIC_LOCK",
  SYNTAX_BEAST: "SYNTAX_BEAST",
  MEMORY_LEAK: "MEMORY_LEAK",
  TREASURE: "TREASURE",
  BOSS: "BOSS",
  VOID_CORRIDOR: "VOID_CORRIDOR",
  TRAP: "TRAP"
};

const ROOM_TEMPLATES = [
  // ─── BUG PIT ────────────────────────────────────────────────────
  {
    id: "bugpit_001",
    type: ROOM_TYPES.BUG_PIT,
    title: "The Bug Pit",
    ascii: [
      "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓",
      "▓  ≈≈ BUG PIT ≈≈  ▓",
      "▓  bugs crawl out  ▓",
      "▓  of broken code  ▓",
      "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓",
    ],
    description: "The floor squelches underfoot. Actual bugs — digital centipedes made of malformed bytecode — skitter across the walls. A broken function pulses at the center of the room, leaking corrupted data.",
    atmosphere: "The smell of stale coffee and unhandled exceptions hangs in the air.",
    challengeType: "puzzle",
    puzzlePool: ["code_001", "code_002", "code_003", "debug_001"],
    rewardType: "xp_item",
    xpBase: 25,
    penaltyHp: 15,
    penaltyCorruption: 10
  },
  {
    id: "bugpit_002",
    type: ROOM_TYPES.BUG_PIT,
    title: "Deprecated Hell",
    ascii: [
      "╔══════════════════╗",
      "║ ⚠ DEPRECATED ⚠  ║",
      "║  this function   ║",
      "║  will be removed ║",
      "╚══════════════════╝",
    ],
    description: "Warning messages line every wall. This room was supposed to be deleted in version 3.0. It was not. A giant pile of deprecated code writhes in the corner, still executing, still hurting.",
    atmosphere: "Everything here feels obsolete. Including, briefly, you.",
    challengeType: "puzzle",
    puzzlePool: ["debug_001", "debug_002", "code_001"],
    rewardType: "xp_item",
    xpBase: 30,
    penaltyHp: 12,
    penaltyCorruption: 15
  },

  // ─── LOGIC LOCK ─────────────────────────────────────────────────
  {
    id: "logiclock_001",
    type: ROOM_TYPES.LOGIC_LOCK,
    title: "Logic Lock Chamber",
    ascii: [
      "┌─────────────────┐",
      "│ [?] LOGIC LOCK  │",
      "│ TRUE  AND  FALSE│",
      "│  === ? === ?    │",
      "└─────────────────┘",
    ],
    description: "A room of floating boolean gates. They pulse red and green alternately. A massive door at the far end won't budge until you resolve the logical deadlock.",
    atmosphere: "Binary decisions hang in the air like fog.",
    challengeType: "puzzle",
    puzzlePool: ["logic_001", "logic_002", "logic_003"],
    rewardType: "xp_item",
    xpBase: 35,
    penaltyHp: 10,
    penaltyCorruption: 15
  },
  {
    id: "logiclock_002",
    type: ROOM_TYPES.LOGIC_LOCK,
    title: "The Pattern Vault",
    ascii: [
      "▐███████████████▌",
      "▐ 0 1 1 0 1 0 ?  ▌",
      "▐ PATTERN VAULT  ▌",
      "▐  :: SOLVE ::   ▌",
      "▐███████████████▌",
    ],
    description: "The vault hums with mathematical precision. Number sequences and binary patterns float in holographic display. One wrong guess and the sequence resets — with you inside.",
    atmosphere: "You feel the math judging you.",
    challengeType: "puzzle",
    puzzlePool: ["pattern_001", "pattern_002", "pattern_003"],
    rewardType: "xp_item",
    xpBase: 40,
    penaltyHp: 8,
    penaltyCorruption: 12
  },

  // ─── SYNTAX BEAST ───────────────────────────────────────────────
  {
    id: "syntaxbeast_001",
    type: ROOM_TYPES.SYNTAX_BEAST,
    title: "Null Wraith Ambush",
    ascii: [
      "░░░░░░░░░░░░░░░░░░",
      "░  NULL  WRAITH  ░",
      "░   rises from   ░",
      "░  the void...   ░",
      "░░░░░░░░░░░░░░░░░░",
    ],
    description: "The walls fade to grey. A shape that isn't quite there materializes from the undefined space between variables. It has no form. No type. No value. It only has hunger.",
    atmosphere: "The temperature drops to absolute null.",
    challengeType: "combat",
    enemyId: "null_wraith",
    rewardType: "xp_item",
    xpBase: 25,
    penaltyHp: 0 // combat handles HP
  },
  {
    id: "syntaxbeast_002",
    type: ROOM_TYPES.SYNTAX_BEAST,
    title: "Segfault Serpent Den",
    ascii: [
      "~~~~~~~~~~~~~~~~~~~~~",
      "~ SEGMENTATION FAULT~",
      "~ Core Dump: Active ~",
      "~ Memory: VIOLATED  ~",
      "~~~~~~~~~~~~~~~~~~~~~",
    ],
    description: "Scales of forbidden memory addresses. Eyes like core dumps. The Segfault Serpent uncoils from a heap of crashed processes, its tail rattling with stack traces.",
    atmosphere: "Protected memory screams as the Serpent passes.",
    challengeType: "combat",
    enemyId: "segfault_serpent",
    rewardType: "xp_item",
    xpBase: 40
  },
  {
    id: "syntaxbeast_003",
    type: ROOM_TYPES.SYNTAX_BEAST,
    title: "Infinite Loop Encounter",
    ascii: [
      "┌ while(true) { ──┐",
      "│   fight();      │",
      "│   fight();      │",
      "│   fight();      │",
      "└───────────────> ┘",
    ],
    description: "A chest. Except it blinks at you. Then it has your face. Then it blinks again. The Infinite Loop Mimic is caught between iterations and cannot decide what it wants to be.",
    atmosphere: "Deja vu. Deja vu. Deja vu.",
    challengeType: "combat",
    enemyId: "infinite_loop_mimic",
    rewardType: "xp_item",
    xpBase: 30
  },

  // ─── MEMORY LEAK SWAMP ──────────────────────────────────────────
  {
    id: "memoryleak_001",
    type: ROOM_TYPES.MEMORY_LEAK,
    title: "Memory Leak Swamp",
    ascii: [
      "≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋",
      "≋  HEAP OVERFLOW   ≋",
      "≋  memory drains   ≋",
      "≋  your stats...   ≋",
      "≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋",
    ],
    description: "A murky swamp of allocated but never freed memory. Every step costs something. Objects float past — bloated, referenced by nothing, consuming everything. The humidity is made of wasted RAM.",
    atmosphere: "You feel your own stats being consumed as you wade through.",
    challengeType: "riddle",
    puzzlePool: ["riddle_001", "riddle_002", "riddle_003"],
    passiveDrain: { stat: "mana", amount: 5, message: "The swamp drains 5 Mana as you enter." },
    rewardType: "stat_boost",
    xpBase: 20,
    penaltyHp: 10,
    penaltyCorruption: 20
  },
  {
    id: "memoryleak_002",
    type: ROOM_TYPES.MEMORY_LEAK,
    title: "The Recursion Depths",
    ascii: [
      "  f(n) calls f(n-1)",
      "  f(n-1) calls f(n-2)",
      "  f(n-2) calls f(n-3)",
      "  f(n-3) calls f(n-4)",
      "  [STACK OVERFLOW]",
    ],
    description: "Infinite stairs. A robed figure at the bottom says something about understanding recursion. The stairs go down as fast as you descend them. Something in this room loops, and it is eating your resources.",
    atmosphere: "To understand this room, you must first enter this room.",
    challengeType: "riddle",
    puzzlePool: ["riddle_003", "riddle_001"],
    passiveDrain: { stat: "hp", amount: 8, message: "Each recursive step costs 8 HP. Move quickly." },
    rewardType: "xp_item",
    xpBase: 45,
    penaltyHp: 20,
    penaltyCorruption: 15
  },

  // ─── TREASURE ───────────────────────────────────────────────────
  {
    id: "treasure_001",
    type: ROOM_TYPES.TREASURE,
    title: "Treasure Cache",
    ascii: [
      "★★★★★★★★★★★★★★★★★★",
      "★  TREASURE CACHE  ★",
      "★  loot acquired   ★",
      "★  no strings      ★",
      "★★★★★★★★★★★★★★★★★★",
    ],
    description: "A room that actually smells nice. Amber light. The faint sound of a successful build. Chests overflow with useful tools and artifacts left by a developer who made it this far but no further.",
    atmosphere: "You feel briefly, inexplicably, okay.",
    challengeType: "none",
    rewardType: "treasure",
    lootCount: 2,
    xpBase: 15,
    fourthWall: "Huh. A treasure room. The dungeon feels guilty."
  },
  {
    id: "treasure_002",
    type: ROOM_TYPES.TREASURE,
    title: "The Cache Hit",
    ascii: [
      "╔═══════════════╗",
      "║  CACHE : HIT  ║",
      "║  Items found! ║",
      "║  [LUCKY YOU]  ║",
      "╚═══════════════╝",
    ],
    description: "The cache was warm. Everything you needed was here, pre-loaded, ready to go. Someone optimized this room specifically so you could find it. That someone is gone now, but they thought of you.",
    atmosphere: "Efficiency. Sweet, blessed efficiency.",
    challengeType: "none",
    rewardType: "treasure",
    lootCount: 3,
    xpBase: 10,
    fourthWall: "This room exists because the dungeon realized it was too hard."
  },

  // ─── TRAP ────────────────────────────────────────────────────────
  {
    id: "trap_001",
    type: ROOM_TYPES.TRAP,
    title: "The Off-By-One Chamber",
    ascii: [
      "╔══════════════════╗",
      "║  OFF BY ONE      ║",
      "║  for(i=1; i<=n)  ║",
      "║  ← or was it <n? ║",
      "╚══════════════════╝",
    ],
    description: "Spikes line the ceiling. Pressure plates line the floor. There are exactly 10 safe tiles, numbered 0 through 9. One of them is mislabeled. You will find out which one.",
    atmosphere: "99 problems and one of them is definitely an off-by-one error.",
    challengeType: "trap_navigate",
    trapDamage: 15,
    successChance: 0.6,
    rewardType: "xp",
    xpBase: 20,
    penaltyCorruption: 10
  },

  // ─── VOID CORRIDOR ──────────────────────────────────────────────
  {
    id: "void_001",
    type: ROOM_TYPES.VOID_CORRIDOR,
    title: "The Void Corridor",
    ascii: [
      "                  ",
      "    . . . . . .   ",
      "  /dev/null ahead ",
      "    . . . . . .   ",
      "                  ",
    ],
    description: "A corridor that leads somewhere. Or /dev/null. The walls are made of commented-out code. Ghosts of deleted features flicker past. A sign reads: 'This feature was removed in v2.0 for performance reasons.'",
    atmosphere: "An eerie calm. Like a codebase before the merge.",
    challengeType: "none",
    rewardType: "none",
    event: "random_whisper",
    xpBase: 5,
    flavor: "The Void Corridor remembers what was lost."
  }
];

// ─── BOSS ROOM ──────────────────────────────────────────────────────
const BOSS_ROOM = {
  id: "boss_001",
  type: ROOM_TYPES.BOSS,
  title: "THE COMPILER'S CHAMBER",
  ascii: [
    "╔════════════════════╗",
    "║  BOSS NODE REACHED ║",
    "║  THE COMPILER      ║",
    "║  AWAITS YOUR BUILD ║",
    "╚════════════════════╝",
  ],
  description: "The deepest room. The original error. A monolithic entity constructed of every build failure, every compile-time error, every rejected pull request. It has been waiting. It has been compiling you.",
  atmosphere: "The air smells like burning circuits and disappointment.",
  challengeType: "boss_combat",
  enemyId: "the_compiler",
  rewardType: "victory",
  xpBase: 250
};

// ─── GENERATION ──────────────────────────────────────────────────────

// Seeded pseudo-random number generator
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateDungeonMap(seed, floors = 3, roomsPerFloor = 5) {
  const rng = seededRandom(seed);
  const map = [];

  for (let floor = 0; floor < floors; floor++) {
    const floorRooms = [];
    const shuffled = [...ROOM_TEMPLATES].sort(() => rng() - 0.5);

    for (let r = 0; r < roomsPerFloor; r++) {
      if (r === roomsPerFloor - 1 && floor === floors - 1) {
        floorRooms.push({ ...BOSS_ROOM });
      } else {
        const template = shuffled[r % shuffled.length];
        floorRooms.push({ ...template });
      }
    }

    // Ensure at least 1 treasure per floor
    const hasTreasure = floorRooms.some(r => r.type === ROOM_TYPES.TREASURE);
    if (!hasTreasure && floor < floors - 1) {
      const idx = Math.floor(rng() * (roomsPerFloor - 1));
      const treasureTemplates = ROOM_TEMPLATES.filter(r => r.type === ROOM_TYPES.TREASURE);
      floorRooms[idx] = { ...treasureTemplates[Math.floor(rng() * treasureTemplates.length)] };
    }

    map.push(floorRooms);
  }

  return map;
}

function getRoomTemplate(id) {
  if (id === "boss_001") return BOSS_ROOM;
  return ROOM_TEMPLATES.find(r => r.id === id) || ROOM_TEMPLATES[0];
}
