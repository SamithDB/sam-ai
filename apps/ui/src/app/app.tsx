import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import styles from './app.module.scss';
import { ApiExplorerPage } from './api-explorer.page';
import { defaultApiBaseUrl } from './api-config';

// Lazy-loaded so the AI SDK and markdown renderer stay out of the initial bundle.
const ChatPage = lazy(() => import('./chat.page'));
const ResearchPage = lazy(() => import('./research.page'));

function HomePage() {
  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>CSE stock research</p>
        <h1>sam-ai</h1>
        <p className={styles.subtitle}>
          An AI research assistant for the Colombo Stock Exchange. A supervisor agent routes your question to
          specialist agents for data, analysis, reports and watchlist alerts.
        </p>
        <div className={styles.actions}>
          <Link to="/research" className={styles.explorerButton}>
            View research results
          </Link>
          <Link to="/chat" className={styles.secondaryButton}>
            Open research assistant
          </Link>
          <Link to="/api-explorer" className={styles.secondaryButton}>
            Open API Explorer
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Quick start</h2>
          <span>Backend: {defaultApiBaseUrl}</span>
        </div>
        <p className={styles.subtitle}>
          Use the research assistant to ask questions in plain language, or the API explorer to run each CSE endpoint
          and inspect the raw JSON.
        </p>
      </section>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/chat"
        element={
          <Suspense fallback={<div className={styles.shell}>Loading assistant...</div>}>
            <ChatPage />
          </Suspense>
        }
      />
      <Route
        path="/research"
        element={
          <Suspense fallback={<div className={styles.shell}>Loading results...</div>}>
            <ResearchPage />
          </Suspense>
        }
      />
      <Route path="/api-explorer" element={<ApiExplorerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
