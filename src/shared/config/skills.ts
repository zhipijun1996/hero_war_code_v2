import { Skill } from '../types/index.ts';

export const SKILLS_LIBRARY: Record<string, Skill> = {
  "battle_step": {
    id: "battle_step",
    "name": "战斗步伐",
    "description": "攻击后可以移动1格。"
  },
  "guard_break": {
    id: "guard_break",
    "name": "破防",
    "description": "当你的攻击被防御时，目标仍然受到1伤害"
  },
  "onslaught": {
    id: "onslaught",
    "name": "猛攻",
    "description": "每次攻击时选择其一，攻击不可被防御，或者伤害+1"
  },
  "reckless_attack": {
    id: "reckless_attack",
    "name": "鲁莽攻击",
    "description": "攻击时，目标不能使用防御。"
  },
  "berserk_charge": {
    id: "berserk_charge",
    "name": "狂战冲锋",
    "description": "若你上一次行动为移动，且该移动后未受到攻击伤害，本次攻击伤害 +1。"
  },
  "fury": {
    id: "fury",
    "name": "狂怒",
    "description": "当你本回合受到伤害后，你的攻击伤害 +1，直到回合结束。"
  },
  "assassin_pierce_slash": {
    id: "assassin_pierce_slash",
    "name": "穿身斩",
    "description": "主动技：选择一名相邻敌方单位。若其背后相邻区域为空，你可以移动至该区域，并对其进行一次攻击。",
    type: "active"
  },
  "assassin_shadow_pierce": {
    id: "assassin_shadow_pierce",
    "name": "影袭穿斩",
    "description": "主动技：执行一次移动。若移动后与敌方单位相邻，你可以立即对其使用【穿身斩】或进行攻击。",
    type: "active"
  },
  "assassin_shadow_clone": {
    id: "assassin_shadow_clone",
    "name": "暗影替身",
    "description": "被动技/半被动：你的回合开始时，移除旧暗影，并在你所在区域放置 1 个暗影。暗影 HP1，对敌方视为路障。每回合一次，当你成为攻击目标时，你可以与暗影交换位置，并使该次攻击改为以暗影为目标。",
    type: "passive"
  },
  "duelist_pulling_slash": {
    id: "duelist_pulling_slash",
    "name": "牵引斩",
    "description": "主动技：选择直线 2 格内一名敌方单位。若你与其之间无阻挡，将其拉至你相邻的合法空格，并对其进行一次攻击。",
    type: "active"
  },
  "duelist_chasing_step": {
    id: "duelist_chasing_step",
    "name": "追步",
    "description": "被动技：被你攻击过的相邻敌方单位离开你相邻区域后，你可以移动 1 格。",
    type: "passive"
  },
  "duelist_infinite_sword_domain": {
    id: "duelist_infinite_sword_domain",
    "name": "无限剑域",
    "description": "主动技：本回合一次，直到回合结束前，你 2 格范围内的区域成为剑域。每名敌方单位每回合第一次主动进入或离开剑域时，你可以对其进行一次攻击。",
    type: "active"
  },
  "parry": {
    id: "parry",
    "name": "招架",
    "description": "当你使用防御时，可以移动1格。"
  },
  "counter_measure": {
    id: "counter_measure",
    "name": "反制",
    "description": "当你成功反击后，抽1张牌"
  },
  "knockback": {
    id: "knockback",
    "name": "反击震退",
    "description": "当你攻击或反击后，将目标沿攻击方向直线推开2格"
  },
  "sneak_attack": {
    id: "sneak_attack",
    "name": "偷袭",
    "description": "主动技：对相邻敌方英雄进行一次攻击。若造成伤害，随机弃置其 1 张手牌。",
    type: "active"
  },
  "sleight_of_hand": {
    id: "sleight_of_hand",
    "name": "顺手牵羊",
    "description": "被动技：当你使敌方英雄弃置手牌后，你可以移动 1 格，或从牌库抽 1 张牌。",
    type: "passive"
  },
  "steal_skills": {
    id: "steal_skills",
    "name": "偷天换日",
    "description": "被动技：回合开始时，选择一名敌方英雄已解锁的一个技能。直到回合结束前，你获得该技能。",
    type: "passive"
  },
  "ice_pillar": {
    id: "ice_pillar",
    "name": "凝冰结阵",
    "description": "主动技：在射程内的空地生成1个冰柱。冰柱 HP1，且视为不可通行的路障。英雄从与冰柱相邻的区域移动时，需额外消耗 1 点移动力。场上最多存在 3 个由你召唤的冰柱，超过上限时最早生成的冰柱将被移除。",
    type: "active"
  },
  "pillar_burst": {
    id: "pillar_burst",
    "name": "冰霜爆裂",
    "description": "被动技：当你召唤的冰柱被破坏时，会对与该冰柱相邻格的所有单位造成 1 点魔法伤害。",
    type: "passive"
  },
  "deep_freeze": {
    id: "deep_freeze",
    "name": "深度冻结",
    "description": "说明：该英雄下次行动前，第一次受到攻击时伤害 +1，并解除深度冻结；若其未受到攻击，则其下次行动改为“破冰并移动 1 格”。",
    type: "passive"
  },
  "ice_mage_blizzard": {
    id: "ice_mage_blizzard",
    "name": "暴风雪",
    "description": "主动技：本回合一次，选择一根冰柱，其相邻区域以及施法者相邻区域，直到你的回合结束视为暴风雪区域。单位在暴风雪区域中结束回合时，获得深度冻结。",
    type: "active"
  },
  "fire_mage_fireball": {
    id: "fire_mage_fireball",
    "name": "火球",
    "description": "攻击，并选择目标相邻的一个区域，使其成为余烬区。",
    type: "active"
  },
  "fire_mage_spread": {
    id: "fire_mage_spread",
    "name": "火势蔓延",
    "description": "选择 2 格内的任意两个不同区域，使其成为余烬区。",
    type: "active"
  },
  "fire_mage_deflagration": {
    id: "fire_mage_deflagration",
    "name": "爆燃",
    "description": "所有余烬区爆炸。余烬区及其相邻区域中的单位各受到 1 点伤害。每个单位只受 1 次伤害。所有余烬区随后消失。",
    type: "active"
  },
  "aim": {
    id: "aim",
    "name": "瞄准",
    "description": "弃置 1 张手牌，本次ar+1进行攻击。"
  },
  "poison_arrow": {
    id: "poison_arrow",
    "name": "毒箭",
    "description": "被你攻击的敌方英雄，本回合第一次移动时，须弃置 1 张手牌；否则不能移动。"
  },
  "poison_arrow_effect": {
    id: "poison_arrow_effect",
    "name": "毒箭效果",
    "description": "（内部效果）处理毒箭的移动限制逻辑。"
  },
  "arrow_rain": {
    id: "arrow_rain",
    "name": "箭雨",
    "description": "主动技（终极技）：进行一次攻击。若命中，可额外选择目标相邻的一名敌方单位（英雄或怪物），对其造成 1 点伤害。"
  },
  "lifesteal_counter": {
    id: "lifesteal_counter",
    "name": "反击吸血",
    "description": "反击造成伤害后恢复1hp"
  },
  "suppression": {
    id: "suppression",
    name: "压制",
    description: "每名敌方英雄每回合第一次从重甲战士的相邻格移动时（包括经过），须弃置 1 张手牌；否则不能执行此次移动。",
    type: "passive"
  },
  "guardian_swap": {
    id: "guardian_swap",
    name: "守护换位",
    description: "当距离 2 以内的我方英雄受到攻击时，你可以与其交换位置，并成为该次攻击的目标。",
    type: "semi_passive"
  },
  "hardened": {
    id: "hardened",
    "name": "坚硬",
    "description": "被攻击时，攻击者必须额外弃一张牌，否则攻击失效。被攻击只能防御，无法反击"
  },
  "steadfast": {
    id: "steadfast",
    "name": "坚守",
    "description": "当你防御成功后，攻击者本回合移动力-1"
  },
  "taunt": {
    id: "taunt",
    "name": "嘲讽",
    "description": "发动后进入嘲讽状态（）"
  },
  "heal": {
    id: "heal",
    "name": "治疗",
    "description": "选择 2 格内一名友方英雄，其回复 1 点生命并移动 1 格。"
  },
  "holy_shield": {
    id: "holy_shield",
    "name": "圣盾",
    "description": "选择 2 格内一名友方英雄，其获得护盾并移动 1 格。护盾：不能被推/拉，受到的伤害 -1；受到一次攻击后，护盾破碎。"
  },
  "holy_prayer": {
    id: "holy_prayer",
    "name": "神圣祈愿",
    "description": "一回合只能使用一次。依次结算一次【治疗】与一次【圣盾】。"
  },
  "command": {
    id: "command",
    "name": "指挥",
    "description": "弃置 1 张手牌：本次行动点改为由另一名英雄行动。",
    "type": "active"
  },
  "follow_up": {
    id: "follow_up",
    "name": "跟进",
    "description": "使用【指挥】后，指挥官可以进行一次移动或进行一次攻击。",
    "type": "passive"
  },
  "dispatch": {
    id: "dispatch",
    "name": "临场调度",
    "description": "每回合一次，选择 2 格内一名友方英雄。该英雄使用一次主动技能；然后指挥官使用一次相同技能。若所选为终极技，则该英雄须消耗其对应的行动 token。",
    "type": "active"
  },
  "warrior_knockback_slash": {
    id: "warrior_knockback_slash",
    name: "击退斩",
    description: "对相邻敌方英雄进行攻击，攻击成功后将其沿直线推开 1 格",
    type: "active"
  },
  "warrior_press_forward": {
    id: "warrior_press_forward",
    name: "压进击退",
    description: "发动击退斩后，若成功推开或击杀，你可以选择进入其原位。",
    type: "semi_passive"
  },
  "warrior_whirlwind_slash": {
    id: "warrior_whirlwind_slash",
    name: "旋风斩",
    description: "对所有相邻的敌方单位（英雄和怪物）造成 1 点伤害。",
    type: "active"
  },
  "berserker_linear_dash": {
    id: "berserker_linear_dash",
    name: "直线冲撞",
    description: "选择一名与你同一直线、距离 1~2 的敌方单位。移动至其相邻格，并对其进行一次攻击。",
    type: "active"
  },
  "berserker_assault_dash": {
    id: "berserker_assault_dash",
    name: "强袭冲撞",
    description: "选择一名与你同一直线、距离 1~3 的敌方单位。移动至其相邻格，并对其进行一次攻击。若其与你初始距离＜3，无论是否被防御，其后退 1 格。",
    type: "active"
  },
  "berserker_formation_breaking_dash": {
    id: "berserker_formation_breaking_dash",
    name: "裂阵冲撞",
    description: "选择一名与你同一直线、距离 1~3 的敌方单位。移动至其相邻格，并对其进行一次攻击。无论是否被防御，其后退 1 格；与其相邻的其他敌方英雄各后退 1 格。",
    type: "active"
  },
  "test_active_skill": {
    id: "test_active_skill",
    name: "测试主动技能",
    description: "这是一个用于测试技能系统的主动技能。",
    type: "active"
  },
  "test_target_skill": {
    id: "test_target_skill",
    name: "测试目标技能",
    description: "这是一个用于测试技能目标选择的主动技能。",
    type: "active"
  },
  "test_passive_skill": {
    id: "test_passive_skill",
    name: "测试被动技能",
    description: "这是一个用于测试技能系统的被动技能。回合开始时触发。",
    type: "passive"
  },
  "test_semi_passive_skill": {
    id: "test_semi_passive_skill",
    name: "测试半被动技能",
    description: "这是一个用于测试技能系统的半被动技能。受到伤害时触发询问。",
    type: "semi_passive"
  },
  "eagle_eye": {
    id: "eagle_eye",
    name: "鹰眼",
    description: "攻击距离 +1。",
    modifiers: [
      { stat: 'ar', value: 1, type: 'add' }
    ]
  },
  "swift_foot": {
    id: "swift_foot",
    name: "神行",
    description: "移动力 +1。",
    modifiers: [
      { stat: 'mv', value: 1, type: 'add' }
    ]
  }
};
