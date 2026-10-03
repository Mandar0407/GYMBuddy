import "./_group.css";
import "./Refined.css";

function Mark({ size, tile = "#d6e66b", glyph = "#302b28" }: { size: number; tile?: string; glyph?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill={tile} />
      <path d="M13 18H17Q20 18 20 21V43Q20 46 17 46H13Q10 46 10 43V21Q10 18 13 18ZM22 23H25V41H22Q20 41 20 39V25Q20 23 22 23ZM24 29H40V35H24ZM39 23H42Q44 23 44 25V39Q44 41 42 41H39ZM47 18H51Q54 18 54 21V43Q54 46 51 46H47Q44 46 44 43V21Q44 18 47 18Z" fill={glyph} />
    </svg>
  );
}

function Lockup({ size, small, dark }: { size: number; small?: boolean; dark?: boolean }) {
  return (
    <div className={`gbr-lock${small ? " sm" : ""}${dark ? " dark" : ""}`}>
      <Mark size={size} />
      <span><span className="gbr-gym">GYM</span> <span className="gbr-buddy">Buddy</span></span>
    </div>
  );
}

export function Refined() {
  return (
    <div className="gbr">
      <section className="gbr-hero">
        <span className="gbr-lab" style={{ color: "#a49b90" }}>PRIMARY LOCKUP</span>
        <Lockup size={64} />
      </section>
      <section className="gbr-card">
        <span className="gbr-lab">SMALL SCALE</span>
        <div className="gbr-row"><Mark size={32} /><Mark size={24} /><Mark size={16} /></div>
        <div style={{ background: "#d6e66b", borderRadius: 10, padding: "10px 12px" }}><Lockup size={22} small dark /></div>
      </section>
      <section className="gbr-card" style={{ alignItems: "flex-start" }}>
        <span className="gbr-lab">APP ICON</span>
        <div className="gbr-row">
          <svg className="gbr-ico" width="72" height="72" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect width="1024" height="1024" fill="#302b28" />
            <g transform="translate(192 192) scale(10)"><path d="M13 18H17Q20 18 20 21V43Q20 46 17 46H13Q10 46 10 43V21Q10 18 13 18ZM22 23H25V41H22Q20 41 20 39V25Q20 23 22 23ZM24 29H40V35H24ZM39 23H42Q44 23 44 25V39Q44 41 42 41H39ZM47 18H51Q54 18 54 21V43Q54 46 51 46H47Q44 46 44 43V21Q44 18 47 18Z" fill="#d6e66b" /></g>
          </svg>
          <svg className="gbr-ico" width="40" height="40" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect width="1024" height="1024" fill="#302b28" />
            <g transform="translate(192 192) scale(10)"><path d="M13 18H17Q20 18 20 21V43Q20 46 17 46H13Q10 46 10 43V21Q10 18 13 18ZM22 23H25V41H22Q20 41 20 39V25Q20 23 22 23ZM24 29H40V35H24ZM39 23H42Q44 23 44 25V39Q44 41 42 41H39ZM47 18H51Q54 18 54 21V43Q54 46 51 46H47Q44 46 44 43V21Q44 18 47 18Z" fill="#d6e66b" /></g>
          </svg>
        </div>
      </section>
    </div>
  );
}
