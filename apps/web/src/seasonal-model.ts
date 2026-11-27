// Winter uses snow-covered `_v2` models. List any future models without a winter
// variant here so they use their original form without a failed request.
const WITHOUT_WINTER = new Set<string>();

export function hasWinterModel(model: string) {
  return !WITHOUT_WINTER.has(model);
}

export function seasonalModelUrl(
  folder: "buildings" | "residents",
  model: string,
  winter: boolean,
) {
  return `/models/${folder}/${model}${winter && hasWinterModel(model) ? "_v2" : ""}.glb`;
}
