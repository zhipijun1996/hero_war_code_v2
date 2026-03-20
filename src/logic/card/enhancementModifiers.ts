export function isEnhancementCardName(cardName?: string | null): boolean {
  if (!cardName) return false;

  return [
    '冲刺',
    '回复',
    '间谍',
    '替身',
    '远攻',
    '强击',
    '冲刺卷轴',
    '治疗药水',
    '远程战术'
  ].includes(cardName);
}

export function getMoveBonusFromEnhancement(cardName?: string | null): number {
  if (!cardName) return 0;

  if (cardName === '冲刺' || cardName === '冲刺卷轴') {
    return 1;
  }

  return 0;
}

export function getAttackRangeBonusFromEnhancement(cardName?: string | null): number {
  if (!cardName) return 0;

  if (cardName === '远攻' || cardName === '远程战术') {
    return 1;
  }

  return 0;
}

export function getAttackDamageBonusFromEnhancement(cardName?: string | null): number {
  if (!cardName) return 0;

  if (cardName === '强击') {
    return 1;
  }

  return 0;
}

export function requiresSubstituteSelection(cardName?: string | null): boolean {
  return cardName === '替身';
}