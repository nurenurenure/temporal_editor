import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import WorkflowList from './pages/WorkflowList';
import WorkflowEditor from './pages/WorkflowEditor';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Глобальная навигационная панель */}
        <nav style={{ background: '#222', padding: '15px 20px', display: 'flex', gap: '20px' }}>
          <Link to="/workflows" style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold' }}>
            📋 Список Workflows
          </Link>
          <Link to="/workflows/new" style={{ color: '#4caf50', textDecoration: 'none', fontWeight: 'bold' }}>
            ➕ Создать новый
          </Link>
        </nav>

        {/* Контейнер для страниц */}
        <div style={{ flexGrow: 1, overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<WorkflowList />} />
            <Route path="/workflows" element={<WorkflowList />} />
            <Route path="/workflows/new" element={<WorkflowEditor />} />
            {/* Задел на будущее для редактирования: */}
            <Route path="/workflows/:id/edit" element={<WorkflowEditor />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}