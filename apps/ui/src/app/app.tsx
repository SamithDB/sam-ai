import { Link, Navigate, Route, Routes } from 'react-router-dom';
import styles from './app.module.scss';
import { ApiExplorerPage } from './api-explorer.page';

function HomePage() {
  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Sample API integration</p>
        <h1>Welcome @sam-ai/ui</h1>
        <p className={styles.subtitle}>
          Start here, then open the API explorer to view live CSE endpoint
          responses from the backend.
        </p>
        <Link to="/api-explorer" className={styles.explorerButton}>
          Open API Explorer
        </Link>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Quick start</h2>
          <span>Backend: http://localhost:3333/api</span>
        </div>
        <p className={styles.subtitle}>
          Use the explorer page to run each CSE endpoint, inspect the JSON, and
          verify the backend is working from the UI.
        </p>
      </section>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/api-explorer" element={<ApiExplorerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;