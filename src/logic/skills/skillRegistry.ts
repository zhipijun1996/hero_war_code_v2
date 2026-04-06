import { SkillDefinition } from './types.ts';

class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  registerSkill(def: SkillDefinition): void {
    if (this.skills.has(def.id)) {
      console.warn(`Skill with id ${def.id} is already registered. Overwriting.`);
    }
    this.skills.set(def.id, def);
  }

  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }
}

export const skillRegistry = new SkillRegistry();
