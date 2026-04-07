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
  "ambush": {
    id: "ambush",
    "name": "偷袭",
    "description": "移动，然后攻击。若该攻击被防御，你弃1张手牌"
  },
  "shadow_step": {
    id: "shadow_step",
    "name": "影步",
    "description": "攻击后可以移动1格"
  },
  "lethal_assault": {
    id: "lethal_assault",
    "name": "致命突袭",
    "description": "当你使用【突袭】时，选择一项：① 移动力 +1  ② 攻击伤害 +1 ③ 敌人不能防御或反击"
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
  "stealth": {
    id: "stealth",
    "name": "潜伏",
    "description": "若你本回合尚未进行行动，你不能被指令为攻击或技能的对象"
  },
  "disarm": {
    id: "disarm",
    "name": "拍落",
    "description": "当你攻击命中目标时，目标需要弃一张牌"
  },
  "theft": {
    id: "theft",
    "name": "盗窃",
    "description": "若你本回合尚未进行行动，你的攻击不能被防御或反击，且获得因“拍落”弃掉的那张牌"
  },
  "ice_pillar": {
    id: "ice_pillar",
    "name": "冰柱",
    "description": "在攻击范围内的空格生成1个冰柱（hp1，路障），场上最多3个"
  },
  "pillar_burst": {
    id: "pillar_burst",
    "name": "冰柱爆裂",
    "description": "当冰柱被摧毁时，其相邻敌方单位受到1伤害。"
  },
  "deep_freeze": {
    id: "deep_freeze",
    "name": "深度冻结",
    "description": "攻击成功后，使目标冻结（必须先移动1次才能行动，若被冻结时受到攻击，伤害+1并解除冻结）"
  },
  "scorch": {
    id: "scorch",
    "name": "灼烧",
    "description": "当你的攻击命中目标时，目标进入灼烧（该单位及其相邻单位，直到回合结束前不能防御或反击）"
  },
  "blast_impact": {
    id: "blast_impact",
    "name": "爆炸冲击",
    "description": "攻击后，可以将目标移动1格。"
  },
  "combustion": {
    id: "combustion",
    "name": "爆燃",
    "description": "攻击目标时，其相邻敌人也受到1点不可防御或反击的伤害。"
  },
  "aim": {
    id: "aim",
    "name": "瞄准",
    "description": "若你在攻击前没有移动，攻击距离 +1。若使用该效果，本回合不能移动。"
  },
  "poison_arrow": {
    id: "poison_arrow",
    "name": "毒箭",
    "description": "被你攻击的敌人，本回合移动力 -1。"
  },
  "arrow_rain": {
    id: "arrow_rain",
    "name": "箭雨",
    "description": "攻击目标时，其相邻敌人也受到1点不可防御或反击的伤害。"
  },
  "lifesteal_counter": {
    id: "lifesteal_counter",
    "name": "反击吸血",
    "description": "反击造成伤害后恢复1hp"
  },
  "suppression": {
    id: "suppression",
    "name": "压制",
    "description": "敌方单位离开与你相邻的格子时，需额外耗费1移动力"
  },
  "guardian_swap": {
    id: "guardian_swap",
    "name": "守护换位",
    "description": "相邻友军受到攻击时，你可以与其交换位置，并成为攻击目标"
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
    "description": "选择攻击范围内一个友单位，回复1HP，可以选择自己"
  },
  "holy_echo": {
    id: "holy_echo",
    "name": "神圣回响",
    "description": "当你为友军回复HP时，该单位可以移动1格。"
  },
  "holy_prayer": {
    id: "holy_prayer",
    "name": "神圣祈愿",
    "description": "选择一项：① 你和目标各回复1HP  ②目标及其一个相邻单位各回复1HP  ③弃1张手牌：目标回复2HP"
  },
  "coordinated_move": {
    id: "coordinated_move",
    "name": "协同移动",
    "description": "当你移动后，可以选择1个相邻友方单位移动1格"
  },
  "tactical_move": {
    id: "tactical_move",
    "name": "战术移动",
    "description": "当你移动后，可以选择1个2格范围内的友方单位移动1格，与“协同移动”可以先后执行"
  },
  "tactical_command": {
    id: "tactical_command",
    "name": "战术指令",
    "description": "移动或攻击，然后选择1个相邻友方单位，立刻执行一次移动、攻击或技能"
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
