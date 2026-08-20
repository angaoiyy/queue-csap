function formatQueueNumber(queueNumber: string): string {
  return queueNumber.split("").join(", ");
}

// Drop a file at public/chime.mp3 (or .wav/.ogg) to use a custom sound.
// Falls back to a generated two-tone beep if the file is missing.
const CHIME_SRC = "/chime.mp3";

let chimeAudio: HTMLAudioElement | null = null;
let chimeAudioFailed = false;

function playCustomChime(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || chimeAudioFailed) {
      resolve(false);
      return;
    }

    if (!chimeAudio) {
      chimeAudio = new Audio(CHIME_SRC);
    }
    const audio = chimeAudio;

    const onEnded = () => {
      cleanup();
      resolve(true);
    };
    const onError = () => {
      chimeAudioFailed = true;
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    audio.currentTime = 0;
    audio.play().catch(() => {
      chimeAudioFailed = true;
      cleanup();
      resolve(false);
    });
  });
}

// A fresh AudioContext created outside a user gesture starts "suspended" and
// never produces sound. We create ONE context during the tap-to-enable
// gesture (see unlockSpeech) and reuse/resume it for every later chime.
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContextCtor();
  }
  return sharedAudioCtx;
}

async function playChime(): Promise<void> {
  const playedCustom = await playCustomChime();
  if (playedCustom) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  return new Promise((resolve) => {
    const notes = [880, 1108.73];
    const noteDuration = 0.22;
    const gap = 0.05;

    notes.forEach((freq, i) => {
      const startAt = ctx.currentTime + i * (noteDuration + gap);
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, startAt);

      gainNode.gain.setValueAtTime(0, startAt);
      gainNode.gain.linearRampToValueAtTime(0.3, startAt + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, startAt + noteDuration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(startAt);
      oscillator.stop(startAt + noteDuration);
    });

    const totalDuration = notes.length * (noteDuration + gap);
    window.setTimeout(() => {
      resolve();
    }, totalDuration * 1000);
  });
}

// Chrome silently drops queued utterances if the SpeechSynthesisUtterance
// objects get garbage-collected before they finish, so we keep live
// references and chain them with onend instead of firing speak() 3-4x in a row.
function speakSequence(texts: string[], rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const queue = texts.filter(Boolean);
    if (queue.length === 0) {
      resolve();
      return;
    }

    const speakNext = (index: number) => {
      if (index >= queue.length) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(queue[index]);
      utterance.rate = rate;
      utterance.onend = () => speakNext(index + 1);
      utterance.onerror = () => speakNext(index + 1);
      window.speechSynthesis.speak(utterance);
    };

    speakNext(0);
  });
}

export async function speakNowServing(
  queueNumber: string,
  windowName: string,
  studentName?: string | null,
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  await playChime();

  window.speechSynthesis.cancel();

  const intro = "Now serving number";
  const number = formatQueueNumber(queueNumber);
  const outro = `, please proceed to ${windowName}.`;

  await speakSequence([intro], 1);
  await speakSequence([number], 1.6);
  if (studentName) await speakSequence([studentName], 1);
  await speakSequence([outro], 1);
}

export function unlockSpeech() {
  if (typeof window === "undefined") return;

  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});

  if (!chimeAudioFailed) {
    if (!chimeAudio) chimeAudio = new Audio(CHIME_SRC);
    chimeAudio.volume = 0;
    chimeAudio
      .play()
      .then(() => {
        chimeAudio?.pause();
        if (chimeAudio) {
          chimeAudio.currentTime = 0;
          chimeAudio.volume = 1;
        }
      })
      .catch(() => {
        chimeAudioFailed = true;
      });
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
}
