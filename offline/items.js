// CODE DUNGEON - items.js
// Modular item data. Add new items here to expand the game.

const ITEMS = [
  {
    id: "debug_wand",
    name: "Debug Wand",
    type: "tool",
    rarity: "common",
    description: "A cracked stick that once compiled. Adds +2 to Debug checks.",
    effect: { stat: "debug", value: 2, type: "passive" },
    icon: "🪄",
    flavor: "It still smells faintly of segfaults."
  },
  {
    id: "hp_potion",
    name: "Restore Packet",
    type: "consumable",
    rarity: "common",
    description: "Restores 20 HP. Tastes like compressed data.",
    effect: { stat: "hp", value: 20, type: "use" },
    icon: "💊",
    flavor: "One gulp and your stack trace clears."
  },
  {
    id: "mana_crystal",
    name: "Mana Crystal",
    type: "consumable",
    rarity: "uncommon",
    description: "Restores 15 Mana. Hums with algorithmic energy.",
    effect: { stat: "mana", value: 15, type: "use" },
    icon: "💎",
    flavor: "Crystallized recursion from the deep compiler layer."
  },
  {
    id: "logic_tome",
    name: "Logic Tome",
    type: "scroll",
    rarity: "uncommon",
    description: "Passively grants +3 Logic. Heavy with theorems.",
    effect: { stat: "logic", value: 3, type: "passive" },
    icon: "📖",
    flavor: "Chapter 1: 'If this, then that.' The rest is corrupted."
  },
  {
    id: "lucky_semicolon",
    name: "Lucky Semicolon",
    type: "trinket",
    rarity: "rare",
    description: "A semicolon that saved the build once. Grants +5 Luck.",
    effect: { stat: "luck", value: 5, type: "passive" },
    icon: ";",
    flavor: "The team never found out what it fixed."
  },
  {
    id: "null_shield",
    name: "Null Shield",
    type: "armor",
    rarity: "uncommon",
    description: "Blocks the next attack. Single use per room.",
    effect: { stat: "hp", value: 0, type: "block", uses: 1 },
    icon: "🛡",
    flavor: "Null is not an error. Null is a life choice."
  },
  {
    id: "refactor_scroll",
    name: "Refactor Scroll",
    type: "scroll",
    rarity: "rare",
    description: "Reroll the current puzzle or enemy type. One use.",
    effect: { type: "reroll", uses: 1 },
    icon: "📜",
    flavor: "Sometimes the best fix is starting over."
  },
  {
    id: "corruption_cleanser",
    name: "Corruption Cleanser",
    type: "consumable",
    rarity: "rare",
    description: "Reduces corruption by 25%. Use wisely.",
    effect: { stat: "corruption", value: -25, type: "use" },
    icon: "🧪",
    flavor: "Formulated in the lost sanitization labs of Floor 9."
  },
  {
    id: "stack_trace",
    name: "Stack Trace Fragment",
    type: "tool",
    rarity: "common",
    description: "Reveals enemy weakness in combat. One use.",
    effect: { type: "reveal_weakness", uses: 1 },
    icon: "🔍",
    flavor: "Error: at line 404. Function not found."
  },
  {
    id: "entropy_shard",
    name: "Entropy Shard",
    type: "weapon",
    rarity: "epic",
    description: "Deals 25 damage to any enemy. Pure chaos, weaponized.",
    effect: { stat: "enemy_hp", value: -25, type: "combat_use" },
    icon: "⚡",
    flavor: "The universe tends toward disorder. So do you."
  }
];

// Helper: get item by id
function getItem(id) {
  return ITEMS.find(i => i.id === id) || null;
}

// Helper: get random items by rarity weight
function getRandomLoot(count = 1, floorDepth = 1) {
  const pool = [];
  ITEMS.forEach(item => {
    const weight = item.rarity === "common" ? 5
      : item.rarity === "uncommon" ? 3
      : item.rarity === "rare" ? 2
      : 1; // epic
    for (let i = 0; i < weight; i++) pool.push(item.id);
  });
  const loot = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const id = pool[idx];
    if (!loot.includes(id)) loot.push(id);
  }
  return loot.map(getItem);
}
