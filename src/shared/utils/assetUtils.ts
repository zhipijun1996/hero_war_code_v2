export function getHeroTokenImage(heroClass: string): string {
  const heroMap: Record<string, string> = {
    '战士': 'https://picsum.photos/seed/warrior/200/200',
    '法师': 'https://picsum.photos/seed/mage/200/200',
    '射手': 'https://picsum.photos/seed/archer/200/200',
    '刺客': 'https://picsum.photos/seed/assassin/200/200',
    '牧师': 'https://picsum.photos/seed/priest/200/200',
    '坦克': 'https://picsum.photos/seed/tank/200/200'
  };
  return heroMap[heroClass] || 'https://picsum.photos/seed/hero/200/200';
}
