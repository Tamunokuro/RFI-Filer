/**
 * SplashScreen
 * -------------
 * Shown once on every cold page load before the login screen.
 *
 * Animation timeline
 * ------------------
 *   0 ms   Logo icon + wordmark scale in
 * 800 ms   RFI card slides up
 * 1050 ms  Skeleton lines fade in
 * 1700 ms  Green circle draws itself (SVG stroke)
 * 2150 ms  Checkmark path draws + resolved bar appears
 * 3500 ms  Whole screen fades out (1 s)
 * 4500 ms  onDone() called → login renders
 */

import { useEffect, useState } from "react";

const TOTAL_MS = 4500;

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0);
  //  0 = logo only
  //  1 = card + skeleton lines visible
  //  2 = checkmark drawing
  //  3 = fading out

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1),  800),
      setTimeout(() => setPhase(2), 1700),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(onDone,            TOTAL_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes ss-logo-in {
          from { opacity: 0; transform: scale(0.88) translateY(-12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);     }
        }
        @keyframes ss-card-in {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes ss-item-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes ss-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ss-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes draw-circle {
          from { stroke-dashoffset: 63; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes draw-check {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0);    opacity: .35; }
          40%            { transform: translateY(-6px); opacity: 1;   }
        }
        @keyframes shimmer {
          from { background-position: -200% center; }
          to   { background-position:  200% center; }
        }

        /* Light-mode shimmer bar */
        .ss-line {
          border-radius: 999px;
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }

        /* Dark-mode shimmer bar */
        .dark .ss-line {
          background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}</style>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center
                   bg-slate-100 dark:bg-gray-950 select-none"
        style={phase === 3 ? { animation: "ss-out 1s ease-in-out forwards" } : undefined}
      >

        {/* ── Logo + wordmark ───────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center mb-10"
          style={{ animation: "ss-logo-in 0.6s cubic-bezier(.22,.68,0,1.2) both" }}
        >
          <div className="w-20 h-20 rounded-2xl shadow-xl mb-5 flex items-center justify-center
                          bg-gradient-to-br from-blue-800 to-indigo-900">
            <svg className="w-11 h-11 text-white" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                   M9 5a2 2 0 002 2h2a2 2 0 002-2
                   M9 5a2 2 0 012-2h2a2 2 0 012 2
                   m-6 9l2 2 4-4" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-blue-950 dark:text-indigo-200">
            RFI Filer
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Construction RFI Management
          </p>
        </div>

        {/* ── Animated RFI card ─────────────────────────────────────────── */}
        {phase >= 1 && (
          <div
            className="w-80 rounded-xl bg-white dark:bg-gray-800 shadow-lg px-5 py-4"
            style={{ animation: "ss-card-in 0.5s cubic-bezier(.22,.68,0,1.15) both" }}
          >
            {/* ── Meta row — two skeleton pills ── */}
            <div
              className="flex items-center gap-2 mb-4"
              style={{ animation: "ss-item-in 0.35s ease-out 0.1s both" }}
            >
              {/* Badge slot — matches the indigo pill shape */}
              <div className="ss-line h-5 w-14" />
              {/* Discipline label slot */}
              <div className="ss-line h-3.5 w-20" />
            </div>

            {/* ── Item row ── */}
            <div
              className="flex items-center gap-3"
              style={{ animation: "ss-item-in 0.35s ease-out 0.2s both" }}
            >
              {/* Circle / checkmark */}
              <div className="relative shrink-0 w-7 h-7">
                {phase >= 2 ? (
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-emerald-500" fill="none">
                    <circle
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="2" strokeDasharray="63"
                      style={{ animation: "draw-circle 0.42s ease-out both" }}
                    />
                    <path
                      d="M7 12.5 L10.5 16 L17 9"
                      stroke="currentColor" strokeWidth="2.4"
                      strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="20"
                      style={{ animation: "draw-check 0.3s ease-out 0.38s both" }}
                    />
                  </svg>
                ) : (
                  <div className="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600" />
                )}
              </div>

              {/* Text slot — two stacked skeleton lines */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Title line — wider */}
                <div className="ss-line h-3 w-44" />
                {/* Sub-line — narrower */}
                <div className="ss-line h-2.5 w-24" />
              </div>

              {/* Resolved slot — soft green bar fades in with the checkmark */}
              {phase >= 2 && (
                <div style={{ animation: "ss-fade-in 0.35s ease-out 0.65s both" }}>
                  <div className="h-4 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Loading dots ─────────────────────────────────────────────── */}
        <div className="mt-10 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500"
              style={{ animation: `dot-bounce 1.2s ${i * 0.2}s infinite ease-in-out` }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
