// 마을 건물 자리 (Babylon 없이도 화면 쪽에서 읽을 수 있게 따로 둠)
// 집(둥지)은 가운데 온돌 둘레 11.5m 고리에 모임 — 큰길(동서남북)·석등(대각선)은 비킴
// 순서가 일꾼 일터 번호(3 창고·5 채집막·8 양식장·11 회수장)와 묶여 있어 새 건물은 끝에 붙임
export const LAYOUT: Array<[string, number, number]> = [
  ["BLD_OFFICE", 0, -14],
  // 집(둥지)은 가운데 온돌 둘레 11.5m 고리에 모임 — 큰길(동서남북)·석등(대각선)은 비킴
  ["BLD_NEST", -9.96, -5.75],
  ["BLD_NEST", 9.96, -5.75],
  ["BLD_WAREHOUSE", -15, 1],
  ["BLD_WORKSHOP", 15, 0],
  ["BLD_FORAGE", -11, 11],
  ["BLD_GREENHOUSE", -3, 16],
  ["BLD_WATER", 9, 16],
  ["BLD_FISHERY", 20, 7],
  ["BLD_WATCH", -20, -8],
  ["BLD_CLINIC", -7, -20],
  ["BLD_SALVAGE", 9, -20],
  ["BLD_GATE", 0, 23],
  // 순서가 일꾼 일터 번호와 묶여 있어 나머지 집은 끝에 붙임
  ["BLD_NEST", 9.96, 5.75],
  ["BLD_NEST", 5.75, 9.96],
  ["BLD_NEST", -5.75, 9.96],
  ["BLD_NEST", -9.96, 5.75],
  ["BLD_NEST", -5.75, -9.96],
  ["BLD_NEST", 5.75, -9.96],
];

// 벌목터: 숲 가장자리(반지름 약 27m) — 큰길(동서·남북)·건물·정찰 거점·호수를 비킨 세 곳 (logging.ts)
// 자재 회수장 뒤(남동) · 채집막 뒤(북서) · 망루 뒤(남서)
export const LOGGING_SITES: Array<[number, number]> = [
  [15.5, -22.1],
  [-19.1, 19.1],
  [-23.4, -13.5],
];
