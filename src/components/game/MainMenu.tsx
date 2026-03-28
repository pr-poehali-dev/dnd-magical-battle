import React, { useEffect, useState, useRef } from 'react';

interface MainMenuProps {
  onSimplyFight: () => void;
  hasSave?: boolean;
}

export default function MainMenu({ onSimplyFight }: MainMenuProps) {
  const [show, setShow] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => { setTimeout(() => setShow(true), 80); }, []);

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

    // Частицы: проклятая энергия
    const orbs = Array.from({ length: 55 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 3.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      hue: Math.random() > 0.5 ? 200 + Math.random() * 60 : 270 + Math.random() * 40,
      alpha: Math.random() * 0.7 + 0.2,
    }));

    // Молнии: более частые, длинные, разветвлённые
    type LightningBranch = { pts: { x: number; y: number }[] };
    type Lightning = { main: { x: number; y: number }[]; branches: LightningBranch[]; life: number; maxLife: number; alpha: number; hue: number; width: number };
    const lightnings: Lightning[] = [];

    const spawnLightning = () => {
      const main: { x: number; y: number }[] = [];
      let x = Math.random() * canvas.width;
      let y = -10;
      main.push({ x, y });
      // Более длинные молнии — проходят весь экран
      while (y < canvas.height * (0.6 + Math.random() * 0.5)) {
        x += (Math.random() - 0.5) * 100;
        y += 20 + Math.random() * 50;
        main.push({ x, y });
      }

      // Разветвления
      const branches: LightningBranch[] = [];
      const branchCount = Math.floor(Math.random() * 4) + 1;
      for (let b = 0; b < branchCount; b++) {
        const startIdx = Math.floor(Math.random() * (main.length - 2)) + 1;
        const branch: { x: number; y: number }[] = [];
        let bx = main[startIdx].x;
        let by = main[startIdx].y;
        branch.push({ x: bx, y: by });
        const branchLen = Math.floor(Math.random() * 5) + 3;
        for (let i = 0; i < branchLen; i++) {
          bx += (Math.random() - 0.5) * 80;
          by += 15 + Math.random() * 35;
          branch.push({ x: bx, y: by });
        }
        branches.push({ pts: branch });
      }

      lightnings.push({
        main, branches,
        life: 0, maxLife: 12 + Math.random() * 16,
        alpha: 1,
        hue: 190 + Math.random() * 100,
        width: 1 + Math.random() * 2,
      });
    };

    // Начальный залп молний
    for (let i = 0; i < 3; i++) spawnLightning();
    let nextLightning = 20;

    const draw = (t: number) => {
      const dt = t - timeRef.current;
      timeRef.current = t;
      const W = canvas.width, H = canvas.height;

      ctx.fillStyle = '#02010b';
      ctx.fillRect(0, 0, W, H);

      // Тёмный виньет
      const vg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
      vg.addColorStop(0, 'rgba(50,0,70,0.15)');
      vg.addColorStop(0.5, 'rgba(8,0,25,0.08)');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Hex grid
      ctx.save();
      ctx.globalAlpha = 0.035;
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 0.5;
      const hw = 28, hh = 24;
      for (let row = -1; row < H / hh + 1; row++) {
        for (let col = -1; col < W / (hw * 1.5) + 1; col++) {
          const cx2 = col * hw * 1.5;
          const cy2 = row * hh * 2 + (col % 2 ? hh : 0);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * 60 - 30) * Math.PI / 180;
            const px = cx2 + hw * Math.cos(a);
            const py = cy2 + hh * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.restore();

      // Glow blobs
      const ts = t * 0.001;
      const blobs = [
        { x: W * 0.12, y: H * 0.22, r: W * 0.22, hue: 220, s: Math.sin(ts * 0.7) },
        { x: W * 0.88, y: H * 0.32, r: W * 0.2, hue: 280, s: Math.sin(ts * 0.9 + 1) },
        { x: W * 0.5,  y: H * 0.72, r: W * 0.28, hue: 250, s: Math.sin(ts * 0.5 + 2) },
        { x: W * 0.28, y: H * 0.85, r: W * 0.18, hue: 0,   s: Math.sin(ts * 0.6 + 3) },
        { x: W * 0.72, y: H * 0.78, r: W * 0.16, hue: 160, s: Math.sin(ts * 0.8 + 4) },
      ];
      blobs.forEach(b => {
        const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * (0.85 + b.s * 0.12));
        rg.addColorStop(0, `hsla(${b.hue},85%,55%,0.12)`);
        rg.addColorStop(1, `hsla(${b.hue},85%,40%,0.00)`);
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
        const rg2 = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 5);
        rg2.addColorStop(0, `hsl(${o.hue},100%,92%)`);
        rg2.addColorStop(0.4, `hsl(${o.hue},100%,62%)`);
        rg2.addColorStop(1, `hsla(${o.hue},100%,40%,0)`);
        ctx.fillStyle = rg2;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // Молнии — ЭПИЧНЫЕ, частые, разветвлённые
      nextLightning -= dt * 0.06; // ~60fps: уменьшаем каждый кадр
      if (nextLightning <= 0) {
        const burst = Math.random() > 0.65 ? 3 : 1; // иногда залп из 3
        for (let i = 0; i < burst; i++) spawnLightning();
        nextLightning = 25 + Math.random() * 45; // чаще: каждые ~0.5-1.2 сек
      }

      for (let i = lightnings.length - 1; i >= 0; i--) {
        const l = lightnings[i];
        l.life++;
        if (l.life > l.maxLife) { lightnings.splice(i, 1); continue; }
        const lifeRatio = l.life / l.maxLife;
        const fade = lifeRatio < 0.2 ? lifeRatio / 0.2 : 1 - (lifeRatio - 0.2) / 0.8;

        // Основной разряд
        ctx.save();
        ctx.globalAlpha = fade * 0.9;
        // Внешнее свечение
        ctx.shadowBlur = 25 + Math.random() * 20;
        ctx.shadowColor = `hsl(${l.hue},100%,80%)`;
        ctx.strokeStyle = `hsl(${l.hue},100%,90%)`;
        ctx.lineWidth = l.width * fade * (0.8 + Math.random() * 0.4);
        ctx.lineCap = 'round';
        ctx.beginPath();
        l.main.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Белый центр молнии
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(255,255,255,${fade * 0.7})`;
        ctx.lineWidth = l.width * 0.3 * fade;
        ctx.beginPath();
        l.main.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Ветви
        l.branches.forEach(br => {
          ctx.globalAlpha = fade * 0.55;
          ctx.shadowBlur = 12;
          ctx.strokeStyle = `hsl(${l.hue + 20},100%,80%)`;
          ctx.lineWidth = l.width * 0.5 * fade;
          ctx.beginPath();
          br.pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();
        });
        ctx.restore();
      }

      // Scan lines
      ctx.save();
      ctx.globalAlpha = 0.025;
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
          <div className="text-cyan-400/70 text-sm tracking-[0.25em] mt-2 font-mono uppercase">
            — Пошаговая РПГ —
          </div>
        </div>

        {/* Menu button */}
        <div className="flex flex-col gap-3 w-80">
          <MenuBtn
            onClick={onSimplyFight}
            gradient="from-red-900/90 to-rose-900/90"
            border="#ef4444"
            glow="#b91c1c"
            icon="⚔"
            label="SIMPLY FIGHT"
          />
        </div>

        <div className="text-center text-purple-900/60 text-xs font-mono mt-2">
          JJK Chronicles v2.0 · Based on Jujutsu Kaisen by Gege Akutami
        </div>
      </div>

      <style>{`
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
        boxShadow: hover ? `0 0 35px ${glow}80, 0 0 70px ${glow}35` : `0 0 14px ${glow}35`,
        transform: hover ? 'scale(1.03) translateY(-2px)' : 'scale(1)',
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
            background: `linear-gradient(90deg, transparent 0%, ${glow}35 50%, transparent 100%)`,
            animation: 'btnShimmer 0.6s ease forwards',
          }}
        />
      )}
    </button>
  );
}
