import { useEffect, useMemo, useState } from 'react';
import styles from './api-explorer.page.module.scss';
import { defaultApiBaseUrl } from './api-config';

type HttpMethod = 'GET' | 'POST';

type ApiEndpoint = {
  id: string;
  label: string;
  method: HttpMethod;
  path: string;
  description: string;
  autoLoad?: boolean;
};

type EndpointState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  response?: unknown;
  error?: string;
  updatedAt?: string;
};

const demoSymbol = 'JKH.N0000';

const apiEndpoints: ApiEndpoint[] = [
  {
    id: 'root',
    label: 'API root',
    method: 'GET',
    path: '/',
    description: 'Root response from the Nest app.',
    autoLoad: true,
  },
  {
    id: 'items',
    label: 'Sample items',
    method: 'GET',
    path: '/items',
    description: 'Starter endpoint kept for UI verification.',
    autoLoad: true,
  },
  {
    id: 'symbols',
    label: 'Security master',
    method: 'GET',
    path: '/symbols',
    description: 'Local CSE symbol registry.',
    autoLoad: true,
  },
  {
    id: 'market-summary',
    label: 'Market summary',
    method: 'GET',
    path: '/market/summary',
    description: 'Intraday market summary snapshot.',
    autoLoad: true,
  },
  {
    id: 'market-indexes',
    label: 'Market indexes',
    method: 'GET',
    path: '/market/indexes',
    description: 'ASPI and S&P SL20 index data.',
    autoLoad: true,
  },
  {
    id: 'analysis',
    label: 'Analysis report',
    method: 'GET',
    path: `/analysis/${demoSymbol}`,
    description: 'Structured report for the demo symbol.',
    autoLoad: true,
  },
  {
    id: 'history',
    label: 'History bars',
    method: 'GET',
    path: `/analysis/${demoSymbol}/history`,
    description: 'Historical OHLCV bars.',
    autoLoad: true,
  },
  {
    id: 'announcements',
    label: 'Announcements',
    method: 'GET',
    path: `/analysis/${demoSymbol}/announcements`,
    description: 'Recent company announcements.',
    autoLoad: true,
  },
  {
    id: 'ingest-symbols',
    label: 'Ingest symbols',
    method: 'POST',
    path: '/ingest/symbols',
    description: 'Store the symbol registry in the database.',
  },
  {
    id: 'ingest-all',
    label: 'Ingest all',
    method: 'POST',
    path: '/ingest/all',
    description: 'Run the full ingestion pipeline.',
  },
];

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function ApiExplorerPage() {
  const [baseUrlInput, setBaseUrlInput] = useState(defaultApiBaseUrl);
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [states, setStates] = useState<Record<string, EndpointState>>({});

  const normalizedBaseUrl = useMemo(
    () => apiBaseUrl.replace(/\/$/, ''),
    [apiBaseUrl],
  );

  useEffect(() => {
    const initialStates = Object.fromEntries(
      apiEndpoints.map((endpoint) => [endpoint.id, { status: 'idle' }]),
    ) as Record<string, EndpointState>;

    setStates(initialStates);
  }, []);

  useEffect(() => {
    const autoLoadEndpoints = apiEndpoints.filter((endpoint) => endpoint.autoLoad);

    void Promise.all(
      autoLoadEndpoints.map((endpoint) => runEndpoint(endpoint, normalizedBaseUrl)),
    );
  }, [normalizedBaseUrl]);

  async function runEndpoint(endpoint: ApiEndpoint, baseUrl = normalizedBaseUrl) {
    setStates((current) => ({
      ...current,
      [endpoint.id]: {
        ...(current[endpoint.id] ?? { status: 'idle' }),
        status: 'loading',
        error: undefined,
      },
    }));

    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers:
          endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          typeof payload === 'string'
            ? payload || `Request failed with status ${response.status}`
            : `Request failed with status ${response.status}`,
        );
      }

      setStates((current) => ({
        ...current,
        [endpoint.id]: {
          status: 'success',
          response: payload,
          updatedAt: new Date().toLocaleTimeString(),
        },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [endpoint.id]: {
          status: 'error',
          error:
            error instanceof Error ? error.message : 'Failed to call endpoint',
          updatedAt: new Date().toLocaleTimeString(),
        },
      }));
    }
  }

  function applyBaseUrl() {
    setApiBaseUrl(baseUrlInput.trim());
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>CSE API explorer</p>
          <h1>Live responses for every API call in one dashboard</h1>
          <p className={styles.subtitle}>
            Use this page to verify each backend route, inspect the JSON response,
            and run the ingestion actions when needed.
          </p>
        </div>

        <div className={styles.baseUrlCard}>
          <span>API base URL</span>
          <div className={styles.baseUrlRow}>
            <input
              value={baseUrlInput}
              onChange={(event) => setBaseUrlInput(event.target.value)}
              spellCheck={false}
            />
            <button type="button" onClick={applyBaseUrl}>
              Load
            </button>
          </div>
          <p>
            Default: <strong>{defaultApiBaseUrl}</strong>. If the API runs on a
            different port, update it here.
          </p>
        </div>
      </section>

      <section className={styles.linksCard} id="top">
        <div className={styles.linksHeader}>
          <h2>Jump to endpoint</h2>
          <span>{demoSymbol}</span>
        </div>
        <div className={styles.linkRow}>
          {apiEndpoints.map((endpoint) => (
            <a key={endpoint.id} href={`#${endpoint.id}`} className={styles.linkPill}>
              {endpoint.label}
            </a>
          ))}
        </div>
      </section>

      <section className={styles.section} id="responses">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>Responses</p>
            <h2>GET endpoints load automatically</h2>
          </div>
          <span>POST endpoints are manual actions to avoid side effects</span>
        </div>

        <div className={styles.grid}>
          {apiEndpoints.map((endpoint) => {
            const state = states[endpoint.id] ?? { status: 'idle' };

            return (
              <article key={endpoint.id} className={styles.card} id={endpoint.id}>
                <div className={styles.cardTop}>
                  <div>
                    <p className={styles.method}>{endpoint.method}</p>
                    <h3>{endpoint.label}</h3>
                    <p className={styles.path}>{endpoint.path}</p>
                  </div>

                  <button type="button" onClick={() => void runEndpoint(endpoint)}>
                    {endpoint.method === 'POST' ? 'Run' : 'Refresh'}
                  </button>
                </div>

                <p className={styles.description}>{endpoint.description}</p>

                <div className={styles.metaRow}>
                  <span className={styles.statusBadge} data-status={state.status}>
                    {state.status}
                  </span>
                  {state.updatedAt ? (
                    <span>Updated {state.updatedAt}</span>
                  ) : (
                    <span>Not loaded yet</span>
                  )}
                </div>

                {state.error ? (
                  <div className={styles.error}>{state.error}</div>
                ) : state.status === 'loading' ? (
                  <div className={styles.loading}>Calling {endpoint.path}...</div>
                ) : state.response !== undefined ? (
                  <pre className={styles.response}>{prettyJson(state.response)}</pre>
                ) : (
                  <div className={styles.empty}>
                    Click <strong>{endpoint.method === 'POST' ? 'Run' : 'Refresh'}</strong>{' '}
                    to fetch data.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default ApiExplorerPage;