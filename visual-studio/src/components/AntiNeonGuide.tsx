import React, { useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import { MANIM_PALETTE } from '../constants/manimPalette';

const UNIVERSAL_MANIM_SYSTEM_PROMPT = `Follow the browser-use/manim-video skill pipeline (Manim Community Edition / 3Blue1Brown style) with these strict rules:
1. ZERO NEON GLOW: Never set ctx.shadowBlur > 0, never use CSS drop-shadow/blur filters, and never use radial gradient light blooms. Every line and curve must be a crisp, flat-shaded anti-aliased vector path.
2. PURE BLACK & MANIMCE PALETTE: Background must be #000000. Restrict all strokes and fills to the Manim Community palette: WHITE (#ECECEC), BLUE_C (#58C4DD), TEAL_C (#5CD0B3), YELLOW_C (#FFFF00), RED_C (#FC6255), GREEN_C (#83C167), and GREY_C (#888888).
3. SCENE PLANNING & SAFE FRAME BOUNDS (references/scene-planning.md): Keep all Mobjects within the 14.22 x 8.0 Manim coordinate grid with buff >= 0.45 from screen edges. Explicitly FadeOut or ReplacementTransform old labels before introducing new Mobjects in the same zone to prevent overlaps.
4. VALUETRACKER & ALWAYS_REDRAW (references/graphs-and-data.md): Drive continuous variables, counters, and curve-riding dots via ValueTracker + always_redraw mapped through axes.c2p(x, f(x)).
5. MOVINGCAMERASCENE (references/camera-and-3d.md): Save camera state with self.camera.frame.save_state() and interpolate pans/zooms using Manim's C2-continuous smooth(t) polynomial: s(t) = t^3 * (10 - 15*t + 6*t^2).`;

export const AntiNeonGuide: React.FC = () => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showRefImage, setShowRefImage] = useState(false);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(UNIVERSAL_MANIM_SYSTEM_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <section id="style-rules" className="border-t border-[#1D2432] pt-10 mt-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-[#58C4DD] font-mono-tabular mb-1">
            browser-use/manim-video Skill Architecture · Zero-Neon Vector Specification
          </p>
          <h2 className="text-2xl font-semibold text-[#ECECEC] tracking-tight">
            How <code className="font-mono-tabular text-[#58C4DD] text-xl">manim-video</code> Rules Eliminate AI &ldquo;Neon Slop&rdquo;
          </h2>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowRefImage(!showRefImage)}
            className="px-3.5 py-2 text-xs font-medium text-[#ECECEC] bg-[#141923] hover:bg-[#1C2331] border border-[#262F40] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#58C4DD]" />
            {showRefImage ? 'Hide Uploaded Spec Image' : 'View Uploaded Spec Image'}
          </button>
          <button
            onClick={handleCopyPrompt}
            className="px-4 py-2 text-xs font-medium text-black bg-[#58C4DD] hover:bg-[#76D1E6] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedPrompt ? 'Copied manim-video Prompt' : 'Copy manim-video System Prompt'}
          </button>
        </div>
      </div>

      {showRefImage && (
        <div className="mb-6 p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg flex flex-col md:flex-row items-center gap-6">
          <img
            src="/assets/aistudio/image_595abd57.png"
            alt="Uploaded Manim MovingCameraScene Explainer Specification"
            referrerPolicy="no-referrer"
            className="max-h-36 rounded border border-[#2A3447] bg-white object-contain shrink-0"
          />
          <div className="text-sm text-[#BBBBBB] space-y-1.5">
            <div className="text-[#ECECEC] font-medium">
              Your Reference Specification (Implemented in Scene 01 above)
            </div>
            <p className="text-xs leading-relaxed text-[#9BA3B4]">
              Every beat from your specification is wired into the interactive stage: the question{' '}
              <span className="text-[#ECECEC] font-math italic">Writes</span> on and{' '}
              <span className="text-[#ECECEC] font-math italic">Transforms</span> into the header, the neural net{' '}
              <span className="text-[#58C4DD]">Creates</span> with blue/red weight-sign edges, 28×28 pixel matrices fly
              into the input layer while the counter climbs, a forward pass runs as{' '}
              <span className="text-[#FFFF00]">ShowPassingFlash</span>, the wrong &ldquo;dog?&rdquo; gets a red{' '}
              <span className="text-[#FC6255]">SurroundingRectangle</span>, and the camera smoothly pans to the loss
              curve before transforming into <span className="text-[#83C167]">97.4% Accuracy</span>.
            </p>
          </div>
        </div>
      )}

      {/* 4-Card Reference Mapping from browser-use/manim-video */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg space-y-1.5">
          <div className="text-xs font-mono-tabular text-[#58C4DD]">references/scene-planning.md</div>
          <div className="text-sm font-semibold text-[#ECECEC]">Safe Frame &amp; Zero Overlap</div>
          <p className="text-xs text-[#9BA3B4] leading-relaxed">
            Enforces Manim&apos;s <code className="font-mono-tabular text-[#ECECEC]">14.22 × 8.0</code> coordinate frame
            with <code className="font-mono-tabular text-[#ECECEC]">buff &gt;= 0.45</code> and explicit{' '}
            <code className="font-mono-tabular text-[#ECECEC]">ReplacementTransform</code> /{' '}
            <code className="font-mono-tabular text-[#ECECEC]">FadeOut</code> cleanup between beats.
          </p>
        </div>

        <div className="p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg space-y-1.5">
          <div className="text-xs font-mono-tabular text-[#5CD0B3]">references/camera-and-3d.md</div>
          <div className="text-sm font-semibold text-[#ECECEC]">MovingCameraScene State</div>
          <p className="text-xs text-[#9BA3B4] leading-relaxed">
            Uses <code className="font-mono-tabular text-[#ECECEC]">self.camera.frame.save_state()</code>,{' '}
            <code className="font-mono-tabular text-[#ECECEC]">.animate.move_to().set(width=...)</code>, and{' '}
            <code className="font-mono-tabular text-[#ECECEC]">Restore()</code> with{' '}
            <code className="font-mono-tabular text-[#ECECEC]">rate_func=smooth</code>.
          </p>
        </div>

        <div className="p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg space-y-1.5">
          <div className="text-xs font-mono-tabular text-[#FFFF00]">references/graphs-and-data.md</div>
          <div className="text-sm font-semibold text-[#ECECEC]">ValueTracker &amp; axes.c2p()</div>
          <p className="text-xs text-[#9BA3B4] leading-relaxed">
            Binds dynamic numbers and curve-following dots via{' '}
            <code className="font-mono-tabular text-[#ECECEC]">ValueTracker</code> +{' '}
            <code className="font-mono-tabular text-[#ECECEC]">always_redraw</code> mapped through{' '}
            <code className="font-mono-tabular text-[#ECECEC]">axes.c2p(x, f(x))</code>.
          </p>
        </div>

        <div className="p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg space-y-1.5">
          <div className="text-xs font-mono-tabular text-[#83C167]">references/rendering.md</div>
          <div className="text-sm font-semibold text-[#ECECEC]">Dual Execution Target</div>
          <p className="text-xs text-[#9BA3B4] leading-relaxed">
            Since browser sandboxes lack local LaTeX/FFmpeg binaries, the canvas mirrors ManimCE geometry at 60fps while
            outputting ready-to-run <code className="font-mono-tabular text-[#ECECEC]">manim -pqh</code> Python code.
          </p>
        </div>
      </div>

      {/* Side-by-Side Technical Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Left: What to Ban (Neon Slop) */}
        <div className="p-6 bg-[#0D1118] border border-[#222A3A] rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-[#FC6255]">
              ✗ Generic AI &ldquo;Neon Glow&rdquo; Defaults (What to Ban)
            </span>
            <span className="text-xs font-mono-tabular text-[#888888]">ctx.shadowBlur &gt; 0</span>
          </div>

          {/* Visual Mini-Sample of Neon vs Crisp */}
          <div className="h-28 bg-[#050510] rounded border border-[#1E2433] mb-4 flex items-center justify-around px-6 relative overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 400 100">
              <defs>
                <filter id="badNeonGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d="M 20 80 Q 100 10, 180 65 T 360 25"
                fill="none"
                stroke="#00FFFF"
                strokeWidth="4"
                filter="url(#badNeonGlow)"
              />
              <circle cx="180" cy="65" r="8" fill="#FF00FF" filter="url(#badNeonGlow)" />
              <text x="20" y="28" fill="#00FFFF" fontSize="13" fontFamily="sans-serif" filter="url(#badNeonGlow)">
                BLOOM + CYBERPUNK SANS (BLURRY GEOMETRY)
              </text>
            </svg>
          </div>

          <ul className="space-y-2.5 text-xs text-[#9BA3B4] leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="text-[#FC6255] font-mono-tabular shrink-0">01.</span>
              <span>
                <strong className="text-[#ECECEC]">Canvas Shadow Bloom:</strong> AI models habitually inject{' '}
                <code className="text-[#FC6255] font-mono-tabular">ctx.shadowBlur = 15</code> and{' '}
                <code className="text-[#FC6255] font-mono-tabular">globalCompositeOperation = &apos;lighter&apos;</code>,
                which destroys mathematical intersections and tick marks.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#FC6255] font-mono-tabular shrink-0">02.</span>
              <span>
                <strong className="text-[#ECECEC]">Saturated Cyan/Magenta Palette:</strong> Raw RGB{' '}
                <code className="text-[#FC6255] font-mono-tabular">#00FFFF</code> and{' '}
                <code className="text-[#FC6255] font-mono-tabular">#FF00FF</code> clash with dark backgrounds and obscure
                subtle weight encodings.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#FC6255] font-mono-tabular shrink-0">03.</span>
              <span>
                <strong className="text-[#ECECEC]">Sans-Serif UI Labels &amp; Linear Camera Pans:</strong> Abrupt linear{' '}
                <code className="text-[#FC6255] font-mono-tabular">lerp</code> camera cuts and generic sans-serif math
                variables break the 3Blue1Brown visual illusion.
              </span>
            </li>
          </ul>
        </div>

        {/* Right: Authentic Manim Geometry */}
        <div className="p-6 bg-[#0D1118] border border-[#222A3A] rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-[#83C167]">
              ✓ Authentic 3Blue1Brown Manim Vector Architecture
            </span>
            <span className="text-xs font-mono-tabular text-[#58C4DD]">ctx.shadowBlur = 0</span>
          </div>

          {/* Crisp Manim Vector Sample */}
          <div className="h-28 bg-black rounded border border-[#262F40] mb-4 flex items-center justify-around px-6 relative overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 400 100">
              {/* Ticked axes */}
              <line x1="25" y1="82" x2="375" y2="82" stroke="#888888" strokeWidth="1.8" />
              <line x1="25" y1="88" x2="25" y2="14" stroke="#888888" strokeWidth="1.8" />
              <line x1="100" y1="78" x2="100" y2="86" stroke="#888888" strokeWidth="1.5" />
              <line x1="180" y1="78" x2="180" y2="86" stroke="#888888" strokeWidth="1.5" />
              <line x1="260" y1="78" x2="260" y2="86" stroke="#888888" strokeWidth="1.5" />
              {/* Crisp Manim BLUE_C curve */}
              <path
                d="M 25 74 C 95 72, 135 22, 205 46 C 265 66, 310 18, 365 22"
                fill="none"
                stroke="#58C4DD"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              {/* Tangent arrow & YELLOW_C dot */}
              <line x1="205" y1="46" x2="255" y2="62" stroke="#FFFF00" strokeWidth="2" />
              <polygon points="262,64 251,57 253,61 249,64" fill="#FFFF00" />
              <circle cx="205" cy="46" r="5" fill="#FFFF00" stroke="#000000" strokeWidth="1.5" />
              {/* SurroundingRectangle & LaTeX serif */}
              <rect x="42" y="12" width="128" height="26" fill="none" stroke="#FC6255" strokeWidth="1.8" />
              <text x="52" y="29" fill="#ECECEC" fontSize="15" fontFamily="Lora, Georgia, serif" fontStyle="italic">
                L(w) = ½(ŷ − y)²
              </text>
            </svg>
          </div>

          <ul className="space-y-2.5 text-xs text-[#9BA3B4] leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="text-[#58C4DD] font-mono-tabular shrink-0">01.</span>
              <span>
                <strong className="text-[#ECECEC]">Flat Anti-Aliased Vector Strokes:</strong> Pure{' '}
                <code className="text-[#58C4DD] font-mono-tabular">#000000</code> background with crisp{' '}
                <code className="text-[#58C4DD] font-mono-tabular">1.8px–3.0px</code> strokes and filled black circle
                interiors so edges terminate cleanly at node boundaries.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#58C4DD] font-mono-tabular shrink-0">02.</span>
              <span>
                <strong className="text-[#ECECEC]">Restrained Manim Palette:</strong> Semantic encoding using{' '}
                <span className="text-[#58C4DD]">BLUE_C (#58C4DD)</span>,{' '}
                <span className="text-[#5CD0B3]">TEAL_C (#5CD0B3)</span>,{' '}
                <span className="text-[#FFFF00]">YELLOW_C (#FFFF00)</span>,{' '}
                <span className="text-[#FC6255]">RED_C (#FC6255)</span>, and{' '}
                <span className="text-[#83C167]">GREEN_C (#83C167)</span>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#58C4DD] font-mono-tabular shrink-0">03.</span>
              <span>
                <strong className="text-[#ECECEC]">C² Smooth MovingCameraScene:</strong> Every camera pan and{' '}
                <code className="text-[#58C4DD] font-mono-tabular">Transform</code> uses{' '}
                <span className="font-math italic text-[#ECECEC]">s(t) = 10t³ − 15t⁴ + 6t⁵</span> for zero-jerk
                acceleration and deceleration.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Official Manim Color Swatches Bar */}
      <div className="p-4 bg-[#0D1118] border border-[#222A3A] rounded-lg flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs font-medium text-[#ECECEC]">
          Manim Community Palette Constants (<code className="font-mono-tabular text-[#58C4DD]">manim.utils.color</code>)
        </div>
        <div className="flex flex-wrap items-center gap-5 text-xs font-mono-tabular">
          {[
            { name: 'BLUE_C', hex: MANIM_PALETTE.BLUE_C },
            { name: 'TEAL_C', hex: MANIM_PALETTE.TEAL_C },
            { name: 'YELLOW_C', hex: MANIM_PALETTE.YELLOW_C },
            { name: 'RED_C', hex: MANIM_PALETTE.RED_C },
            { name: 'GREEN_C', hex: MANIM_PALETTE.GREEN_C },
            { name: 'WHITE', hex: MANIM_PALETTE.WHITE },
            { name: 'GREY_C', hex: MANIM_PALETTE.GREY_C },
          ].map((sw) => (
            <div key={sw.name} className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                style={{ backgroundColor: sw.hex }}
              />
              <span className="text-[#ECECEC]">{sw.name}</span>
              <span className="text-[#888888]">{sw.hex}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
