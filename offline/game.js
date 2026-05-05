// CODE DUNGEON - game.js
// Main game engine. Pure vanilla JS, no dependencies.

// ══════════════════════════════════════════════════════════
// GAME STATE
// ══════════════════════════════════════════════════════════

const GameState = {
  phase: "title", // title | game | combat | puzzle | loot | dead | victory
  player: null,
  dungeon: null,
  currentFloor: 0,
  currentRoomIndex: 0,
  currentRoom: null,
  currentEnemy: null,
  currentPuzzle: null,
  combatLog: [],
  gameLog: [],
  usedPuzzles: [],
  seed: 0,
  turn: 0,
  combatTurn: "player", // player | enemy
};

// ══════════════════════════════════════════════════════════
// PLAYER
// ══════════════════════════════════════════════════════════

function createPlayer(name = "VOID_WALKER") {
  return {
    name,
    level: 1,
    xp: 0,
    xpThreshold: 100,
    hp: 80,
    maxHp: 80,
    mana: 40,
    maxMana: 40,
    logic: 5,
    debug: 5,
    luck: 5,
    corruption: 0,
    maxCorruption: 100,
    gold: 10,
    inventory: [],
    abilities: ["Refactor", "Trace", "Sanitize", "Rollback"],
    abilityCooldowns: {},
    statusEffects: [],
    roomsCleared: 0,
    enemiesDefeated: 0,
    puzzlesSolved: 0,
  };
}

function levelUp(player) {
  player.level++;
  player.xpThreshold = player.level * 100;
  player.maxHp += 15;
  player.hp = Math.min(player.hp + 20, player.maxHp);
  player.maxMana += 8;
  player.mana = Math.min(player.mana + 10, player.maxMana);
  player.logic += 1;
  player.debug += 1;
  player.luck += 1;
  addLog(`⬆️ LEVEL UP! You are now Level ${player.level}. Stats increased.`, "system");
}

function gainXP(amount) {
  const p = GameState.player;
  p.xp += amount;
  addLog(`+${amount} XP`, "xp");
  while (p.xp >= p.xpThreshold) {
    p.xp -= p.xpThreshold;
    levelUp(p);
  }
  updatePlayerUI();
}

function addCorruption(amount) {
  const p = GameState.player;
  p.corruption = Math.min(p.maxCorruption, p.corruption + amount);
  if (p.corruption >= p.maxCorruption) {
    triggerCorruptionCollapse();
    return;
  }
  updateCorruptionUI();
  if (p.corruption >= 75) triggerCorruptionEffect("severe");
  else if (p.corruption >= 50) triggerCorruptionEffect("moderate");
  else if (p.corruption >= 25) triggerCorruptionEffect("mild");
}

function reduceCorruption(amount) {
  const p = GameState.player;
  p.corruption = Math.max(0, p.corruption - amount);
  updateCorruptionUI();
}

function damagePlayer(amount, source = "") {
  const p = GameState.player;
  // Check for null shield
  const shieldIdx = p.inventory.findIndex(i => i.id === "null_shield" && i.effect.uses > 0);
  if (shieldIdx !== -1) {
    p.inventory[shieldIdx].effect.uses--;
    addLog(`🛡️ Null Shield absorbed the blow!`, "success");
    return;
  }
  p.hp = Math.max(0, p.hp - amount);
  updatePlayerUI();
  flashDamage();
  if (p.hp <= 0) triggerDeath();
}

function healPlayer(amount) {
  const p = GameState.player;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  updatePlayerUI();
}

// ══════════════════════════════════════════════════════════
// INVENTORY & ITEMS
// ══════════════════════════════════════════════════════════

function addItemToInventory(item) {
  if (GameState.player.inventory.length >= 10) {
    addLog("⚠️ Inventory full! Drop an item first.", "warning");
    return false;
  }
  const itemCopy = JSON.parse(JSON.stringify(item));
  GameState.player.inventory.push(itemCopy);
  addLog(`📦 Acquired: ${item.icon || ""} ${item.name}`, "loot");
  updateInventoryUI();
  return true;
}

