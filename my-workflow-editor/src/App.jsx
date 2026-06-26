import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  Background, Controls, applyEdgeChanges, applyNodeChanges, addEdge 
} from 'reactflow';
import 'reactflow/dist/style.css';

// Пример структуры узла, которая нужна для Zigflow
const initialNodes = [
  { 
    id: '1', 
    position: { x: 250, y: 5 }, 
    data: { 
      name: 'set', 
      body: { 
        output: { as: { data: '${ . }' } },
        set: { message: 'Hello from Ziggy' }
      } 
    } 
  },
];

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);
  const [name, setName] = useState('My Workflow');
  const [description, setDescription] = useState('Zigflow valid workflow');

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const handleSave = async () => {
    // Формируем массив steps в соответствии с ожиданиями бэкенда
    const steps = nodes.map((node) => ({
      name: node.data.name, 
      body: node.data.body  
    }));

    const payload = {
      name,
      description,
      steps
    };

    console.log("Отправляем на бэкенд:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('http://localhost:8080/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      const result = await response.json();
      alert(`Успешно! Workflow ID: ${result.id}`);
    } catch (err) {
      console.error("Ошибка:", err);
      alert('Ошибка при сохранении: ' + err.message);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '10px', background: '#222', color: '#fff', display: 'flex', gap: '10px' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <button onClick={handleSave}>Save & Deploy</button>
      </header>
      
      <div style={{ flexGrow: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}