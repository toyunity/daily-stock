/** Light editorial schematic (not-to-scale) of the Strait of Hormuz. */
export function StraitSchematic() {
  return (
    <svg viewBox="0 0 520 240" width="100%" role="img" aria-label="호르무즈 해협 개략도">
      <rect x="0" y="0" width="520" height="240" fill="#eef4f2" />
      <path
        d="M0,0 H520 V78 C430,86 380,58 300,74 C232,88 200,52 120,66 C70,74 30,60 0,72 Z"
        fill="#e7ded0"
        stroke="#c9bfa8"
        strokeWidth="1.4"
      />
      <text x="30" y="34" fontFamily="Noto Sans KR, system-ui, sans-serif" fontSize="13" fontWeight="700" fill="#6b6252" letterSpacing="2">
        이란 · IRAN
      </text>
      <path
        d="M0,240 H520 V150 C420,140 380,172 300,160 C238,150 210,182 130,170 C78,162 34,182 0,168 Z"
        fill="#e7ded0"
        stroke="#c9bfa8"
        strokeWidth="1.4"
      />
      <text x="490" y="222" textAnchor="end" fontFamily="Noto Sans KR, system-ui, sans-serif" fontSize="13" fontWeight="700" fill="#6b6252" letterSpacing="2">
        오만 · 아랍에미리트
      </text>
      <path d="M20,118 C160,112 220,128 300,116 C380,104 440,120 500,112" fill="none" stroke="#6e1d29" strokeWidth="2" strokeDasharray="7 6" />
      <polygon points="500,112 490,107 490,117" fill="#6e1d29" />
      <line x1="300" y1="74" x2="300" y2="160" stroke="#b0301f" strokeWidth="1.4" strokeDasharray="3 4" />
      <circle cx="300" cy="116" r="7" fill="#b0301f" />
      <circle cx="300" cy="116" r="13" fill="none" stroke="#b0301f" strokeWidth="1.3" opacity="0.5" />
      <text x="300" y="205" textAnchor="middle" fontFamily="Noto Sans KR, system-ui, sans-serif" fontSize="11" fontWeight="700" fill="#b0301f" letterSpacing="1">
        최협부 · 폐쇄 위협
      </text>
      <text x="30" y="105" fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize="10.5" fill="#6b6252">
        ← 페르시아만
      </text>
      <text x="490" y="105" textAnchor="end" fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize="10.5" fill="#6b6252">
        오만만 →
      </text>
    </svg>
  );
}