function useItem(index) {
  const p = GameState.player;
  const item = p.inventory[index];
  if (!item) return;

  const eff = item.effect;
  if (eff.type === "use" || eff.type === "combat_use") {
    if (eff.stat === "hp") healPlayer(eff.value);
    else if (eff.stat === "mana") { p.mana = Math.min(p.maxMana, p.mana + eff.value); }
    else if (eff.stat === "corruption") { reduceCorruption(Math.abs(eff.value)); }
    else if (eff.stat === "enemy_hp" && GameState.currentEnemy) {
      GameState.currentEnemy.hp = Math.max(0, GameState.currentEnemy.hp + eff.value);
      addLog(`⚡ ${item.name} deals ${Math.abs(eff.value)} damage to ${GameState.currentEnemy.name}!`, "combat");
      if (GameState.currentEnemy.hp <= 0) resolveEnemyDefeated();
    }

    addLog(`💊 Used: ${item.name}`, "action");
    p.inventory.splice(index, 1);
    updateInventoryUI();
    updatePlayerUI();

    // If in combat, using item ends player turn
    if (GameState.phase === "combat") {
      setTimeout(() => enemyTurn(), 800);
    }
  } else if (eff.type === "reroll") {
    if (GameState.phase === "puzzle") {
      p.inventory.splice(index, 1);
      addLog(`📜 Refactor Scroll used — rerolling puzzle!`, "system");
      loadNewPuzzle();
      updateInventoryUI();
    } else {
      addLog("Can only use Refactor Scroll during a puzzle.", "warning");
    }
  } else {
    addLog(`${item.name} is a passive item (${eff.stat} +${eff.value}).`, "info");
  }
}

function getPassiveBonus(stat) {
  const p = GameState.player;
  let bonus = 0;
  p.inventory.forEach(item => {
    if (item.effect.type === "passive" && item.effect.stat === stat) {
      bonus += item.effect.value;
    }
  });
  return bonus;
}

// ══════════════════════════════════════════════════════════
// DUNGEON NAVIGATION
// ══════════════════════════════════════════════════════════

function startGame(playerName = "VOID_WALKER") {
  GameState.seed = Math.floor(Math.random() * 999999);
  GameState.player = createPlayer(playerName);
  GameState.dungeon = generateDungeonMap(GameState.seed, 3, 5);
  GameState.currentFloor = 0;
  GameState.currentRoomIndex = 0;
  GameState.usedPuzzles = [];
  GameState.phase = "game";
  GameState.gameLog = [];
  GameState.turn = 0;

  addLog(`>> DUNGEON INITIALIZED. SEED: ${GameState.seed}`, "system");
  addLog(`>> ENTERING FLOOR 1 OF 3...`, "system");
  addLog(`>> GOOD LUCK, ${playerName.toUpperCase()}. YOU WILL NEED IT.`, "system");

  enterRoom();
}

function enterRoom() {
  const room = GameState.dungeon[GameState.currentFloor][GameState.currentRoomIndex];
  GameState.currentRoom = room;
  GameState.turn++;

  // Passive drains
  if (room.passiveDrain) {
    const p = GameState.player;
    if (room.passiveDrain.stat === "hp") damagePlayer(room.passiveDrain.amount);
    else if (room.passiveDrain.stat === "mana") {
      p.mana = Math.max(0, p.mana - room.passiveDrain.amount);
      updatePlayerUI();
    }
    addLog(room.passiveDrain.message, "warning");
  }

  addLog(`━━━ ENTERING: ${room.title} ━━━`, "room");

  renderRoom(room);
  updateMapUI();
}

function advanceRoom() {
  const maxRooms = GameState.dungeon[GameState.currentFloor].length;
  GameState.currentRoomIndex++;

  if (GameState.currentRoomIndex >= maxRooms) {
    // Advance floor
    GameState.currentFloor++;
    GameState.currentRoomIndex = 0;

    if (GameState.currentFloor >= GameState.dungeon.length) {
      triggerVictory();
      return;
    }
    addLog(`━━━ DESCENDING TO FLOOR ${GameState.currentFloor + 1} ━━━`, "system");
    addLog("The air grows heavier. The code grows stranger.", "flavor");
  }

  GameState.player.roomsCleared++;
  GameState.phase = "game";
  enterRoom();
}

// ══════════════════════════════════════════════════════════
// ROOM RENDERING
// ══════════════════════════════════════════════════════════

function renderRoom(room) {
  const roomDisplay = document.getElementById("room-display");
  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  if (!roomDisplay) return;

  // ASCII art
  const asciiEl = document.getElementById("room-ascii");
  if (asciiEl) {
    asciiEl.textContent = room.ascii.join("\n");
  }

  // Title
  const titleEl = document.getElementById("room-title");
  if (titleEl) titleEl.textContent = room.title;

  // Description
  const descEl = document.getElementById("room-description");
  if (descEl) {
    descEl.textContent = room.description;
    if (room.atmosphere) {
      const atmEl = document.createElement("p");
      atmEl.className = "atmosphere";
      atmEl.textContent = room.atmosphere;
      descEl.appendChild(atmEl);
    }
  }

  // Route to appropriate handler
  if (room.challengeType === "combat" || room.challengeType === "boss_combat") {
    setupCombat(room);
  } else if (room.challengeType === "puzzle" || room.challengeType === "riddle") {
    setupPuzzle(room);
  } else if (room.challengeType === "trap_navigate") {
    setupTrap(room);
  } else if (room.type === ROOM_TYPES.TREASURE) {
    setupTreasure(room);
  } else {
    // Void corridor / no challenge
    setupVoidRoom(room);
  }

  // Fourth wall
  if (room.fourthWall) {
    setTimeout(() => addLog(`[SYSTEM]: ${room.fourthWall}`, "glitch"), 1500);
  }
}

