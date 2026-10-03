import { useCallback, useEffect, useRef, useState } from 'react';

// Reads Daniel's replies aloud with the browser's built-in text-to-speech (free, no API key).
// Browsers don't label voices by age or gender, so we prefer known older-sounding male voices by
// name and then lower the pitch and slow the pace to sound like a grandpa.
const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
const STORAGE_KEY = 'daniel:voice';

// Best first. macOS/iOS ship a British male voice that happens to be called "Daniel".
const MALE_VOICES = [
  /\bdaniel\b/i, /\barthur\b/i, /\bgordon\b/i, /\bralph\b/i, /\bfred\b/i, /\baaron\b/i, /\balex\b/i,
  /\bgoogle uk english male\b/i, /\bmicrosoft (?:george|guy|mark|david|ryan|christopher|eric|roger|steffan)\b/i,
  /\btom\b/i, /\boliver\b/i, /\bthomas\b/i, /\bgrandpa\b/i, /\beddy\b/i, /\breed\b/i, /\brocko\b/i,
  /\bmale\b/i,
];

// Never fall back to these: they're the female voices browsers and operating systems ship.
const FEMALE_VOICES =
  /female|samantha|karen|moira|tessa|victoria|fiona|kathy|shelley|flo\b|sandy|grandma|zira|hazel|susan|aria|jenny|libby|sonia|serena|allison|ava|nicky|google us english/i;

export function pickVoice(voices) {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;
  for (const pattern of MALE_VOICES) {
    const voice = pool.find((v) => pattern.test(v.name) && !/female/i.test(v.name));
    if (voice) return { voice, male: true };
  }
  const notFemale = pool.filter((v) => !FEMALE_VOICES.test(v.name));
  return { voice: notFemale.find((v) => v.default) ?? notFemale[0] ?? null, male: false };
}

// Dates are shown short ("Sat, Oct 3"); say them in full so they don't come out as "sat, oct".
const SPOKEN = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Sept: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};
const ABBREVIATION = new RegExp(`\\b(${Object.keys(SPOKEN).join('|')})\\b\\.?(?=,?\\s+\\d|,)`, 'g');

// Turn chat text into something that sounds natural when read out.
export const forSpeech = (text) =>
  text
    .replace(ABBREVIATION, (word) => SPOKEN[word.replace('.', '')])
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/•/g, '')
    .replace(/\s×\s/g, ' ')
    .replace(/#(\d+)/g, 'number $1')
    .replace(/["“”]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export function useSpeechOutput() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const chosen = useRef({ voice: null, male: false });
  // Text asked to be spoken before the browser had loaded its voices (e.g. the greeting).
  const waiting = useRef([]);
  const speakRef = useRef(() => {});

  useEffect(() => {
    if (!synth) return undefined;
    // Voices load asynchronously in Chrome, so pick again once they arrive, then say anything
    // that was held back so it isn't read in the browser's default (often female) voice.
    const load = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) return;
      chosen.current = pickVoice(voices);
      const held = waiting.current.splice(0);
      for (const text of held) speakRef.current(text);
    };
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => {
      synth.removeEventListener?.('voiceschanged', load);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    waiting.current = [];
    synth?.cancel();
  }, []);

  const speak = useCallback((text) => {
    if (!synth || !enabledRef.current) return;
    if (!chosen.current.voice) {
      if (synth.getVoices().length === 0) {
        waiting.current = [text]; // speak once voices load; only the latest message matters
        return;
      }
      chosen.current = pickVoice(synth.getVoices());
    }
    if (synth.speaking || synth.pending) synth.cancel(); // don't talk over himself
    const { voice, male } = chosen.current;
    // One utterance per line: Chrome cuts off long utterances, and the pauses sound natural.
    for (const line of forSpeech(text)) {
      const utterance = new SpeechSynthesisUtterance(line);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.pitch = male ? 0.75 : 0.5; // deeper still if we couldn't find a male voice
      utterance.rate = 0.88; // unhurried
      synth.speak(utterance);
    }
  }, []);
  speakRef.current = speak;

  const toggle = () => {
    const next = !enabled;
    if (!next) synth?.cancel();
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Private browsing can block storage; the setting just won't be remembered.
    }
    setEnabled(next);
  };

  return { supported: Boolean(synth), enabled, speak, stop, toggle };
}
