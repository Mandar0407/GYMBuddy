import {Dumbbell} from "lucide-react";
import "./_group.css";
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`fp-brand${compact ? ' fp-brand-compact' : ''}`} data-testid="brand-gym-buddy">
      <span className="fp-brand-mark"><Dumbbell size={compact ? 17 : 19} strokeWidth={2.5} /></span>
      <span>GYM <span>Buddy</span></span>
    </div>
  );
}

export function Current(){return <div className="fp-premium gb-current-wrap"><p className="gb-current-label">CURRENT IDENTITY · EXTRACTED FROM THE WEBSITE</p><section className="gb-current-light"><Brand compact/></section><section className="gb-current-dark"><Brand/></section><p className="gb-current-label">GENERIC DUMBBELL MARK / STANDARD TEXT LOCKUP</p></div>}