// ══════════════════════════════════════════════════════════
// COMBAT SYSTEM
// ══════════════════════════════════════════════════════════

function setupCombat(room) {
  let enemy;
  if (room.challengeType === "boss_combat") {
    enemy = getBoss(room.enemyId);
  } else {
    enemy = getEnemy(room.enemyId) || getRandomEnemy(GameState.currentFloor);
  }

  GameState.currentEnemy = enemy;
  GameState.combatTurn = "player";
  GameState.phase = "combat";

  addLog(`⚔️ ${enemy.name} appears!`, "combat");
  addLog(enemy.lore, "flavor");

  renderCombat(enemy);
}

function renderCombat(enemy) {
  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  // Enemy display
  const enemyAscii = enemy.ascii.join("\n");
  const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);

  challengeArea.innerHTML = `
    <div class="combat-display">
      <div class="enemy-info">
        <pre class="enemy-ascii">${enemyAscii}</pre>
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-hp-bar">
          <div class="hp-label">HP: ${enemy.hp}/${enemy.maxHp}</div>
          <div class="hp-bar-outer">
            <div class="hp-bar-inner enemy-hp-fill" style="width:${hpPercent}%"></div>
          </div>
        </div>
        <div class="enemy-weakness">WEAKNESS: ${enemy.weakness.toUpperCase()}</div>
      </div>
    </div>
  `;

  actionButtons.innerHTML = `
    <div class="combat-actions">
      <button onclick="combatAttack('basic')" class="btn btn-attack">⚔️ ATTACK</button>
      <button onclick="combatAbility('Refactor')" class="btn btn-ability">🔧 REFACTOR</button>
      <button onclick="combatAbility('Trace')" class="btn btn-ability">🔍 TRACE</button>
      <button onclick="combatAbility('Sanitize')" class="btn btn-ability">🧹 SANITIZE</button>
      <button onclick="combatAbility('Rollback')" class="btn btn-ability">↩️ ROLLBACK</button>
    </div>
    <div class="combat-hint">Use abilities that match enemy weakness for bonus damage.</div>
  `;
}

function combatAttack(type) {
  if (GameState.combatTurn !== "player" || GameState.phase !== "combat") return;
  const enemy = GameState.currentEnemy;
  const p = GameState.player;

  let damage = 10 + Math.floor(p.debug / 2) + getPassiveBonus("debug");
  damage += Math.floor(Math.random() * 6); // 0-5 random

  // Lucky strike chance
  const luckBonus = p.luck + getPassiveBonus("luck");
  if (Math.random() * 100 < luckBonus) {
    damage = Math.floor(damage * 1.5);
    addLog("💫 CRITICAL HIT!", "success");
  }

  enemy.hp = Math.max(0, enemy.hp - damage);
  addLog(`⚔️ You attack ${enemy.name} for ${damage} damage! (${enemy.hp}/${enemy.maxHp} HP)`, "combat");

  renderCombat(enemy);

  if (enemy.hp <= 0) {
    resolveEnemyDefeated();
    return;
  }

  GameState.combatTurn = "enemy";
  setTimeout(() => enemyTurn(), 900);
}

