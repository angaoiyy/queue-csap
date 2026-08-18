function formatQueueNumber(queueNumber: string): string {
  return queueNumber.split("").join(", ");
}

export function speakNowServing(queueNumber: string, windowName: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const intro = new SpeechSynthesisUtterance("Now serving number");
  const number = new SpeechSynthesisUtterance(formatQueueNumber(queueNumber));
  number.rate = 1.6;
  const outro = new SpeechSynthesisUtterance(
    `, please proceed to ${windowName}.`,
  );

  window.speechSynthesis.speak(intro);
  window.speechSynthesis.speak(number);
  window.speechSynthesis.speak(outro);
}

export function unlockSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}
