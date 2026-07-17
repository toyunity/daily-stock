export const SECTORS = [
  { id: "tech", label: "기술" },
  { id: "memory", label: "메모리 반도체" },
  { id: "finance", label: "금융" },
  { id: "energy", label: "에너지" },
  { id: "healthcare", label: "헬스케어" },
  { id: "consumer", label: "소비재" },
  { id: "industrials", label: "산업재" },
  { id: "materials", label: "소재" },
  { id: "utilities", label: "유틸리티" },
  { id: "realestate", label: "부동산" },
  { id: "communication", label: "커뮤니케이션" },
] as const;

export const TOPICS = [
  { id: "macro", label: "매크로" },
  { id: "earnings", label: "실적" },
  { id: "fed", label: "연준" },
  { id: "ipo", label: "IPO" },
  { id: "m&a", label: "M&A" },
  { id: "guidance", label: "가이던스" },
  { id: "regulation", label: "규제" },
  { id: "commodities", label: "원자재" },
  { id: "crypto", label: "가상자산" },
] as const;

export const POPULAR_TICKERS = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "AVGO", "NFLX",
];