function combatAbility(abilityName) {
  if (GameState.combatTurn !== "player" || GameState.phase !== "combat") return;
  const enemy = GameState.currentEnemy;
  const p = GameState.player;
  const cooldownKey = abilityName;

  if (GameState.abilityCooldowns && GameState.abilityCooldowns[cooldownKey] > 0) {
    addLog(`⏳ ${abilityName} is on cooldown for ${GameState.abilityCooldowns[cooldownKey]} more turns.`, "warning");
    return;
  }

  let damage = 0;
  let effect = "";

  switch (abilityName) {
    case "Refactor":
      // High damage, costs mana
      if (p.mana < 10) { addLog("Not enough Mana for Refactor!", "warning"); return; }
      damage = 18 + p.logic + getPassiveBonus("logic");
      p.mana -= 10;
      effect = "🔧 Refactored the enemy's attack pattern!";
      if (!GameState.abilityCooldowns) GameState.abilityCooldowns = {};
      GameState.abilityCooldowns["Refactor"] = 3;
      break;

    case "Trace":
      // Reveal weakness + small damage
      if (p.mana < 5) { addLog("Not enough Mana for Trace!", "warning"); return; }
      damage = 8;
      p.mana -= 5;
      effect = `🔍 TRACE: ${enemy.name} weakness is ${enemy.weakness.toUpperCase()}. Weakness multiplier: ${enemy.weaknessMultiplier}x`;
      if (!GameState.abilityCooldowns) GameState.abilityCooldowns = {};
      GameState.abilityCooldowns["Trace"] = 2;
      break;

    case "Sanitize":
      // Reduce corruption + small heal
      damage = 5;
      reduceCorruption(15);
      healPlayer(10);
      effect = "🧹 Sanitized! Corruption -15, HP +10.";
      if (!GameState.abilityCooldowns) GameState.abilityCooldowns = {};
      GameState.abilityCooldowns["Sanitize"] = 4;
      break;

    case "Rollback":
      // Heal self, reset enemy attack counter
      if (p.mana < 15) { addLog("Not enough Mana for Rollback!", "warning"); return; }
      healPlayer(25);
      p.mana -= 15;
      effect = "↩️ Rolled back! HP +25.";
      damage = 0;
      if (!GameState.abilityCooldowns) GameState.abilityCooldowns = {};
      GameState.abilityCooldowns["Rollback"] = 5;
      break;
  }

  // Apply weakness multiplier
  if (damage > 0 && enemy.weakness === abilityToStat(abilityName)) {
    damage = Math.floor(damage * enemy.weaknessMultiplier);
    addLog(`💥 WEAKNESS EXPLOIT! ${abilityName} is super effective!`, "success");
  }

  if (damage > 0) {
    enemy.hp = Math.max(0, enemy.hp - damage);
    addLog(`${effect}`, "ability");
    addLog(`Dealt ${damage} damage. (${enemy.hp}/${enemy.maxHp} HP)`, "combat");
  } else {
    addLog(effect, "ability");
  }

  updatePlayerUI();
  renderCombat(enemy);

  if (enemy.hp <= 0) { resolveEnemyDefeated(); return; }

  GameState.combatTurn = "enemy";
  setTimeout(() => enemyTurn(), 900);
}

function abilityToStat(ability) {
  const map = { "Refactor": "logic", "Trace": "debug", "Sanitize": "mana", "Rollback": "luck" };
  return map[ability] || "";
}

function enemyTurn() {
  if (GameState.phase !== "combat") return;
  const enemy = GameState.currentEnemy;
  const p = GameState.player;

  // Tick cooldowns
  if (GameState.abilityCooldowns) {
    Object.keys(GameState.abilityCooldowns).forEach(k => {
      if (GameState.abilityCooldowns[k] > 0) GameState.abilityCooldowns[k]--;
    });
  }

  let damage = enemy.attack + Math.floor(Math.random() * 5);

  // Behavior modifiers
  if (enemy.behavior === "defensive" && enemy.hp < enemy.maxHp * 0.5) damage = Math.floor(damage * 1.3);
  if (enemy.behavior === "tricky") {
    // Mimic can double-attack
    if (Math.random() < 0.3) {
      addLog(`🔄 ${enemy.name} attacks TWICE this turn!`, "combat");
      damagePlayer(Math.floor(damage * 0.6));
    }
  }

  const msgTemplate = enemy.attackMessages[Math.floor(Math.random() * enemy.attackMessages.length)];
  const msg = msgTemplate.replace("{dmg}", damage);
  addLog(`👹 ${msg}`, "enemy");

  // Special: Segfault drops item
  if (enemy.id === "segfault_serpent" && Math.random() < 0.3 && p.inventory.length > 0) {
    const dropped = p.inventory.splice(Math.floor(Math.random() * p.inventory.length), 1)[0];
    addLog(`💀 ${dropped.name} was corrupted and lost!`, "warning");
    updateInventoryUI();
  }

  damagePlayer(damage);
  addCorruption(3);

  GameState.combatTurn = "player";
}

function resolveEnemyDefeated() {
  const enemy = GameState.currentEnemy;
  const p = GameState.player;

  GameState.phase = "loot";
  p.enemiesDefeated++;

  addLog(`✅ ${enemy.name} DEFEATED!`, "success");

  const xp = enemy.xpReward;
  const goldRange = enemy.goldReward;
  const gold = goldRange[0] + Math.floor(Math.random() * (goldRange[1] - goldRange[0]));
  p.gold += gold;

  gainXP(xp);
  addLog(`💰 Looted ${gold} gold.`, "loot");

  // Chance for item drop
  if (Math.random() < 0.4) {
    const loot = getRandomLoot(1, GameState.currentFloor);
    if (loot[0]) addItemToInventory(loot[0]);
  }

  const actionButtons = document.getElementById("action-buttons");
  if (actionButtons) {
    actionButtons.innerHTML = `<button onclick="advanceRoom()" class="btn btn-continue">>> CONTINUE DEEPER</button>`;
  }

  updatePlayerUI();
}

// ══════════════════════════════════════════════════════════
// PUZZLE SYSTEM
// ══════════════════════════════════════════════════════════

