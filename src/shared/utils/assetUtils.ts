const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';



export function getHeroTokenImage(heroClass: string): string {
  return `${BASE_URL}token_${encodeURIComponent(heroClass)}.png`;
}
