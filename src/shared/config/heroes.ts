import { HeroesDatabase } from '../types/index.ts';
import { SKILLS_LIBRARY } from './skills.ts';

export const HEROES_DATABASE: HeroesDatabase = {
  "heroes": [
    {
      "id": "hero_warrior",
      "name": "战士",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.warrior_knockback_slash]
        },
        "2": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.warrior_knockback_slash, SKILLS_LIBRARY.warrior_press_forward]
        },
        "3": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.warrior_knockback_slash, SKILLS_LIBRARY.warrior_press_forward, SKILLS_LIBRARY.warrior_whirlwind_slash]
        }
      }
    },
    {
      "id": "hero_berserker",
      "name": "狂战士",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.berserker_linear_dash]
        },
        "2": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.berserker_linear_dash, SKILLS_LIBRARY.berserker_assault_dash]
        },
        "3": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.berserker_linear_dash, SKILLS_LIBRARY.berserker_assault_dash, SKILLS_LIBRARY.berserker_formation_breaking_dash]
        }
      }
    },
    {
      "id": "hero_assassin",
      "name": "刺客",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.ambush]
        },
        "2": {
          "hp": 3,
          "ar": 1,
          "mv": 2,
          "xp": 5,
          "skills": [SKILLS_LIBRARY.ambush, SKILLS_LIBRARY.shadow_step]
        },
        "3": {
          "hp": 3,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.ambush, SKILLS_LIBRARY.shadow_step, SKILLS_LIBRARY.lethal_assault]
        }
      }
    },
    {
      "id": "hero_duelist",
      "name": "决斗大师",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.parry]
        },
        "2": {
          "hp": 3,
          "ar": 1,
          "mv": 2,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.parry, SKILLS_LIBRARY.counter_measure]
        },
        "3": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.parry, SKILLS_LIBRARY.counter_measure, SKILLS_LIBRARY.knockback]
        }
      }
    },
    {
      "id": "hero_thief",
      "name": "盗贼",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.stealth, SKILLS_LIBRARY.swift_foot]
        },
        "2": {
          "hp": 3,
          "ar": 1,
          "mv": 2,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.stealth, SKILLS_LIBRARY.disarm]
        },
        "3": {
          "hp": 3,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.stealth, SKILLS_LIBRARY.disarm, SKILLS_LIBRARY.theft]
        }
      }
    },
    {
      "id": "hero_ice_mage",
      "name": "冰法师",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 2,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.ice_pillar]
        },
        "2": {
          "hp": 3,
          "ar": 2,
          "mv": 2,
          "xp": 5,
          "skills": [SKILLS_LIBRARY.ice_pillar, SKILLS_LIBRARY.pillar_burst]
        },
        "3": {
          "hp": 3,
          "ar": 2,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.ice_pillar, SKILLS_LIBRARY.pillar_burst, SKILLS_LIBRARY.deep_freeze]
        }
      }
    },
    {
      "id": "hero_fire_mage",
      "name": "火法师",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 2,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.fire_mage_fireball]
        },
        "2": {
          "hp": 3,
          "ar": 2,
          "mv": 2,
          "xp": 5,
          "skills": [SKILLS_LIBRARY.fire_mage_fireball, SKILLS_LIBRARY.fire_mage_spread]
        },
        "3": {
          "hp": 3,
          "ar": 2,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.fire_mage_fireball, SKILLS_LIBRARY.fire_mage_spread, SKILLS_LIBRARY.fire_mage_deflagration]
        }
      }
    },
    {
      "id": "hero_archer",
      "name": "弓箭手",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 2,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.aim]
        },
        "2": {
          "hp": 3,
          "ar": 2,
          "mv": 1,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.aim, SKILLS_LIBRARY.poison_arrow, SKILLS_LIBRARY.poison_arrow_effect]
        },
        "3": {
          "hp": 3,
          "ar": 3,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.aim, SKILLS_LIBRARY.poison_arrow, SKILLS_LIBRARY.arrow_rain, SKILLS_LIBRARY.poison_arrow_effect]
        }
      }
    },
    {
      "id": "hero_heavy_armor",
      "name": "重甲兵",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 3,
          "skills": [SKILLS_LIBRARY.suppression]
        },
        "2": {
          "hp": 4,
          "ar": 1,
          "mv": 1,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.suppression, SKILLS_LIBRARY.guardian_swap]
        },
        "3": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.suppression, SKILLS_LIBRARY.guardian_swap]
        }
      }
    },
    {
      "id": "hero_shield_guard",
      "name": "巨盾卫士",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.hardened]
        },
        "2": {
          "hp": 4,
          "ar": 1,
          "mv": 1,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.hardened, SKILLS_LIBRARY.steadfast]
        },
        "3": {
          "hp": 5,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.hardened, SKILLS_LIBRARY.steadfast, SKILLS_LIBRARY.taunt]
        }
      }
    },
    {
      "id": "hero_priest",
      "name": "圣职者",
      "levels": {
        "1": {
          "hp": 2,
          "ar": 2,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.heal]
        },
        "2": {
          "hp": 3,
          "ar": 2,
          "mv": 1,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.heal, SKILLS_LIBRARY.holy_shield]
        },
        "3": {
          "hp": 3,
          "ar": 2,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.heal, SKILLS_LIBRARY.holy_shield, SKILLS_LIBRARY.holy_prayer]
        }
      }
    },
    {
      "id": "hero_commander",
      "name": "指挥官",
      "levels": {
        "1": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 2,
          "skills": [SKILLS_LIBRARY.command]
        },
        "2": {
          "hp": 3,
          "ar": 1,
          "mv": 1,
          "xp": 4,
          "skills": [SKILLS_LIBRARY.command, SKILLS_LIBRARY.follow_up]
        },
        "3": {
          "hp": 4,
          "ar": 1,
          "mv": 2,
          "xp": 0,
          "skills": [SKILLS_LIBRARY.command, SKILLS_LIBRARY.follow_up, SKILLS_LIBRARY.dispatch]
        }
      }
    }
  ]
};