function setupPuzzle(room) {
  GameState.phase = "puzzle";

  const puzzle = selectPuzzleForRoom(room);
  GameState.currentPuzzle = puzzle;

  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  if (!challengeArea) return;

  challengeArea.innerHTML = `
    <div class="puzzle-display">
      <div class="puzzle-type-badge">[${puzzle.type.replace("_", " ").toUpperCase()}]</div>
      <div class="puzzle-title">${puzzle.title}</div>
      <p class="puzzle-desc">${puzzle.description}</p>
      <pre class="puzzle-challenge">${puzzle.challenge}</pre>
      <div class="puzzle-input-area">
        <input type="text" id="puzzle-input" class="puzzle-input" placeholder="Type your answer..." autocomplete="off" autocorrect="off" />
      </div>
    </div>
  `;

  actionButtons.innerHTML = `
    <div class="puzzle-actions">
      <button onclick="submitPuzzleAnswer()" class="btn btn-submit">✓ SUBMIT</button>
      <button onclick="getPuzzleHint()" class="btn btn-hint">? HINT (costs 5 Mana)</button>
    </div>
  `;

  // Enter key submits
  const inputEl = document.getElementById("puzzle-input");
  if (inputEl) {
    inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter") submitPuzzleAnswer();
    });
    inputEl.focus();
  }
}

function selectPuzzleForRoom(room) {
  const pool = room.puzzlePool || null;
  if (pool) {
    const available = pool.filter(id => !GameState.usedPuzzles.includes(id));
    if (available.length > 0) {
      const id = available[Math.floor(Math.random() * available.length)];
      return getPuzzle(id) || getRandomPuzzle(GameState.usedPuzzles);
    }
  }
  return getRandomPuzzle(GameState.usedPuzzles);
}

function loadNewPuzzle() {
  setupPuzzle(GameState.currentRoom);
}

function getPuzzleHint() {
  const p = GameState.player;
  const puzzle = GameState.currentPuzzle;
  if (!puzzle) return;

  if (p.mana < 5) {
    addLog("Not enough Mana for a hint!", "warning");
    return;
  }

  p.mana -= 5;
  updatePlayerUI();
  addLog(`💡 HINT: ${puzzle.hint}`, "hint");
}

function submitPuzzleAnswer() {
  const inputEl = document.getElementById("puzzle-input");
  if (!inputEl) return;
  const answer = inputEl.value.trim();
  if (!answer) { addLog("Type an answer first!", "warning"); return; }

  const puzzle = GameState.currentPuzzle;
  if (!puzzle) return;

  GameState.usedPuzzles.push(puzzle.id);
  GameState.player.puzzlesSolved++;

  if (checkAnswer(puzzle, answer)) {
    puzzleSuccess(puzzle);
  } else {
    puzzleFailure(puzzle);
  }
}

function puzzleSuccess(puzzle) {
  const room = GameState.currentRoom;
  addLog(`✅ CORRECT! ${puzzle.successMsg}`, "success");
  addLog(puzzle.explanation, "flavor");

  gainXP(puzzle.xpReward + (room.xpBase || 0));

  // Chance for loot
  if (Math.random() < 0.35) {
    const loot = getRandomLoot(1, GameState.currentFloor);
    if (loot[0]) addItemToInventory(loot[0]);
  }

  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  if (challengeArea) {
    challengeArea.innerHTML = `<div class="success-banner">✓ PUZZLE SOLVED</div>`;
  }
  if (actionButtons) {
    actionButtons.innerHTML = `<button onclick="advanceRoom()" class="btn btn-continue">>> CONTINUE DEEPER</button>`;
  }

  GameState.phase = "game";
}

function puzzleFailure(puzzle) {
  const room = GameState.currentRoom;
  addLog(`❌ WRONG. ${puzzle.failMsg}`, "fail");

  const penalty = room.penaltyHp || 10;
  const corrPenalty = room.penaltyCorruption || 10;

  damagePlayer(penalty);
  addCorruption(corrPenalty);
  addLog(`Penalty: -${penalty} HP, +${corrPenalty} Corruption.`, "warning");

  // Allow retry
  const inputEl = document.getElementById("puzzle-input");
  if (inputEl) { inputEl.value = ""; inputEl.focus(); }
}

// ══════════════════════════════════════════════════════════
// TRAP SYSTEM
// ══════════════════════════════════════════════════════════

function setupTrap(room) {
  GameState.phase = "trap";
  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  challengeArea.innerHTML = `
    <div class="trap-display">
      <pre class="trap-ascii">
 [0][1][2][3][4]
 [5][6][7][8][9]
  ← 10 tiles. One is wrong.
      </pre>
      <p class="trap-desc">Navigate the Off-By-One trap. Choose carefully or take damage.</p>
    </div>
  `;

  actionButtons.innerHTML = `
    <div class="trap-actions">
      <button onclick="attemptTrap('careful')" class="btn btn-action">👣 STEP CAREFULLY (60% safe)</button>
      <button onclick="attemptTrap('dash')" class="btn btn-action">💨 DASH THROUGH (40% safe, bonus XP)</button>
      <button onclick="attemptTrap('analyze')" class="btn btn-action">🔍 ANALYZE TILES (costs 8 Mana)</button>
    </div>
  `;
}

