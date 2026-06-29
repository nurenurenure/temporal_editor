import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function WorkflowList() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const response = await fetch('http://localhost:8080/api/workflows');
        if (!response.ok) throw new Error('Ошибка сервера');
        const data = await response.json();
        setWorkflows(data || []);
      } catch (err) {
        console.error('Ошибка загрузки:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, []);

  if (loading) return <div style={{ padding: '20px' }}>Загрузка...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2>Список Workflows</h2>
      
      {workflows.length === 0 ? (
        <p>Нет созданных воркфлоу. <Link to="/workflows/new">Создайте первый!</Link></p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
          <thead>
            <tr style={{ background: '#f0f0f0', textAlign: 'left' }}>
              <th style={{ padding: '10px', borderBottom: '2px solid #ccc' }}>Название</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ccc' }}>Описание</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ccc' }}>ID</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ccc' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((wf) => (
              <tr key={wf.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}><b>{wf.name}</b></td>
                <td style={{ padding: '10px' }}>{wf.description}</td>
                <td style={{ padding: '10px', fontSize: '12px', color: '#666' }}>{wf.id}</td>
                <td style={{ padding: '10px' }}>
                  <Link 
                    to={`/workflows/${wf.id}/edit`} 
                    style={{ background: '#007bff', color: 'white', padding: '5px 10px', textDecoration: 'none', borderRadius: '4px' }}
                  >
                    Открыть в редакторе
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}