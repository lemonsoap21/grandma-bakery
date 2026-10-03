import { useEffect, useRef, useState } from 'react';

// Soft wedding music in the background. Browsers only allow sound after the visitor interacts
// with the page, so it starts on the first click, tap or key press, unless they muted it before.
// Track: "Canon in D Major" by Kevin MacLeod (incompetech.com), CC BY 3.0 — credited in the footer.
const STORAGE_KEY = 'daniel:music';
const VOLUME = 0.3;
const VOLUME_WHILE_DANIEL_TALKS = 0.06;

export default function BackgroundMusic() {
  const audio = useRef(null);
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [playing, setPlaying] = useState(false);

  // Start on the first interaction, if music is on.
  useEffect(() => {
    if (!on || playing) return undefined;
    const start = () => {
      audio.current
        ?.play()
        .then(() => setPlaying(true))
        .catch(() => {}); // still blocked; the next interaction tries again
    };
    start(); // works right away if the browser already allows sound for this site
    const events = ['pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, start, { once: true }));
    return () => events.forEach((e) => window.removeEventListener(e, start));
  }, [on, playing]);

  // Turn the music down while Daniel is speaking so he can be heard.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      const talking = window.speechSynthesis?.speaking;
      if (audio.current) audio.current.volume = talking ? VOLUME_WHILE_DANIEL_TALKS : VOLUME;
    }, 250);
    return () => clearInterval(timer);
  }, [playing]);

  const toggle = (e) => {
    e.stopPropagation(); // don't let this click also count as the "first interaction"
    const next = !on;
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Private browsing can block storage; the choice just won't be remembered.
    }
    if (next) {
      audio.current?.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.current?.pause();
      setPlaying(false);
    }
    setOn(next);
  };

  return (
    <>
      <audio ref={audio} src="/music/canon-in-d.mp3" loop preload="auto" />
      <button
        type="button"
        className={`music-toggle${on ? '' : ' off'}`}
        onClick={toggle}
        aria-pressed={on}
        title={on ? 'Pause the music' : 'Play the music'}
        aria-label={on ? 'Pause background music' : 'Play background music'}
      >
        ♫
      </button>
    </>
  );
}