function attemptTrap(method) {
  const room = GameState.currentRoom;
  const p = GameState.player;
  let successChance = 0.6;
  let bonusXP = 0;
  let message = "";

  if (method === "careful") {
    successChance = 0.65;
    message = "You step carefully through the tiles...";
  } else if (method === "dash") {
    successChance = 0.4;
    bonusXP = 15;
    message = "You dash through the tiles at full speed!";
  } else if (method === "analyze") {
    if (p.mana < 8) { addLog("Not enough Mana to analyze!", "warning"); return; }
    p.mana -= 8;
    updatePlayerUI();
    successChance = 0.9;
    message = "You analyze each tile methodically...";
  }

  addLog(message, "action");

  const luckBonus = (p.luck + getPassiveBonus("luck")) * 0.005;
  const totalSuccess = Math.min(0.95, successChance + luckBonus);

  if (Math.random() < totalSuccess) {
    addLog("✅ You made it through safely!", "success");
    gainXP((room.xpBase || 20) + bonusXP);
  } else {
    addLog("❌ Off by one! A spike catches you.", "fail");
    damagePlayer(room.trapDamage || 15);
    addCorruption(room.penaltyCorruption || 10);
  }

  const actionButtons = document.getElementById("action-buttons");
  if (actionButtons) {
    actionButtons.innerHTML = `<button onclick="advanceRoom()" class="btn btn-continue">>> CONTINUE DEEPER</button>`;
  }
}

// ══════════════════════════════════════════════════════════
// TREASURE ROOM
// ══════════════════════════════════════════════════════════

