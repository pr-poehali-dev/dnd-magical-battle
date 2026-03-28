import React, { useEffect, useState, useRef } from 'react';

interface MainMenuProps {
  onNewGame: () => void;
  onContinue: () => void;
  onPvP?: () => void;
  onLocalPvP?: () => void;
  hasSave: boolean;
}

export default function MainMenu({ onNewGame, onContinue, onPvP, onLocalPvP, hasSave }: MainMenuProps) {
  const [show, setShow] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => { setTimeout(() => setShow(true), 80); }, []);

  // ── Анимированный фон на canvas ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particles: cursed energy orbs
    const orbs = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 3 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      hue: Math.random() > 0.5 ? 200 + Math.random() * 60 : 270 + Math.random() * 40,
      alpha: Math.random() * 0.6 + 0.2,
    }));

    // Lightning bolts state
    const lightnings: { pts: { x: number; y: number }[]; life: number; maxLife: number; alpha: number }[] = [];

    const spawnLightning = () => {
      const pts: { x: number; y: number }[] = [];
      let x = Math.random() * canvas.width;
      let y = 0;
      pts.push({ x, y });
      while (y < canvas.height * 0.6) {
        x += (Math.random() - 0.5) * 80;
        y += 30 + Math.random() * 40;
        pts.push({ x, y });
      }
      lightnings.push({ pts, life: 0, maxLife: 20 + Math.random() * 20, alpha: 1 });
    };

    let nextLightning = 60;

    const draw = (t: number) => {
      const dt = t - timeRef.current;
      timeRef.current = t;
      const W = canvas.width, H = canvas.height;

      // BG
      ctx.fillStyle = '#03020d';
      ctx.fillRect(0, 0, W, H);

      // Dark gradient vignette
      const vg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
      vg.addColorStop(0, 'rgba(60,0,80,0.18)');
      vg.addColorStop(0.5, 'rgba(10,0,30,0.10)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Hex grid
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 0.5;
      const hw = 28, hh = 24;
      for (let row = -1; row < H / hh + 1; row++) {
        for (let col = -1; col < W / (hw * 1.5) + 1; col++) {
          const cx = col * hw * 1.5;
          const cy = row * hh * 2 + (col % 2 ? hh : 0);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * 60 - 30) * Math.PI / 180;
            const px = cx + hw * Math.cos(a);
            const py = cy + hh * Math.sin(a);
            if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();

      // Glow blobs
      const ts = t * 0.001;
      const blobs = [
        { x: W * 0.15, y: H * 0.25, r: W * 0.2, hue: 220, s: Math.sin(ts * 0.7) },
        { x: W * 0.85, y: H * 0.35, r: W * 0.18, hue: 280, s: Math.sin(ts * 0.9 + 1) },
        { x: W * 0.5,  y: H * 0.7,  r: W * 0.25, hue: 250, s: Math.sin(ts * 0.5 + 2) },
        { x: W * 0.3,  y: H * 0.8,  r: W * 0.15, hue: 0,   s: Math.sin(ts * 0.6 + 3) },
      ];
      blobs.forEach(b => {
        const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * (0.85 + b.s * 0.1));
        rg.addColorStop(0, `hsla(${b.hue},80%,55%,0.10)`);
        rg.addColorStop(1, `hsla(${b.hue},80%,40%,0.00)`);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      });

      // Orbs
      orbs.forEach(o => {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < 0) o.x = W;
        if (o.x > W) o.x = 0;
        if (o.y < 0) o.y = H;
        if (o.y > H) o.y = 0;
        ctx.save();
        ctx.globalAlpha = o.alpha * (0.7 + 0.3 * Math.sin(t * 0.002 + o.x));
        const rg2 = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 4);
        rg2.addColorStop(0, `hsl(${o.hue},100%,90%)`);
        rg2.addColorStop(0.4, `hsl(${o.hue},100%,60%)`);
        rg2.addColorStop(1, `hsl(${o.hue},100%,40%,0)`);
        ctx.fillStyle = rg2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Lightnings
      nextLightning--;
      if (nextLightning <= 0) {
        spawnLightning();
        nextLightning = 80 + Math.random() * 120;
      }
      for (let i = lightnings.length - 1; i >= 0; i--) {
        const l = lightnings[i];
        l.life++;
        if (l.life > l.maxLife) { lightnings.splice(i, 1); continue; }
        const lifeRatio = l.life / l.maxLife;
        const fade = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1 - (lifeRatio - 0.3) / 0.7;
        ctx.save();
        ctx.globalAlpha = fade * 0.7;
        ctx.strokeStyle = `hsl(${200 + Math.random() * 80},100%,85%)`;
        ctx.lineWidth = 1.2 * fade;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#a5f3fc';
        ctx.beginPath();
        l.pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.restore();
      }

      // Scan lines
      ctx.save();
      ctx.globalAlpha = 0.03;
      for (let sy = 0; sy < H; sy += 4) {
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(0, sy, W, 2);
      }
      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Main content */}
      <div
        className="relative z-10 flex flex-col items-center gap-8"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(40px)',
          transition: 'all 1s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Logo */}
        <div className="text-center mb-2 select-none">
          <div
            className="text-8xl mb-3"
            style={{ filter: 'drop-shadow(0 0 24px #a855f7) drop-shadow(0 0 48px #7c3aed)', animation: 'logoFloat 4s ease-in-out infinite alternate' }}
          >⛩️</div>
          <h1
            className="font-title text-7xl font-black text-white tracking-wider mb-2"
            style={{ textShadow: '0 0 20px #a855f7, 0 0 50px #7c3aed, 0 0 100px #4f1fa0', letterSpacing: '0.08em' }}
          >
            呪術廻戦
          </h1>
          <div
            className="font-title text-3xl font-bold tracking-[0.4em] uppercase"
            style={{ color: '#c084fc', textShadow: '0 0 16px #a855f780', letterSpacing: '0.45em' }}
          >
            Jujutsu Chronicles
          </div>
          <div className="text-cyan-400/80 text-sm tracking-[0.3em] mt-2 font-mono uppercase">
            — Пошаговая РПГ —
          </div>
        </div>

        {/* Grade badges */}
        <div className="flex gap-2 mb-1">
          {([['S','#ff0040'],['A','#ff6b35'],['B','#ffd700'],['C','#00d4ff'],['D','#8888aa']] as [string,string][]).map(([g, clr], i) => (
            <div
              key={g}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black border"
              style={{
                borderColor: clr,
                color: clr,
                boxShadow: `0 0 10px ${clr}50, inset 0 0 8px ${clr}10`,
                animation: `gradeGlow ${1.2 + i * 0.25}s ease-in-out infinite alternate`,
                background: `${clr}08`,
              }}
            >{g}</div>
          ))}
        </div>

        {/* Menu buttons */}
        <div className="flex flex-col gap-3 w-80">
          <MenuBtn
            onClick={onNewGame}
            gradient="from-violet-900/90 to-purple-900/90"
            border="#9333ea"
            glow="#7c3aed"
            icon="⚔️"
            label="НОВАЯ ИГРА"
          />

          {hasSave && (
            <MenuBtn onClick={onContinue} gradient="from-blue-900/90 to-cyan-900/90" border="#06b6d4" glow="#0891b2" icon="▶" label="ПРОДОЛЖИТЬ" />
          )}

          {onLocalPvP && (
            <MenuBtn onClick={onLocalPvP} gradient="from-cyan-900/90 to-teal-900/90" border="#06b6d4" glow="#0e7490" icon="👥" label="МУЛЬТИПЛЕЕР (2 ИГРОКА)" />
          )}

          {onPvP && (
            <MenuBtn onClick={onPvP} gradient="from-red-900/90 to-rose-900/90" border="#ef4444" glow="#b91c1c" icon="🤖" label="PLAYER VS BOT" />
          )}
        </div>

        <div className="text-center text-purple-600/50 text-xs font-mono tracking-widest mt-4">
          Выбери своего чародея. Уничтожь проклятия.<br />
          Стань сильнейшим — или умри.
        </div>

        <div className="text-center text-purple-900/60 text-xs font-mono mt-2">
          JJK Chronicles v1.0 · Based on Jujutsu Kaisen by Gege Akutami
        </div>
      </div>

      <style>{`
        @keyframes logoFloat {
          from { transform: translateY(0px) scale(1); }
          to   { transform: translateY(-10px) scale(1.05); }
        }
        @keyframes gradeGlow {
          from { opacity: 0.7; transform: scale(0.97); }
          to   { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes btnShimmer {
          0%   { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(300%) skewX(-20deg); }
        }
      `}</style>
    </div>
  );
}

function MenuBtn({
  onClick, gradient, border, glow, icon, label,
}: {
  onClick: () => void;
  gradient: string;
  border: string;
  glow: string;
  icon: string;
  label: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative py-4 px-6 bg-gradient-to-r ${gradient} rounded-xl font-title font-bold text-white text-base tracking-widest overflow-hidden transition-all duration-300`}
      style={{
        border: `1px solid ${border}`,
        boxShadow: hover ? `0 0 30px ${glow}70, 0 0 60px ${glow}30` : `0 0 12px ${glow}30`,
        transform: hover ? 'scale(1.025) translateY(-1px)' : 'scale(1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {hover && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${glow}30 50%, transparent 100%)`,
            animation: 'btnShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}