import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from 'ai';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { defaultApiBaseUrl } from './api-config';
import styles from './chat.page.module.scss';

type AgentStatus = { enabled: boolean; model: string | null; agents: { name: string; displayName: string }[] };

const apiBaseUrl = defaultApiBaseUrl.replace(/\/$/, '');

const SUGGESTIONS = [
  'Give me a research report on JKH',
  'How are the banking stocks doing today?',
  'What is the latest price of HNB and any recent announcements?',
  'Add COMB to my watchlist with an alert above 150, then check my alerts',
];

const AGENT_LABELS: Record<string, string> = {
  dataRetrieveAgent: 'Data Retrieve Agent',
  cseAnalyzeAgent: 'CSE Analyze Agent',
  reportAgent: 'Report Agent',
  alertWatchlistAgent: 'Alert & Watchlist Agent',
};

/** Stable anonymous id so the watchlist survives page reloads in this browser. */
function getBrowserUserId(): string {
  const fallback = 'anonymous';
  try {
    const existing = window.localStorage.getItem('sam-ai.userId');
    if (existing) return existing;
    const created = `user-${crypto.randomUUID()}`;
    window.localStorage.setItem('sam-ai.userId', created);
    return created;
  } catch {
    return fallback;
  }
}

/** Mastra exposes sub-agents as tools named like `agent-dataRetrieveAgent`. */
function describeTool(name: string): { label: string; isAgent: boolean } {
  const agentKey = name.replace(/^agent[-_]/, '');
  if (agentKey !== name || AGENT_LABELS[name]) {
    return { label: AGENT_LABELS[agentKey] ?? agentKey, isAgent: true };
  }
  return { label: name, isAgent: false };
}

function MessageParts({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          return message.role === 'user' ? (
            <p key={index} className={styles.userText}>
              {part.text}
            </p>
          ) : (
            <div key={index} className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          );
        }

        if (isToolOrDynamicToolUIPart(part)) {
          const { label, isAgent } = describeTool(getToolOrDynamicToolName(part));
          const state =
            part.state === 'output-available' ? 'done' : part.state === 'output-error' ? 'failed' : 'running';
          return (
            <div key={index} className={`${styles.toolChip} ${styles[state]}`}>
              <span className={styles.toolKind}>{isAgent ? 'agent' : 'tool'}</span>
              <span>{label}</span>
              <span className={styles.toolState}>{state === 'running' ? 'working...' : state}</span>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

export function ChatPage() {
  const userId = useMemo(getBrowserUserId, []);
  const transport = useMemo(
    () => new DefaultChatTransport({ api: `${apiBaseUrl}/chat`, headers: { 'x-user-id': userId } }),
    [userId],
  );
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({ transport });
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    fetch(`${apiBaseUrl}/agents/status`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setAgentStatus)
      .catch(() => setStatusError(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(input);
  };

  const disabled = statusError || agentStatus?.enabled === false;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>CSE research assistant</p>
          <h1>Ask about Colombo Stock Exchange stocks</h1>
        </div>
        <nav className={styles.nav}>
          <Link to="/">Home</Link>
          <Link to="/api-explorer">API explorer</Link>
        </nav>
      </header>

      {statusError && (
        <div className={styles.banner}>Cannot reach the API at {apiBaseUrl}. Is it running (npm start)?</div>
      )}
      {agentStatus?.enabled === false && (
        <div className={styles.banner}>
          The AI agents are disabled. Set <code>MASTRA_ENABLED=true</code> and <code>OPENAI_API_KEY</code> in{' '}
          <code>.env</code>, then restart the API.
        </div>
      )}
      {agentStatus?.enabled && (
        <p className={styles.meta}>
          {agentStatus.agents.length} agents online · model {agentStatus.model}
        </p>
      )}

      <main className={styles.conversation}>
        {messages.length === 0 && (
          <section className={styles.empty}>
            <p>Try one of these:</p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => submit(suggestion)} disabled={disabled}>
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`${styles.message} ${styles[message.role]}`}>
            <MessageParts message={message} />
          </article>
        ))}

        {status === 'submitted' && <div className={styles.thinking}>Thinking...</div>}

        {error && (
          <div className={styles.errorBox}>
            <span>Something went wrong: {error.message}</span>
            <button type="button" onClick={() => regenerate()}>
              Retry
            </button>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <form className={styles.composer} onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={disabled ? 'Assistant unavailable' : 'Ask about a CSE stock, e.g. "Analyse JKH"'}
          disabled={disabled}
          aria-label="Message"
        />
        {isBusy ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={disabled || !input.trim()}>
            Send
          </button>
        )}
      </form>
      <p className={styles.disclaimer}>Research summaries only, not investment advice.</p>
    </div>
  );
}

export default ChatPage;