function setupTreasure(room) {
  GameState.phase = "loot";
  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  const lootCount = room.lootCount || 1;
  const loot = getRandomLoot(lootCount, GameState.currentFloor);

  let lootHTML = loot.map(item => `
    <div class="loot-item">
      <span class="loot-icon">${item.icon || "📦"}</span>
      <span class="loot-name">${item.name}</span>
      <span class="loot-rarity rarity-${item.rarity}">[${item.rarity.toUpperCase()}]</span>
      <span class="loot-desc">${item.description}</span>
    </div>
  `).join("");

  const gold = 5 + Math.floor(Math.random() * 15) * (GameState.currentFloor + 1);
  GameState.player.gold += gold;

  challengeArea.innerHTML = `
    <div class="treasure-display">
      <div class="treasure-header">⭐ CACHE CONTENTS ⭐</div>
      ${lootHTML}
      <div class="gold-found">💰 ${gold} gold coins</div>
    </div>
  `;

  actionButtons.innerHTML = `
    <div class="loot-actions">
      ${loot.map((item, i) => `<button onclick="takeTreasureItem(${i}, '${JSON.stringify(loot).replace(/'/g, "\\'")}')" class="btn btn-loot">TAKE ${item.name.toUpperCase()}</button>`).join("")}
      <button onclick="advanceRoom()" class="btn btn-continue">>> LEAVE CACHE</button>
    </div>
  `;

  gainXP(room.xpBase || 10);
  addLog(`💎 Treasure Cache found! ${gold} gold acquired.`, "loot");

  // Auto-add loot to UI
  loot.forEach(item => addItemToInventory(item));
}

function setupVoidRoom(room) {
  GameState.phase = "game";
  const challengeArea = document.getElementById("challenge-area");
  const actionButtons = document.getElementById("action-buttons");

  challengeArea.innerHTML = `
    <div class="void-display">
      <p>${room.description}</p>
      ${room.flavor ? `<p class="flavor-text">"${room.flavor}"</p>` : ""}
    </div>
  `;

  actionButtons.innerHTML = `
    <button onclick="advanceRoom()" class="btn btn-continue">>> PROCEED</button>
  `;

  gainXP(room.xpBase || 5);
  addLog("You pass through the corridor. Something watches.", "flavor");
}

// ══════════════════════════════════════════════════════════
// CORRUPTION SYSTEM
// ══════════════════════════════════════════════════════════

const CORRUPTION_EFFECTS = [
  "Your inventory items flicker...",
  "The dungeon walls breathe.",
  "You see your own code.",
  "A comment reads: // this was a mistake",
  "ERROR: Unexpected behavior in floor " + (Math.floor(Math.random() * 9) + 1),
  "SYSTEM: You are not the intended user.",
  "The corruption whispers variable names.",
];

function triggerCorruptionEffect(severity) {
  const el = document.getElementById("corruption-bar");
  if (el) {
    el.classList.add(`corruption-${severity}`);
    setTimeout(() => el.classList.remove(`corruption-${severity}`), 2000);
  }

  const body = document.body;
  if (severity === "severe") {
    body.classList.add("glitch-severe");
    setTimeout(() => body.classList.remove("glitch-severe"), 800);
    const msg = CORRUPTION_EFFECTS[Math.floor(Math.random() * CORRUPTION_EFFECTS.length)];
    addLog(`⚠️ [CORRUPTION]: ${msg}`, "glitch");
  } else if (severity === "moderate") {
    body.classList.add("glitch-moderate");
    setTimeout(() => body.classList.remove("glitch-moderate"), 400);
  }
}

function triggerCorruptionCollapse() {
  addLog("████ CORRUPTION: 100% ████", "glitch");
  addLog("████ DUNGEON COLLAPSING ████", "glitch");
  setTimeout(() => triggerDeath(true), 1500);
}

// ══════════════════════════════════════════════════════════
// WIN / LOSE
// ══════════════════════════════════════════════════════════

function triggerDeath(corruption = false) {
  GameState.phase = "dead";
  const msg = corruption
    ? "THE DUNGEON CONSUMED YOU. CORRUPTION: TERMINAL."
    : "RUNTIME ERROR: FATAL EXCEPTION IN PLAYER.SOUL";

  showEndScreen(msg, false);
}

function triggerVictory() {
  GameState.phase = "victory";
  showEndScreen("BUILD SUCCESSFUL. YOU ESCAPED THE DUNGEON.", true);
}

function showEndScreen(message, victory) {
  const main = document.getElementById("game-main");
  if (!main) return;

  const p = GameState.player;
  const bgColor = victory ? "#001a00" : "#1a0000";

  main.innerHTML = `
    <div class="end-screen" style="background:${bgColor}">
      <pre class="end-ascii">${victory ? WIN_ASCII : DEATH_ASCII}</pre>
      <div class="end-message ${victory ? "victory-text" : "death-text"}">${message}</div>
      <div class="end-stats">
        <div>PLAYER: ${p.name}</div>
        <div>LEVEL: ${p.level}</div>
        <div>ROOMS CLEARED: ${p.roomsCleared}</div>
        <div>ENEMIES DEFEATED: ${p.enemiesDefeated}</div>
        <div>PUZZLES SOLVED: ${p.puzzlesSolved}</div>
        <div>SEED: ${GameState.seed}</div>
      </div>
      <button onclick="location.reload()" class="btn btn-restart">▶ NEW GAME</button>
    </div>
  `;
}

const DEATH_ASCII = `
  ██████╗ ███████╗ █████╗ ██████╗ 
  ██╔══██╗██╔════╝██╔══██╗██╔══██╗
  ██║  ██║█████╗  ███████║██║  ██║
  ██║  ██║██╔══╝  ██╔══██║██║  ██║
  ██████╔╝███████╗██║  ██║██████╔╝
  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ 
`;

const WIN_ASCII = `
  ██████╗ ██╗   ██╗██╗██╗     ██████╗ 
  ██╔══██╗██║   ██║██║██║     ██╔══██╗
  ██████╔╝██║   ██║██║██║     ██║  ██║
  ██╔══██╗██║   ██║██║██║     ██║  ██║
  ██████╔╝╚██████╔╝██║███████╗██████╔╝
  ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝ 
  ██████╗  ██████╗ ███╗   ██╗███████╗
  ██╔══██╗██╔═══██╗████╗  ██║██╔════╝
  ██║  ██║██║   ██║██╔██╗ ██║█████╗  
  ██║  ██║██║   ██║██║╚██╗██║██╔══╝  
  ██████╔╝╚██████╔╝██║ ╚████║███████╗
  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚══════╝
