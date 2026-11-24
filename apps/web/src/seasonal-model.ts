// Winter uses the snow-covered `_v2` models. Not every model has one: the nest only
// exists in its original form, and asking for a missing `_v2` costs a failed request
// and a console error on every winter load before the fallback kicks in.
const WITHOUT_WINTER = new Set(["BLD_NEST"]);

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
