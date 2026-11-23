import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer, X } from 'lucide-react';
import type { TodoItem } from '../../shared/types';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

const MODE_CONFIG: Record<TimerMode, { label: string; minutes: number }> = {
  focus: { label: '집중 25분', minutes: 25 },
  shortBreak: { label: '짧은 휴식 5분', minutes: 5 },
  longBreak: { label: '긴 휴식 15분', minutes: 15 },
};

interface PomodoroWidgetProps {
  activeTodo: TodoItem | null;
  onCompleteFocusSession: (todo: TodoItem | null, minutes: number) => void;
  onClose: () => void;
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.48);
    });
  } catch {
    // Audio playback blocked or unavailable
  }
}

export function PomodoroWidget({
  activeTodo,
  onCompleteFocusSession,
  onClose,
}: PomodoroWidgetProps) {
  const [mode, setMode] = useState<TimerMode>('focus');
  const [secondsLeft, setSecondsLeft] = useState(MODE_CONFIG.focus.minutes * 60);
  const [running, setRunning] = useState(false);
  const completedRef = useRef(false);

  const totalSeconds = MODE_CONFIG[mode].minutes * 60;
  const progress = Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100);

  useEffect(() => {
    if (!running) {
      document.title = 'Private Todo';
      return;
    }

    completedRef.current = false;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          setRunning(false);
          if (!completedRef.current) {
            completedRef.current = true;
            playGentleChime();
            if (mode === 'focus') {
              onCompleteFocusSession(activeTodo, MODE_CONFIG.focus.minutes);
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [running, mode, activeTodo, onCompleteFocusSession]);

  useEffect(() => {
    if (running) {
      const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const ss = String(secondsLeft % 60).padStart(2, '0');
      document.title = `${mm}:${ss} · Private Todo`;
    } else {
      document.title = 'Private Todo';
    }
    return () => {
      document.title = 'Private Todo';
    };
  }, [running, secondsLeft]);

  function handleSwitchMode(nextMode: TimerMode) {
    setMode(nextMode);
    setRunning(false);
    setSecondsLeft(MODE_CONFIG[nextMode].minutes * 60);
  }

  function handleReset() {
    setRunning(false);
    setSecondsLeft(MODE_CONFIG[mode].minutes * 60);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <aside className="pomo-dock" aria-label="뽀모도로 집중 타이머">
      <div className="pomo-header">
        <div className="pomo-title-wrap">
          <Timer size={15} className="pomo-icon" />
          <span className="pomo-task-title">
            {activeTodo ? activeTodo.title : '자유 집중 타이머'}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="타이머 닫기">
          <X size={15} />
        </button>
      </div>

      <div className="pomo-modes">
        {(['focus', 'shortBreak', 'longBreak'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`pomo-mode-btn ${mode === m ? 'is-active' : ''}`}
            onClick={() => handleSwitchMode(m)}
          >
            {MODE_CONFIG[m].label}
          </button>
        ))}
      </div>

      <div className="pomo-clock-row">
        <div className="pomo-clock">
          {mm}:{ss}
        </div>
        <div className="pomo-controls">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (secondsLeft === 0) {
                setSecondsLeft(MODE_CONFIG[mode].minutes * 60);
              }
              setRunning((prev) => !prev);
            }}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            <span>{running ? '일시정지' : '시작'}</span>
          </button>
          <button type="button" className="icon-btn" onClick={handleReset} title="초기화">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </aside>
  );
}
