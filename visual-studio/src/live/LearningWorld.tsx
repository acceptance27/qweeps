import {useEffect, useRef} from 'react';

/** A quiet pixel landscape for the learning workspace, painted at a low resolution. */
export default function LearningWorld() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, width = 0, height = 0;
    const random = (n: number) => { const x = Math.sin(n * 127.1 + 43.7) * 43758.5453; return x - Math.floor(x); };
    const paint = (time: number) => {
      const w = width, h = height;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#101a2a'); sky.addColorStop(.65, '#243b43'); sky.addColorStop(1, '#344c3e');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 100; i++) {
        const x = Math.floor(random(i + 1) * w), y = Math.floor(random(i + 220) * h * .57);
        ctx.fillStyle = `rgba(240,228,184,${.18 + .3 * (motion.matches ? 1 : (Math.sin(time / 1300 + i) + 1) / 2)})`;
        ctx.fillRect(x, y, i % 13 === 0 ? 2 : 1, i % 13 === 0 ? 2 : 1);
      }
      const mx = Math.floor(w * .78), my = Math.floor(h * .17);
      ctx.fillStyle = '#f0dfb0'; ctx.fillRect(mx - 5, my - 7, 10, 14); ctx.fillRect(mx - 7, my - 5, 14, 10);
      // Layered stepped silhouettes give the clearing depth without distracting from controls.
      const trees = (base: number, color: string, count: number, size: number, seed: number) => {
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
          const x = Math.floor((i / (count - 1)) * (w + 30) - 15 + random(i + seed) * 14);
          const th = Math.floor(size * (.65 + random(i + seed + 90) * .7));
          ctx.fillRect(x - 2, base - th, 4, th + 5);
          for (let tier = 0; tier < 4; tier++) {
            const tw = Math.floor((tier + 1) * th / 7);
            ctx.fillRect(x - tw, base - th + tier * th / 5, tw * 2, th / 3);
          }
        }
        ctx.fillRect(0, base, w, h - base);
      };
      trees(Math.floor(h * .77), '#263e3e', Math.ceil(w / 23), 42, 8);
      trees(Math.floor(h * .88), '#1a3432', Math.ceil(w / 30), 55, 80);
      ctx.fillStyle = '#142b29'; ctx.fillRect(0, Math.floor(h * .94), w, h);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(random(i + 540) * w), y = Math.floor(h * (.61 + random(i + 720) * .32));
        const glow = motion.matches ? .5 : .25 + .5 * (Math.sin(time / 1100 + i * 2) + 1) / 2;
        ctx.fillStyle = `rgba(230,220,135,${glow})`; ctx.fillRect(x, y + (motion.matches ? 0 : Math.round(Math.sin(time / 2000 + i) * 2)), 2, 2);
      }
    };
    const resize = () => { width = Math.ceil(window.innerWidth / 3); height = Math.ceil(window.innerHeight / 3); canvas.width = width; canvas.height = height; paint(0); };
    const tick = (now: number) => { if (!document.hidden && !motion.matches && now - last > 100) {paint(now); last = now;} frame = requestAnimationFrame(tick); };
    resize(); window.addEventListener('resize', resize); frame = requestAnimationFrame(tick);
    return () => {window.removeEventListener('resize', resize); cancelAnimationFrame(frame);};
  }, []);
  return <canvas ref={ref} className="learning-world" aria-hidden="true" />;
}
