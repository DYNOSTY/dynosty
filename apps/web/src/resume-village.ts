import {
  campaignOf,
  parseTimberSave,
  updateCampaign,
} from "@dynosty/game-core";

export function resumeVillage(data: unknown) {
  const saved = parseTimberSave(data).state;
  // Earlier developer saves can already have a mutually exclusive research ending.
  const campaign =
    saved.campaign || !saved.town.development.story.rebellion
      ? { campaign: campaignOf(saved) }
      : {};
  return updateCampaign({
    ...saved,
    ...campaign,
    paused: true,
    remainder: 0,
  });
}
