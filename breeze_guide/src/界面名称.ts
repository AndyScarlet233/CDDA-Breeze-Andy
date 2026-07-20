const 类型名称: Record<string, string> = {
  item: "物品",
  monster: "怪物",
  furniture: "家具",
  terrain: "地形",
  vehicle_part: "载具部件",
  tool_quality: "功能",
  mutation: "变异",
  mutation_category: "变异类别",
  martial_art: "武术",
  json_flag: "标记",
  monster_flag: "怪物标记",
  achievement: "成就",
  conduct: "守则",
  proficiency: "专长",
  skill: "技能",
  vehicle: "载具",
  overmap_special: "地点",
  city_building: "地点",
  material: "材料",
  bionic: "生化插件",
  recipe: "配方",
};

export function guideTypeName(type: string): string {
  return 类型名称[type] ?? type.replaceAll("_", " ");
}

export function cleanDisplayName(value: unknown): string {
  return String(value ?? "")
    .replace(/<color_[^>]+>/gi, "")
    .replace(/<\/color>/gi, "")
    .trim();
}
