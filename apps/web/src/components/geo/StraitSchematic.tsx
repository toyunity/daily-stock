/** Schematic (not-to-scale) diagram of the Strait of Hormuz for the briefing. */
export function StraitSchematic() {
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 480 250" role="img" aria-label="호르무즈 해협 개념도" className="h-auto w-full">
        <rect x="0" y="0" width="480" height="250" fill="#0f2434" opacity="0.5" />
        {/* Iran (north) */}
        <path
          d="M0,0 H480 V66 C400,88 360,60 300,82 C240,104 200,76 120,92 C70,102 40,84 0,96 Z"
          fill="#18222f"
          stroke="rgba(255,255,255,0.16)"
        />
        {/* Oman / UAE (south) */}
        <path
          d="M0,250 H480 V176 C400,164 350,192 300,176 C250,160 210,186 150,172 C100,160 50,184 0,174 Z"
          fill="#18222f"
          stroke="rgba(255,255,255,0.16)"
        />
        <text x="22" y="42" fontSize="13" fontWeight="700" fill="#e7ecf3">이란 · IRAN</text>
        <text x="22" y="224" fontSize="13" fontWeight="700" fill="#e7ecf3">오만 · UAE</text>
        {/* shipping lane */}
        <path
          d="M40,146 C160,116 250,146 300,128 C360,106 420,128 470,116"
          fill="none"
          stroke="#e3b24a"
          strokeWidth="2.5"
          strokeDasharray="7 6"
        />
        <text x="66" y="138" fontSize="10.5" fill="#96a3b5">주요 유조선 항로</text>
        {/* chokepoint */}
        <circle cx="300" cy="128" r="7" fill="#e5605c" />
        <circle cx="300" cy="128" r="13" fill="none" stroke="#e5605c" strokeOpacity="0.5" />
        <text x="300" y="108" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e5605c">
          최협부 · Chokepoint
        </text>
      </svg>
    </div>
  );
}
