import { useEffect, useRef, useState } from 'react';

// Soft wedding music, off until the visitor presses the button; then it loops until they mute it.
// Track: "Canon in D Major" by Kevin MacLeod (incompetech.com), CC BY 3.0 — credited in the footer.
const VOLUME = 0.3;
const VOLUME_WHILE_DANIEL_TALKS = 0.06;

export default function BackgroundMusic() {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Turn the music down while Daniel is speaking so he can be heard.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      const talking = window.speechSynthesis?.speaking;
      if (audio.current) audio.current.volume = talking ? VOLUME_WHILE_DANIEL_TALKS : VOLUME;
    }, 250);
    return () => clearInterval(timer);
  }, [playing]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.volume = VOLUME;
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  };

  return (
    <>
      <audio ref={audio} src="/music/canon-in-d.mp3" loop preload="none" />
      <button
        type="button"
        className={`music-toggle${playing ? '' : ' off'}`}
        onClick={toggle}
        aria-pressed={playing}
        title={playing ? 'Mute the music' : 'Play wedding music'}
      >
        {playing ? '💞 Mute' : '💗 Unmute'}
      </button>
    </>
  );
}
