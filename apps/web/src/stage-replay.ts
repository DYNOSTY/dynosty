import {
  actCampaign,
  CHAPTERS,
  CONVOY_GOALS,
  campaignOf,
  createCapital,
  createTimberSave,
  createVillageGame,
  type Difficulty,
  newCampaign,
  parseTimberSave,
  SETTLEMENTS,
  type TimberState,
} from "@dynosty/game-core";
import { loadTimber } from "./timber-save.js";

export function completedChapters(limit: number) {
  try {
    const saved = Number(localStorage.getItem("dynosty.completedChapter"));
    if (Number.isInteger(saved) && saved >= 0 && saved <= CHAPTERS.length)
      return Math.max(saved, limit);
  } catch {
    /* Session progress remains available. */
  }
  return limit;
}

async function archive<T>(
  store: "starts" | "slots",
  mode: IDBTransactionMode,
  operation: (table: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("dynosty.stage-starts", 2);
    req.onupgradeneeded = () => {
      for (const table of ["starts", "slots"])
        if (!req.result.objectStoreNames.contains(table))
          req.result.createObjectStore(table);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode),
        req = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveStageStart(state: TimberState) {
  return archive("starts", "readwrite", (table) =>
    table.put(createTimberSave(state), state.chapter ?? 1),
  );
}

export function standardMissionStart(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > CHAPTERS.length)
    throw Error("알 수 없는 단계입니다.");
  if (stage === 1) return createVillageGame(true);
  const village = createVillageGame();
  const roads: TimberState = {
    ...village,
    chapter: 2,
    campaign: newCampaign("roads"),
  };
  if (stage === 2) return roads;
  const connected = {
    ...roads,
    campaign: { ...campaignOf(roads), treaties: SETTLEMENTS.map((_, i) => i) },
  };
  if (stage === 3) return createCapital(connected);
  const escort: TimberState = {
    ...connected,
    chapter: 3,
    campaign: {
      ...connected.campaign,
      beat: "escort",
      relief: "report",
      departures: 3,
      evacuees: 200,
      cargo: { ...CONVOY_GOALS },
    },
  };
  const fourth = actCampaign(escort, {
    type: "campaign",
    beat: "escort",
    action: "invite",
  });
  if (stage === 4) return fourth;
  return actCampaign(
    { ...fourth, campaign: { ...campaignOf(fourth), beat: "thaw" } },
    { type: "campaign", beat: "thaw", action: "next" },
  );
}

function resume(data: unknown) {
  const save = parseTimberSave(data);
  localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
  window.location.reload();
}

export async function replayStage(stage: number, difficulty: Difficulty) {
  const data = await archive("starts", "readonly", (table) => table.get(stage));
  const save =
    data === undefined
      ? createTimberSave(standardMissionStart(stage))
      : parseTimberSave(data);
  if ((save.state.chapter ?? 1) !== stage)
    throw Error("단계 기록을 확인해 주세요.");
  resume(
    createTimberSave({
      ...save.state,
      campaign: {
        ...(save.state.campaign ?? newCampaign("opening")),
        difficulty,
      },
    }),
  );
}

export const SAVE_SLOT_COUNT = 10;
export function writeSlot(id: number, state: TimberState) {
  if (!Number.isInteger(id) || id < 1 || id > SAVE_SLOT_COUNT)
    throw Error("저장 슬롯은 1번부터 10번까지입니다.");
  return archive("slots", "readwrite", (table) =>
    table.put({ id, savedAt: Date.now(), save: createTimberSave(state) }, id),
  );
}
export async function listSlots() {
  const rows = await archive("slots", "readonly", (table) => table.getAll());
  const list = rows.map((row) => ({
    id: Number(row.id),
    label: `슬롯 ${row.id} · ${row.save.state.chapter ?? 1}단계 · ${row.save.state.world.day}일 · ${new Date(row.savedAt).toLocaleString("ko-KR")}`,
  }));
  for (const [id, label] of [
    [0, "기존 최근 저장"],
    [-1, "기존 이전 저장"],
  ] as const) {
    try {
      const { state } = loadTimber(localStorage, id === -1);
      list.push({
        id,
        label: `${label} · ${state.chapter ?? 1}단계 · ${state.world.day}일`,
      });
    } catch {
      /* No readable legacy slot. */
    }
  }
  return list;
}
export async function loadSlot(id: number) {
  if (id <= 0) return resume(loadTimber(localStorage, id === -1));
  const row = await archive("slots", "readonly", (table) => table.get(id));
  if (!row) throw Error("빈 슬롯입니다.");
  resume(row.save);
}
