import { useEffect, useRef, useState } from 'react';

// The browser's built-in speech recognition (Web Speech API): free, no API key. Chrome, Edge and
// Safari support it; Firefox doesn't, so callers should hide the mic when `supported` is false.
const Recognition = typeof window === 'undefined' ? undefined : window.SpeechRecognition || window.webkitSpeechRecognition;

const ERRORS = {
  'not-allowed': "I can't hear you yet, dear. The browser needs your permission to use the microphone. Allow it and try again.",
  'service-not-allowed': "I can't hear you yet, dear. The browser needs your permission to use the microphone. Allow it and try again.",
  'audio-capture': "I can't find a microphone, love. Is it plugged in?",
  'no-speech': "I didn't hear anything, dear. Press the microphone and try again.",
  network: 'Talking to me needs the internet, love. You can still type to me instead.',
};

/**
 * Listens for one spoken message. Calls `onInterim(text)` with the words so far while she talks,
 * `onFinal(text)` when she stops, and `onError(message)` if listening fails.
 */
export function useSpeechInput({ onInterim, onFinal, onError }) {
  const [listening, setListening] = useState(false);
  const recognition = useRef(null);
  const handlers = useRef({});
  handlers.current = { onInterim, onFinal, onError };

  useEffect(() => () => recognition.current?.abort(), []);

  function start() {
    if (!Recognition || recognition.current) return;
    const r = new Recognition();
    r.lang = navigator.language || 'en-CA';
    r.interimResults = true;
    r.continuous = false; // stop automatically after a pause
    r.maxAlternatives = 1;

    let finalText = '';
    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const { transcript } = event.results[i][0];
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      handlers.current.onInterim?.(`${finalText}${interim}`.trim());
    };
    r.onerror = (event) => {
      if (event.error !== 'aborted') handlers.current.onError?.(ERRORS[event.error] ?? "Sorry, dear, I couldn't make that out. Try again, or type it to me.");
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
      if (finalText.trim()) handlers.current.onFinal?.(finalText.trim());
    };

    recognition.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      recognition.current = null;
      setListening(false);
      handlers.current.onError?.("Oh dear, the microphone wouldn't start. Try again in a moment.");
    }
  }

  const stop = () => recognition.current?.stop();

  return { supported: Boolean(Recognition), listening, start, stop };
}
