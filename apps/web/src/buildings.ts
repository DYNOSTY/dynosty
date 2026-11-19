// 건물별 하단 콘솔 내용: 이름·역할·초상(컨셉 시트)·명령 9칸
// 명령 중 실제로 되는 것은 action이 있고, 아직 게임 규칙이 없는 것은 잠김(준비 중)

export type BuildingAction =
  | "procure"
  | "scout"
  | "focus"
  | "clear"
  | "heat-절약"
  | "heat-보통"
  | "heat-긴급";
export type BuildingCommand = {
  icon: string;
  label: string;
  hotkey?: string;
  action?: BuildingAction;
};
export type BuildingInfo = {
  name: string;
  /** 한 줄 역할 */
  role: string;
  /** 짧은 사실 2~3개 (꼬리표 · 값) */
  facts: Array<[string, string]>;
  commands: BuildingCommand[];
};

const locked = (icon: string, label: string): BuildingCommand => ({
  icon,
  label,
});

export const BUILDINGS: Record<string, BuildingInfo> = {
  BLD_ONDOL: {
    name: "온돌",
    role: "마을의 난방 중심. 아궁이 불을 구들 고래로 집집마다 보냅니다.",
    facts: [
      ["종류", "난방"],
      ["연결", "둥지 8채"],
    ],
    // 화력: 기획 v0.4 U35 — 절약0.6 · 보통1 · 긴급1.4배 (석탄 요구와 가열량)
    commands: [
      {
        icon: "heat_save",
        label: "화력 절약",
        hotkey: "1",
        action: "heat-절약",
      },
      {
        icon: "heat_normal",
        label: "화력 보통",
        hotkey: "2",
        action: "heat-보통",
      },
      {
        icon: "heat_urgent",
        label: "화력 긴급",
        hotkey: "3",
        action: "heat-긴급",
      },
      locked("research", "고래 보수"),
    ],
  },
  BLD_NEST: {
    name: "공동 둥지",
    role: "주민이 모여 자는 집. 온돌 고래에서 온기를 받습니다.",
    facts: [
      ["종류", "주거"],
      ["난방", "온돌 연결"],
    ],
    commands: [locked("residents", "주민 보기"), locked("ondol", "난방 확인")],
  },
  BLD_OFFICE: {
    name: "조달소",
    role: "바깥에서 자재를 들여오고 검수해 필요한 곳에 보냅니다.",
    facts: [
      ["종류", "조달"],
      ["진행", "마른 목재20"],
    ],
    commands: [
      { icon: "economy", label: "조달", hotkey: "E", action: "procure" },
      locked("records", "조달 기록"),
    ],
  },
  BLD_WAREHOUSE: {
    name: "갈무리 창고",
    role: "들여온 물자와 거둔 것을 쌓아 두는 곳입니다.",
    facts: [["종류", "보관"]],
    commands: [locked("records", "재고 보기")],
  },
  BLD_WORKSHOP: {
    name: "기술 공방",
    role: "도구와 자재를 고치고 만드는 대장간입니다.",
    facts: [["종류", "제작"]],
    commands: [locked("build", "제작"), locked("research", "연구")],
  },
  BLD_FORAGE: {
    name: "고사리 채집막",
    role: "눈 밑 고사리·풀을 거두어 식량을 보탭니다.",
    facts: [
      ["종류", "식량"],
      ["거둠", "풀"],
    ],
    commands: [locked("residents", "일꾼 배정")],
  },
  BLD_GREENHOUSE: {
    name: "온상 재배소",
    role: "난로로 데운 유리 온상에서 푸성귀를 기릅니다.",
    facts: [
      ["종류", "식량"],
      ["거둠", "풀"],
    ],
    commands: [locked("residents", "일꾼 배정")],
  },
  BLD_WATER: {
    name: "정수 물레방",
    role: "얼음을 깨 물을 거르고 마실 물을 만듭니다.",
    facts: [["종류", "물"]],
    commands: [locked("residents", "일꾼 배정")],
  },
  BLD_FISHERY: {
    name: "강물 양식장",
    role: "얼음 구멍으로 물고기를 잡아 식량을 보탭니다.",
    facts: [
      ["종류", "식량"],
      ["거둠", "어류"],
    ],
    commands: [locked("residents", "일꾼 배정")],
  },
  BLD_SALVAGE: {
    name: "자재 회수장",
    role: "무너진 집터에서 나무와 쇠를 거두어 옵니다.",
    facts: [
      ["종류", "자재"],
      ["거둠", "나무"],
    ],
    commands: [locked("residents", "일꾼 배정")],
  },
  BLD_WATCH: {
    name: "망루",
    role: "섬 바깥을 살피고 정찰대를 내보냅니다.",
    facts: [["종류", "정찰"]],
    commands: [
      { icon: "map", label: "정찰 보내기", hotkey: "R", action: "scout" },
    ],
  },
  BLD_GATE: {
    name: "방책 성문",
    role: "마을을 드나드는 문. 정찰대가 여기로 나갑니다.",
    facts: [["종류", "방어"]],
    commands: [
      { icon: "map", label: "정찰 보내기", hotkey: "R", action: "scout" },
    ],
  },
  BLD_CLINIC: {
    name: "회복 둥지",
    role: "다치거나 언 주민을 돌보는 곳입니다.",
    facts: [["종류", "치료"]],
    commands: [locked("residents", "환자 보기")],
  },
};

/** 9칸: 건물 명령 + 빈 칸 + 늘 있는 가까이 보기·선택 해제 (칸마다 고정 이름) */
export function commandGrid(
  info: BuildingInfo,
): Array<{ slot: string; cmd: BuildingCommand | null }> {
  const cells: Array<BuildingCommand | null> = info.commands.slice(0, 7);
  while (cells.length < 7) cells.push(null);
  cells.push({
    icon: "map",
    label: "가까이 보기",
    hotkey: "F",
    action: "focus",
  });
  cells.push({
    icon: "close",
    label: "선택 해제",
    hotkey: "Esc",
    action: "clear",
  });
  return cells.map((cmd, n) => ({ slot: `slot-${n + 1}`, cmd }));
}
