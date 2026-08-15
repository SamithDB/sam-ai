import { useEffect, useState } from 'react';
import styles from './app.module.scss';

type DemoItem = {
  id: number;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'archived';
};

export function App() {
  const [items, setItems] = useState<DemoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadItems() {
      try {
        const response = await fetch('http://localhost:3333/api/items');

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as DemoItem[];

        if (isActive) {
          setItems(data);
          setError(null);
        }
      } catch (fetchError) {
        if (isActive) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load sample data',
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadItems();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Sample API integration</p>
        <h1>Data from Nest API, rendered in React</h1>
        <p className={styles.subtitle}>
          The UI fetches <span>/api/items</span> and displays a small list of
          sample records from the backend.
        </p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Items</h2>
          <span>{isLoading ? 'Loading...' : `${items.length} loaded`}</span>
        </div>

        {error ? (
          <div className={styles.error}>{error}</div>
        ) : isLoading ? (
          <div className={styles.loading}>Fetching data from the API...</div>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <article key={item.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <h3>{item.name}</h3>
                  <span className={styles.status}>{item.status}</span>
                </div>
                <p>{item.description}</p>
                <small>ID {item.id}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