`;

// ══════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════

function addLog(message, type = "info") {
  GameState.gameLog.push({ message, type, turn: GameState.turn });
  renderLog();
}

function renderLog() {
  const logEl = document.getElementById("log-console");
  if (!logEl) return;

  const recent = GameState.gameLog.slice(-30);
  logEl.innerHTML = recent.map(entry => {
    return `<div class="log-entry log-${entry.type}">&gt; ${entry.message}</div>`;
  }).join("");

  logEl.scrollTop = logEl.scrollHeight;
}

function updatePlayerUI() {
  const p = GameState.player;
  if (!p) return;

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl("stat-hp", `${p.hp}/${p.maxHp}`);
  setEl("stat-mana", `${p.mana}/${p.maxMana}`);
  setEl("stat-logic", p.logic + getPassiveBonus("logic"));
  setEl("stat-debug", p.debug + getPassiveBonus("debug"));
  setEl("stat-luck", p.luck + getPassiveBonus("luck"));
  setEl("stat-level", p.level);
  setEl("stat-xp", `${p.xp}/${p.xpThreshold}`);
  setEl("stat-gold", p.gold);
  setEl("player-name-display", p.name);

  // HP bar
  const hpBar = document.getElementById("player-hp-bar");
  if (hpBar) {
    const pct = (p.hp / p.maxHp) * 100;
    hpBar.style.width = pct + "%";
    hpBar.style.background = pct > 60 ? "#00ff88" : pct > 30 ? "#ffaa00" : "#ff3333";
  }

  // Mana bar
  const manaBar = document.getElementById("player-mana-bar");
  if (manaBar) manaBar.style.width = ((p.mana / p.maxMana) * 100) + "%";

  updateCorruptionUI();
}

function updateCorruptionUI() {
  const p = GameState.player;
  if (!p) return;
  const pct = (p.corruption / p.maxCorruption) * 100;

  const bar = document.getElementById("corruption-fill");
  if (bar) {
    bar.style.width = pct + "%";
    bar.style.background = pct < 33 ? "#00ff88" : pct < 66 ? "#ffaa00" : "#ff3333";
  }
  const label = document.getElementById("corruption-label");
  if (label) label.textContent = `${Math.floor(pct)}%`;
}

function updateInventoryUI() {
  const p = GameState.player;
  const invEl = document.getElementById("inventory-list");
  if (!invEl || !p) return;

  if (p.inventory.length === 0) {
    invEl.innerHTML = `<div class="empty-inv">-- EMPTY --</div>`;
    return;
  }

  invEl.innerHTML = p.inventory.map((item, i) => `
    <div class="inv-item" onclick="useItem(${i})" title="${item.flavor || item.description}">
      <span class="inv-icon">${item.icon || "📦"}</span>
      <span class="inv-name">${item.name}</span>
      <span class="inv-rarity rarity-${item.rarity}">${item.rarity[0].toUpperCase()}</span>
    </div>
  `).join("");
}

function updateMapUI() {
  const mapEl = document.getElementById("dungeon-map");
  if (!mapEl) return;

  let mapHTML = "";
  for (let f = 0; f < GameState.dungeon.length; f++) {
    mapHTML += `<div class="map-floor">F${f + 1}: `;
    GameState.dungeon[f].forEach((room, r) => {
      const isCurrent = f === GameState.currentFloor && r === GameState.currentRoomIndex;
      const isPast = f < GameState.currentFloor || (f === GameState.currentFloor && r < GameState.currentRoomIndex);
      const symbol = getRoomSymbol(room.type);
      const cls = isCurrent ? "map-room current" : isPast ? "map-room cleared" : "map-room";
      mapHTML += `<span class="${cls}" title="${room.title}">${symbol}</span>`;
    });
    mapHTML += "</div>";
  }

  mapEl.innerHTML = mapHTML;
}

function getRoomSymbol(type) {
  const symbols = {
    BUG_PIT: "🐛",
    LOGIC_LOCK: "🔒",
    SYNTAX_BEAST: "👹",
    MEMORY_LEAK: "💧",
    TREASURE: "⭐",
    BOSS: "💀",
    VOID_CORRIDOR: "▒",
    TRAP: "⚠️",
  };
  return symbols[type] || "?";
}

function flashDamage() {
  document.body.classList.add("flash-damage");
  setTimeout(() => document.body.classList.remove("flash-damage"), 300);
}

// ══════════════════════════════════════════════════════════
// TITLE SCREEN INIT
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const nameInput = document.getElementById("player-name-input");
      const name = nameInput ? (nameInput.value.trim() || "VOID_WALKER") : "VOID_WALKER";
      document.getElementById("title-screen").style.display = "none";
      document.getElementById("game-screen").style.display = "flex";
      startGame(name.toUpperCase().substring(0, 16));
    });
  }

  // Enter key on name field
  const nameInput = document.getElementById("player-name-input");
  if (nameInput) {
    nameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("start-btn").click();
    });
  }

  // Type effect on title
  typeTitleEffect();
});

function typeTitleEffect() {
  const tagline = document.getElementById("title-tagline");
  if (!tagline) return;
  const messages = [
    "Every room is a bug. Every bug is a boss.",
    "The dungeon remembers your mistakes.",
    "Debug or die.",
    "return dungeon.descend();",
  ];
  let i = 0;
  let charIdx = 0;
  let forward = true;

  setInterval(() => {
    const msg = messages[i % messages.length];
    if (forward) {
      charIdx++;
      if (charIdx > msg.length) { forward = false; setTimeout(() => {}, 1000); }
    } else {
      charIdx--;
      if (charIdx <= 0) { forward = true; i++; }
    }
    tagline.textContent = msg.substring(0, charIdx) + (forward ? "█" : "");
  }, 60);
}
