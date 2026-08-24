export const COLORS = ['Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Onyx'];
export const ALL_RESOURCES = [...COLORS, 'Gold'];

export const RESOURCE_META = {
  Ruby: { label: 'Ruby', symbol: '◆', className: 'ruby' },
  Sapphire: { label: 'Sapphire', symbol: '●', className: 'sapphire' },
  Emerald: { label: 'Emerald', symbol: '⬟', className: 'emerald' },
  Diamond: { label: 'Diamond', symbol: '✦', className: 'diamond' },
  Onyx: { label: 'Onyx', symbol: '■', className: 'onyx' },
  Gold: { label: 'Gold', symbol: '★', className: 'gold' },
};

export const CONFIG = Object.freeze({
  TOKEN_LIMIT: 10,
  TARGET_SCORE: 15,
  MIN_SUPPLY_FOR_DOUBLE: 4,
  MAX_RESERVED: 3,
  MARKET_SIZE: 4,
  TURN_TRANSITION_MS: 950,
  SAVE_VERSION: 1,
});

export const emptyResources = () => Object.fromEntries(ALL_RESOURCES.map((color) => [color, 0]));
export const emptyBonuses = () => Object.fromEntries(COLORS.map((color) => [color, 0]));

export const totalTokens = (tokens) => ALL_RESOURCES.reduce((sum, color) => sum + (tokens[color] || 0), 0);

export function calculatePayment(player, card) {
  const spend = emptyResources();
  const missing = emptyBonuses();
  let goldNeeded = 0;

  for (const color of COLORS) {
    const discountedCost = Math.max(0, (card.cost[color] || 0) - (player.bonuses[color] || 0));
    spend[color] = Math.min(player.tokens[color] || 0, discountedCost);
    missing[color] = discountedCost - spend[color];
    goldNeeded += missing[color];
  }

  spend.Gold = goldNeeded;
  return {
    canAfford: goldNeeded <= (player.tokens.Gold || 0),
    spend,
    missing,
    goldNeeded,
  };
}

export const canAffordCard = (player, card) => calculatePayment(player, card).canAfford;

export function canTakeDifferent(supply, colors) {
  const unique = [...new Set(colors)];
  return unique.length === colors.length
    && unique.length >= 1
    && unique.length <= 3
    && unique.every((color) => COLORS.includes(color) && supply[color] > 0);
}

export const canTakeDouble = (supply, color) => (
  COLORS.includes(color) && supply[color] >= CONFIG.MIN_SUPPLY_FOR_DOUBLE
);

export function eligiblePatrons(player, patrons) {
  return patrons.filter((patron) => Object.entries(patron.requirements)
    .every(([color, amount]) => (player.bonuses[color] || 0) >= amount));
}

export function rankPlayers(players) {
  const ranked = [...players].sort((a, b) => (
    b.score - a.score || a.purchased.length - b.purchased.length
  ));
  const best = ranked[0];
  const winners = ranked.filter((player) => (
    player.score === best.score && player.purchased.length === best.purchased.length
  ));
  return { ranked, winners };
}
