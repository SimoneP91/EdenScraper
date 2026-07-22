/**
 * Traduzione dei codici bonus (eProperty, standard DAoC) in nomi leggibili.
 * Derivata dalla tabella del frontend Eden (items.js) — vale sia per gli item
 * Eden sia per i Bonus*Type di itemtemplate del DB (stessa numerazione).
 */
export const PROP = {
  // stats
  1: 'Strength', 2: 'Dexterity', 3: 'Constitution', 4: 'Quickness',
  5: 'Intelligence', 6: 'Piety', 7: 'Empathy', 8: 'Charisma',
  9: 'Power', 10: 'Hits', 156: 'Acuity', 196: 'Power Pool',
  // resistenze (suffisso Resist)
  11: 'Body Resist', 12: 'Cold Resist', 13: 'Crush Resist', 14: 'Energy Resist',
  15: 'Heat Resist', 16: 'Matter Resist', 17: 'Slash Resist', 18: 'Spirit Resist',
  19: 'Thrust Resist', 116: 'Essence Resist',
  // cap bonus
  201: 'Strength cap', 202: 'Dexterity cap', 203: 'Constitution cap', 204: 'Quickness cap',
  209: 'Acuity cap', 210: 'Max Health cap', 211: 'Power Pool cap',
  // magic skills (Alb/Hib/Mid/common)
  21: 'Body Magic', 22: 'Chants', 26: 'Death Servant', 27: 'Deathsight', 29: 'Earth Magic',
  30: 'Enhancement', 32: 'Fire Magic', 34: 'Cold Magic', 37: 'Matter Magic', 38: 'Mind Magic',
  39: 'Pain Working', 42: 'Rejuvenation', 45: 'Smiting', 46: 'Soul Rending', 47: 'Spirit Magic',
  51: 'Wind Magic', 65: 'Light', 66: 'Void', 67: 'Mana', 70: 'Enchantments', 76: 'Mentalism',
  77: 'Regrowth', 78: 'Nurture', 79: 'Nature', 80: 'Music', 84: 'Valor', 87: 'Verdant',
  88: 'Creeping', 89: 'Arboreal', 96: 'Nightshade', 97: 'Pathfinding', 99: 'Dementia',
  101: 'Vampiiric Embrace', 102: 'Ethereal Shriek', 103: 'Phantasmal Wail', 104: 'Spectral Force',
  114: 'Spectral Guard', 57: 'Mending', 58: 'Augmentation', 60: 'Darkness', 61: 'Suppression',
  62: 'Runecarving', 63: 'Stormcalling', 64: 'Beastcraft', 69: 'Battlesongs', 85: 'Subterranean',
  86: 'Bone Army', 94: 'Pacification', 95: 'Savagery', 98: 'Summoning', 100: 'Shadow Mastery',
  105: "Odin's Will", 106: 'Cursing', 107: 'Hexing', 108: 'Witchcraft',
  31: 'Envenom', 35: 'Instruments', 49: 'Stealth', 163: 'All Magic Skills',
  // melee skills
  20: 'Two Handed', 24: 'Crossbow', 25: 'Crushing', 28: 'Dual Wield', 33: 'Flexible',
  36: 'Long Bow', 41: 'Polearm', 44: 'Slashing', 48: 'Staff', 50: 'Thrusting',
  68: 'Composite', 72: 'Blade', 73: 'Blunt', 74: 'Piercing', 75: 'Large Weapon',
  81: 'Celtic Dual', 82: 'Celtic Spear', 83: 'Recurved Bow', 90: 'Scythe',
  52: 'Sword', 53: 'Hammer', 54: 'Axe', 55: 'Left Axe', 56: 'Spear', 91: 'Thrown Weapon',
  92: 'Hand to Hand', 93: 'Short Bow', 23: 'Critical Strike', 40: 'Parry', 43: 'Shield',
  164: 'All Melee Skills', 167: 'All Dual Wield', 168: 'All Archery',
  // ToA
  148: 'Armor Factor', 153: 'Spell Range', 155: 'Melee Speed', 173: 'Melee Damage',
  174: 'Ranged Damage', 190: 'Buff Effectiveness', 191: 'Casting Speed', 193: 'Debuff Effect.',
  195: 'Healing Effect.', 197: 'Resist Pierce', 198: 'Spell Damage', 199: 'Spell Duration',
  200: 'Style Damage', 254: 'Arcane Syphon',
};

export function propName(code) {
  return PROP[code] ?? `prop#${code}`;
}

export const REALM = { 0: 'Tutti i reami', 1: 'Albion', 2: 'Midgard', 3: 'Hibernia' };

// Tipi armatura (object_type) e alcuni tipi arma comuni
export const OBJECT_TYPE = {
  0: 'Generico', 1: 'Generic Weapon', 2: 'Crushing', 3: 'Slashing', 4: 'Thrusting',
  5: 'Fired', 6: 'Two Handed', 7: 'Polearm', 8: 'Staff', 9: 'Longbow', 10: 'Crossbow',
  11: 'Sword', 12: 'Hammer', 13: 'Axe', 14: 'Spear', 15: 'Composite Bow', 16: 'Thrown',
  17: 'Left Axe', 18: 'Recurve Bow', 19: 'Blades', 20: 'Blunt', 21: 'Piercing',
  22: 'Large Weapon', 23: 'Celtic Spear', 24: 'Flexible', 25: 'Hand to Hand', 26: 'Scythe',
  27: 'Fire', 28: 'Ice', 29: 'Lightning', 30: 'Air', 31: 'Earth', 32: 'Cloth', 33: 'Leather',
  34: 'Studded', 35: 'Chain', 36: 'Plate', 37: 'Reinforced', 38: 'Scale', 41: 'Shield',
  42: 'Magical', 43: 'Bolt', 44: 'Instrument',
};

export function objectTypeName(code) {
  return OBJECT_TYPE[code] ?? `type#${code}`;
}
