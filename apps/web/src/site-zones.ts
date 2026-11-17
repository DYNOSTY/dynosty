import { SITE_POINTS } from "./site-targets.js";
export const ZONES = [
  {
    id: "inspection",
    label: "① 검수≡",
    name: "검수 구역",
    point: SITE_POINTS["site-inspection"],
    width: 1.5,
    depth: 1.6,
    color: [0.42, 0.48, 0.45],
  },
  {
    id: "quarantine",
    label: "② 격리×",
    name: "격리·사용 금지 구역",
    point: SITE_POINTS["site-quarantine"],
    width: 1.1,
    depth: 1.5,
    color: [0.3, 0.34, 0.52],
  },
  {
    id: "storage",
    label: "◇ 보관",
    name: "정상 보관 구역",
    point: [1.8, 0.175, -0.6],
    width: 1.5,
    depth: 1.2,
    color: [0.48, 0.4, 0.2],
  },
  {
    id: "allocation",
    label: "▧ 배분",
    name: "배분 구역",
    point: [-3.5, 0.175, -3.7],
    width: 1.7,
    depth: 1.5,
    color: [0.5, 0.3, 0.16],
  },
] as const;
export const SCENE_SIGNS = [
  { id: "site-inspection", label: "① 검수≡", point: [3.4, 1.25, -3.7] },
  { id: "site-quarantine", label: "② 격리×", point: [4.8, 1.15, -3.7] },
  { id: "site-ration", label: "③ 배급", point: [3.8, 1.2, 0.2] },
  { id: "zone-storage", label: "◇ 보관", point: [1.8, 1.2, -0.6] },
  { id: "zone-allocation", label: "▧ 배분", point: [-3.5, 1.2, -3.7] },
] as const;
