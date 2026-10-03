import { useEffect, useRef, useState } from 'react';
import { GREETING, initialState, respond } from '../assistant/respond.js';
import { useSpeechInput } from './useSpeechInput.js';
import { useSpeechOutput } from './useSpeechOutput.js';

const SUGGESTIONS = ["What's due tomorrow?", 'Show orders', 'Help'];

// A floating chat where orders can be added, cancelled and looked up in plain words.
export default function ChatBox() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ from: 'bot', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const chat = useRef(initialState);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Daniel reads each of his replies aloud.
  const voice = useSpeechOutput();
  const greeted = useRef(false);
  const say = (text, error = false) => {
    setMessages((m) => [...m, { from: 'bot', text, error }]);
    voice.speak(text);
  };

  // Spoken words appear in the box as she talks and are sent when she stops.
  const speech = useSpeechInput({
    onInterim: setInput,
    onFinal: (text) => send(text),
    onError: (text) => say(text, true),
  });

  function openChat() {
    setOpen(true);
    // Greet out loud the first time; opening is a click, so the browser allows audio.
    if (!greeted.current) {
      greeted.current = true;
      voice.speak(GREETING);
    }
  }

  function close() {
    speech.stop();
    voice.stop();
    setOpen(false);
    toggleRef.current?.focus();
  }

  function listen() {
    voice.stop(); // so the microphone doesn't hear Daniel talking
    speech.start();
  }

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    voice.stop();
    setInput('');
    setMessages((m) => [...m, { from: 'me', text: message }]);
    setBusy(true);
    try {
      const { reply, state } = await respond(message, chat.current);
      chat.current = state;
      say(reply);
    } catch (err) {
      say(`Oh dear, something went wrong: ${err.message}`, true);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {open && (
        <section
          id="chatbox"
          className="chatbox"
          role="dialog"
          aria-label="Chat with Daniel"
          onKeyDown={(e) => e.key === 'Escape' && close()}
        >
          <header className="chatbox-header">
            <strong>Chat with Daniel</strong>
            <span className="spacer" />
            {voice.supported && (
              <button
                type="button"
                className="secondary"
                onClick={voice.toggle}
                aria-pressed={voice.enabled}
                title={voice.enabled ? 'Daniel reads his replies aloud. Click to turn off.' : 'Click to have Daniel read his replies aloud.'}
              >
                {voice.enabled ? '🔊 Voice on' : '🔇 Voice off'}
              </button>
            )}
            <button type="button" className="secondary" onClick={close} aria-label="Close chat">✕</button>
          </header>
          <div className="chatbox-log" ref={logRef} role="log" aria-live="polite">
            {messages.map((m, i) => (
              <p key={i} className={`bubble ${m.from}${m.error ? ' error' : ''}`}>
                <span className="visually-hidden">{m.from === 'me' ? 'You: ' : 'Daniel: '}</span>
                {m.text}
              </p>
            ))}
            {busy && <p className="bubble bot muted">Working on it…</p>}
          </div>
          <div className="chatbox-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="secondary" onClick={() => send(s)} disabled={busy}>{s}</button>
            ))}
          </div>
          <form className="chatbox-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={speech.listening ? 'Listening… speak now' : 'e.g. Add 4 muffins for Sarah tomorrow at 2pm'}
              aria-label="Message"
              autoComplete="off"
            />
            {speech.supported && (
              <button
                type="button"
                className={`secondary mic${speech.listening ? ' listening' : ''}`}
                onClick={speech.listening ? speech.stop : listen}
                disabled={busy}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? 'Stop listening' : 'Speak your message'}
                title={speech.listening ? 'Stop listening' : 'Speak your message'}
              >
                {speech.listening ? '■' : '🎤'}
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="chatbox-toggle"
        aria-expanded={open}
        aria-controls="chatbox"
        onClick={() => (open ? close() : openChat())}
      >
        {open ? 'Close chat' : '💬 Ask Daniel'}
      </button>
    </>
  );
}
