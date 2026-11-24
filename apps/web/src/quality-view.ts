import {
  EXCHANGE_RULES,
  LABOR_RULES,
  type LaborState,
  laborIron,
  laborReservedIron,
  laborStock,
  LEGACY_TIMBER_RULES as TIMBER_RULES,
} from "@dynosty/game-core";
export const STOCK_LABELS = {
  transit: "운송 중",
  waiting: "검사 대기",
  checked: "합격 수령 전",
  quarantine: "격리·사용 불가",
  available: "정상·사용 가능",
  allocated: "배분",
  used: "사용 확인",
} as const;
export type StockKind = keyof typeof STOCK_LABELS;
export const STOCK_KINDS = Object.keys(STOCK_LABELS) as StockKind[];
export function qualityView(s: LaborState) {
  const stock = laborStock(s);
  const bins = {
    ...stock,
    transit:
      stock.transit +
      (s.timber.phase === "transport" ? TIMBER_RULES.requested : 0),
  };
  const offer = s.timber.offer ? TIMBER_RULES.offers[s.timber.offer] : null;
  const inspected =
    !!offer &&
    ["inspected", "received", "repairing", "ready", "completed"].includes(
      s.timber.phase,
    );
  return {
    bins,
    total: Object.values(bins).reduce((a, b) => a + b, 0),
    offer,
    inspected,
    normal: inspected ? TIMBER_RULES.requested - (offer?.wet ?? 0) : null,
    wet: inspected ? (offer?.wet ?? 0) : null,
    repaired:
      s.repairProgress === LABOR_RULES.repairMinutes ? (offer?.wet ?? 0) : 0,
    exchanged: s.exchange.phase === "completed" ? EXCHANGE_RULES.quantity : 0,
    exchangePending: !["none", "completed"].includes(s.exchange.phase)
      ? EXCHANGE_RULES.quantity
      : 0,
    spent: TIMBER_RULES.initialIron - laborIron(s),
    reserved: laborReservedIron(s),
    iron: laborIron(s),
    freeIron: laborIron(s) - laborReservedIron(s),
  };
}
