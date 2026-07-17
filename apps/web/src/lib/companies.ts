/**
 * Local company directory for name -> ticker search (no API/key needed).
 * `aliases` includes Korean names for common majors so users can type either.
 * Extend freely; this powers the ticker search box in the preference editor.
 */
export interface Company {
  ticker: string;
  name: string;
  aliases?: string[];
}

export const COMPANY_DIRECTORY: Company[] = [
  // Memory / storage semiconductors
  { ticker: "MU", name: "Micron Technology", aliases: ["마이크론", "메모리", "DRAM", "HBM"] },
  { ticker: "000660.KS", name: "SK하이닉스 (SK hynix)", aliases: ["하이닉스", "SK하이닉스", "sk hynix", "HBM", "메모리"] },
  { ticker: "005930.KS", name: "삼성전자 (Samsung Electronics)", aliases: ["삼성", "삼성전자", "samsung", "메모리"] },
  { ticker: "WDC", name: "Western Digital", aliases: ["웨스턴디지털", "낸드", "NAND"] },
  { ticker: "STX", name: "Seagate Technology", aliases: ["시게이트", "스토리지"] },
  { ticker: "SIMO", name: "Silicon Motion", aliases: ["실리콘모션", "컨트롤러"] },
  // Semiconductors / AI
  { ticker: "NVDA", name: "NVIDIA", aliases: ["엔비디아", "GPU", "AI"] },
  { ticker: "AMD", name: "Advanced Micro Devices", aliases: ["에이엠디"] },
  { ticker: "AVGO", name: "Broadcom", aliases: ["브로드컴"] },
  { ticker: "TSM", name: "Taiwan Semiconductor", aliases: ["TSMC", "티에스엠씨"] },
  { ticker: "INTC", name: "Intel", aliases: ["인텔"] },
  { ticker: "QCOM", name: "Qualcomm", aliases: ["퀄컴"] },
  { ticker: "ASML", name: "ASML Holding", aliases: ["에이에스엠엘"] },
  { ticker: "AMAT", name: "Applied Materials", aliases: ["어플라이드머티어리얼즈"] },
  { ticker: "ARM", name: "Arm Holdings", aliases: ["암", "ARM"] },
  { ticker: "SMCI", name: "Super Micro Computer", aliases: ["슈퍼마이크로"] },
  { ticker: "TXN", name: "Texas Instruments", aliases: ["텍사스인스트루먼트"] },
  { ticker: "MRVL", name: "Marvell Technology", aliases: ["마벨"] },
  // Big tech
  { ticker: "AAPL", name: "Apple", aliases: ["애플"] },
  { ticker: "MSFT", name: "Microsoft", aliases: ["마이크로소프트", "MS"] },
  { ticker: "GOOGL", name: "Alphabet (Google)", aliases: ["구글", "알파벳"] },
  { ticker: "AMZN", name: "Amazon", aliases: ["아마존"] },
  { ticker: "META", name: "Meta Platforms", aliases: ["메타", "페이스북"] },
  { ticker: "TSLA", name: "Tesla", aliases: ["테슬라"] },
  { ticker: "NFLX", name: "Netflix", aliases: ["넷플릭스"] },
  { ticker: "ORCL", name: "Oracle", aliases: ["오라클"] },
  { ticker: "CRM", name: "Salesforce", aliases: ["세일즈포스"] },
  { ticker: "ADBE", name: "Adobe", aliases: ["어도비"] },
  { ticker: "PLTR", name: "Palantir", aliases: ["팔란티어"] },
  // Finance
  { ticker: "JPM", name: "JPMorgan Chase", aliases: ["제이피모건"] },
  { ticker: "BAC", name: "Bank of America", aliases: ["뱅크오브아메리카"] },
  { ticker: "GS", name: "Goldman Sachs", aliases: ["골드만삭스"] },
  { ticker: "MS", name: "Morgan Stanley", aliases: ["모건스탠리"] },
  { ticker: "V", name: "Visa", aliases: ["비자"] },
  { ticker: "MA", name: "Mastercard", aliases: ["마스터카드"] },
  { ticker: "BRK.B", name: "Berkshire Hathaway", aliases: ["버크셔"] },
  // Consumer / other
  { ticker: "COST", name: "Costco", aliases: ["코스트코"] },
  { ticker: "WMT", name: "Walmart", aliases: ["월마트"] },
  { ticker: "KO", name: "Coca-Cola", aliases: ["코카콜라"] },
  { ticker: "MCD", name: "McDonald's", aliases: ["맥도날드"] },
  { ticker: "NKE", name: "Nike", aliases: ["나이키"] },
  { ticker: "DIS", name: "Walt Disney", aliases: ["디즈니"] },
  // Energy / healthcare / industrials
  { ticker: "XOM", name: "ExxonMobil", aliases: ["엑슨모빌"] },
  { ticker: "CVX", name: "Chevron", aliases: ["셰브론"] },
  { ticker: "LLY", name: "Eli Lilly", aliases: ["일라이릴리"] },
  { ticker: "UNH", name: "UnitedHealth", aliases: ["유나이티드헬스"] },
  { ticker: "JNJ", name: "Johnson & Johnson", aliases: ["존슨앤존슨"] },
  { ticker: "BA", name: "Boeing", aliases: ["보잉"] },
  { ticker: "CAT", name: "Caterpillar", aliases: ["캐터필러"] },
];

/** Tickers auto-added when a sector is selected. */
export const SECTOR_TICKERS: Record<string, string[]> = {
  memory: ["MU", "000660.KS", "005930.KS", "WDC", "STX", "SIMO"],
};

/** Simple case-insensitive search over ticker, name, and aliases. */
export function searchCompanies(query: string, limit = 8): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = COMPANY_DIRECTORY.map((c) => {
    const hay = [c.ticker, c.name, ...(c.aliases ?? [])].join(" ").toLowerCase();
    let score = -1;
    if (c.ticker.toLowerCase() === q) score = 100;
    else if (c.ticker.toLowerCase().startsWith(q)) score = 80;
    else if (c.name.toLowerCase().startsWith(q)) score = 60;
    else if (hay.includes(q)) score = 40;
    return { c, score };
  }).filter((x) => x.score >= 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.c);
}
