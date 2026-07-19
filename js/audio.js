/*
  使用 Web Audio API 產生簡單音效，不需要外部音檔。
  瀏覽器通常需要玩家先點擊畫面後才允許播放聲音。
*/
window.TEA_SOUND = (() => {
  let audioContext = null;
  let enabled = true;

  function getContext() {
    if (!enabled || !window.AudioContext && !window.webkitAudioContext) {
      return null;
    }

    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    return audioContext;
  }

  function tone(frequency, duration, options = {}) {
    const context = getContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startTime = context.currentTime + (options.delay || 0);
    const endTime = startTime + duration;

    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.055, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.03);
  }

  function play(name) {
    if (!enabled) return;

    if (name === "start") {
      tone(520, 0.08, { type: "triangle", volume: 0.045 });
      tone(780, 0.1, { type: "triangle", delay: 0.08, volume: 0.045 });
      return;
    }

    if (name === "correct") {
      tone(660, 0.06, { type: "sine", volume: 0.05 });
      tone(920, 0.1, { type: "sine", delay: 0.055, volume: 0.052 });
      return;
    }

    if (name === "wrong") {
      tone(210, 0.12, { type: "sawtooth", volume: 0.035 });
      return;
    }

    if (name === "card") {
      tone(460, 0.07, { type: "triangle", volume: 0.035 });
      return;
    }

    if (name === "finish") {
      tone(520, 0.08, { type: "triangle", volume: 0.045 });
      tone(690, 0.09, { type: "triangle", delay: 0.08, volume: 0.045 });
      tone(880, 0.13, { type: "triangle", delay: 0.17, volume: 0.045 });
    }
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) getContext();
    return enabled;
  }

  return {
    play,
    toggle,
    prime: getContext,
    isEnabled: () => enabled
  };
})();
