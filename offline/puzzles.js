// CODE DUNGEON - puzzles.js
// Modular puzzle data. All puzzles solvable offline.
// Types: logic, pattern, code_fill, debug_output, riddle

const PUZZLES = [
  // ─── LOGIC PUZZLES ────────────────────────────────────────────
  {
    id: "logic_001",
    type: "logic",
    title: "The Boolean Gate",
    description: "Three switches control a locked door. Only ONE combination opens it.",
    challenge: "If A is TRUE and B is FALSE, what must C be for (A AND NOT B) OR C to be TRUE?",
    hint: "The first part already evaluates. What does OR need?",
    answers: ["true", "True", "TRUE", "either", "anything", "doesn't matter"],
    correctAnswer: "true",
    explanation: "(A AND NOT B) = (TRUE AND TRUE) = TRUE. TRUE OR anything = TRUE. So C can be anything, but TRUE is the canonical answer.",
    xpReward: 30,
    successMsg: "The gate clicks open. Logic prevails.",
    failMsg: "Wrong gate combination. The door shocks you."
  },
  {
    id: "logic_002",
    type: "logic",
    title: "The Ternary Trap",
    description: "A trapped floor tile activates based on a ternary expression.",
    challenge: "What does this evaluate to?\n  x = 5\n  result = x > 3 ? 'SAFE' : 'DANGER'\n\nType: SAFE or DANGER",
    hint: "Is 5 greater than 3?",
    answers: ["safe", "SAFE", "Safe"],
    correctAnswer: "SAFE",
    explanation: "5 > 3 is true, so the ternary returns 'SAFE'. You step across safely.",
    xpReward: 20,
    successMsg: "You step across the safe tile. Ternary wisdom.",
    failMsg: "DANGER was correct... wait. The trap fires anyway."
  },
  {
    id: "logic_003",
    type: "logic",
    title: "The AND/OR Labyrinth",
    description: "Four paths, four conditions. Only one path is open.",
    challenge: "Which path is open?\n  PATH A: (false OR false)\n  PATH B: (true AND false)\n  PATH C: (false OR true)\n  PATH D: (true AND NOT true)\n\nType: A, B, C, or D",
    hint: "Evaluate each: OR needs at least one true. AND needs both true.",
    answers: ["c", "C", "path c", "PATH C"],
    correctAnswer: "C",
    explanation: "A=false, B=false, C=true, D=false. Path C is the only open route.",
    xpReward: 35,
    successMsg: "Path C was open. You stride through confidently.",
    failMsg: "Wrong path. The walls close briefly, dealing damage."
  },

  // ─── PATTERN PUZZLES ──────────────────────────────────────────
  {
    id: "pattern_001",
    type: "pattern",
    title: "The Fibonacci Vault",
    description: "The vault opens when you continue the ancient sequence.",
    challenge: "Complete the sequence:\n  1, 1, 2, 3, 5, 8, 13, 21, ???\n\nWhat is the next number?",
    hint: "Each number is the sum of the two before it.",
    answers: ["34"],
    correctAnswer: "34",
    explanation: "21 + 13 = 34. The Fibonacci sequence. The vault rumbles open.",
    xpReward: 25,
    successMsg: "34. The vault opens with a satisfying click.",
    failMsg: "Incorrect. The vault hisses and seals tighter."
  },
  {
    id: "pattern_002",
    type: "pattern",
    title: "Binary Cipher Lock",
    description: "A rusted lock displays binary numbers. Decode it to proceed.",
    challenge: "Convert this binary number to decimal:\n  01001010\n\nWhat is the decimal value?",
    hint: "Position values: 128, 64, 32, 16, 8, 4, 2, 1. Add those that have a 1.",
    answers: ["74"],
    correctAnswer: "74",
    explanation: "0+64+0+0+8+0+2+0 = 74. The lock beeps and unlatches.",
    xpReward: 30,
    successMsg: "74. Click. The binary lock submits.",
    failMsg: "Access denied. The lock shocks your fingers."
  },
  {
    id: "pattern_003",
    type: "pattern",
    title: "The Hex Inscription",
    description: "Ancient dungeon runes written in hexadecimal. Translate to enter.",
    challenge: "What decimal number does 0xFF represent?\n\n(Hint: F = 15 in hex)",
    hint: "FF in hex = (15 × 16) + (15 × 1)",
    answers: ["255"],
    correctAnswer: "255",
    explanation: "0xFF = 255. Maximum byte value. The rune glows and fades.",
    xpReward: 30,
    successMsg: "255. The inscription glows and the door dissolves.",
    failMsg: "Wrong value. The inscription burns your eyes for damage."
  },

  // ─── CODE FILL PUZZLES ────────────────────────────────────────
  {
    id: "code_001",
    type: "code_fill",
    title: "The Missing Return",
    description: "A function-shaped golem blocks the path. It's broken. Fix it.",
    challenge: "What single keyword fills the blank?\n\n  function add(a, b) {\n    _____ a + b;\n  }\n\nType the missing keyword:",
    hint: "The function needs to send a value back.",
    answers: ["return", "RETURN", "Return"],
    correctAnswer: "return",
    explanation: "The 'return' keyword sends the value back to the caller. The golem steps aside.",
    xpReward: 20,
    successMsg: "return! The golem nods and dissolves into syntax dust.",
    failMsg: "The golem shakes its head. undefined is not a step forward."
  },
  {
    id: "code_002",
    type: "code_fill",
    title: "The Array Anomaly",
    description: "A locked panel requires you to know your array indexing.",
    challenge: "What does this output?\n\n  arr = ['A', 'B', 'C', 'D']\n  console.log(arr[2])\n\nType the output:",
    hint: "Arrays are zero-indexed. First element is at position 0.",
    answers: ["c", "C"],
    correctAnswer: "C",
    explanation: "arr[0]='A', arr[1]='B', arr[2]='C'. Zero-indexing saves the day.",
    xpReward: 20,
    successMsg: "C! The panel slides open. Zero-indexing is muscle memory now.",
    failMsg: "Wrong. The panel rejects your input. Off by one, as always."
  },
  {
    id: "code_003",
    type: "code_fill",
    title: "The Loop Seal",
    description: "A seal is encoded in a loop. Find the output to break it.",
    challenge: "What is the FINAL value of x?\n\n  x = 0\n  for i in range(5):\n      x += i\n\nType the number:",
    hint: "range(5) = 0, 1, 2, 3, 4. Add them all.",
    answers: ["10"],
    correctAnswer: "10",
    explanation: "0+1+2+3+4 = 10. The seal cracks and falls from the door.",
    xpReward: 25,
    successMsg: "10. The loop seal shatters. You feel the iterations in your bones.",
    failMsg: "Miscounted. The seal pulses and drains your mana."
  },

  // ─── DEBUG OUTPUT ─────────────────────────────────────────────
  {
    id: "debug_001",
    type: "debug_output",
    title: "The Corrupted Console",
    description: "A corrupted terminal shows code. What SHOULD it print?",
    challenge: "The bug is obvious once you see it.\n\n  x = 10\n  y = 0\n  if x > y:\n    print('GREATER')\n  else:\n    print('LESSER')\n\nWhat prints? (GREATER or LESSER)",
    hint: "Is 10 greater than 0?",
    answers: ["greater", "GREATER", "Greater"],
    correctAnswer: "GREATER",
    explanation: "10 > 0 is true. GREATER is printed. Simple, but corruption makes you doubt yourself.",
    xpReward: 20,
    successMsg: "GREATER. You trust your instincts. The terminal stabilizes.",
    failMsg: "LESSER was wrong. The corruption spreads."
  },
  {
    id: "debug_002",
    type: "debug_output",
    title: "The Scope Specter",
    description: "A ghost made of undefined variables haunts this room. Find the value.",
    challenge: "What is the final value of 'result'?\n\n  function mystery(n) {\n    if (n <= 1) return 1;\n    return n * mystery(n - 1);\n  }\n  result = mystery(4)\n\nType the number:",
    hint: "This is a recursive factorial. 4! = ?",
    answers: ["24"],
    correctAnswer: "24",
    explanation: "mystery(4) = 4 × 3 × 2 × 1 = 24. The Scope Specter dissipates.",
    xpReward: 35,
    successMsg: "24. Factorial recursion banishes the specter in a puff of call stack.",
    failMsg: "Incorrect. The specter laughs and drains your HP."
  },

  // ─── RIDDLES ──────────────────────────────────────────────────
  {
    id: "riddle_001",
    type: "riddle",
    title: "The Sphinx of Stack Overflow",
    description: "An ancient sphinx blocks the staircase. It speaks in riddles.",
    challenge: "I have no body but I hold your place.\nI grow until I overflow.\nI am called when you call, dismissed when you return.\nWhat am I?",
    hint: "I live in memory. I track your function calls.",
    answers: ["stack", "the stack", "call stack", "stack frame"],
    correctAnswer: "stack",
    explanation: "The Call Stack. The sphinx nods and crumbles into dust.",
    xpReward: 40,
    successMsg: "Stack. The sphinx bows and steps aside. 'Correct, wanderer.'",
    failMsg: "The sphinx roars. You take damage from its breath of deprecation."
  },
  {
    id: "riddle_002",
    type: "riddle",
    title: "The Null Oracle",
    description: "A blinking cursor in the darkness asks you a question.",
    challenge: "I am the absence of a value,\nbut I am not zero.\nI am not false.\nI am not empty.\nI am the void that was promised.\nWhat am I?",
    hint: "typeof me === 'object' — which has confused developers for decades.",
    answers: ["null", "Null", "NULL"],
    correctAnswer: "null",
    explanation: "null — the intentional absence of any object value. The oracle flickers and grants passage.",
    xpReward: 35,
    successMsg: "null. The oracle blinks once. 'You understand the void.'",
    failMsg: "Wrong. The oracle returns undefined and your HP drops."
  },
  {
    id: "riddle_003",
    type: "riddle",
    title: "The Recursion Monk",
    description: "A robed figure at the bottom of infinite stairs speaks slowly.",
    challenge: "To understand me,\nyou must first understand me.\nI am the solution that contains itself.\nI am the function that calls its own name.\nWhat am I?",
    hint: "The stairs behind you go down... and down... and down...",
    answers: ["recursion", "recursive", "a recursive function", "recursive function"],
    correctAnswer: "recursion",
    explanation: "Recursion. The monk smiles. 'To understand recursion, you must first understand recursion.'",
    xpReward: 40,
    successMsg: "Recursion! The monk laughs and the stairs collapse into a base case.",
    failMsg: "The monk sighs. The stairs extend deeper."
  }
];

function getPuzzle(id) {
  return PUZZLES.find(p => p.id === id) || null;
}

function getRandomPuzzle(exclude = []) {
  const available = PUZZLES.filter(p => !exclude.includes(p.id));
  if (available.length === 0) return PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
  return available[Math.floor(Math.random() * available.length)];
}

function getPuzzlesByType(type) {
  return PUZZLES.filter(p => p.type === type);
}

function checkAnswer(puzzle, input) {
  const clean = input.trim().toLowerCase();
  return puzzle.answers.some(a => a.toLowerCase() === clean);
}
