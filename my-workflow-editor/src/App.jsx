import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  applyEdgeChanges, 
  applyNodeChanges, 
  addEdge,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';

const getId = () => `node_${Math.random().toString(36).substr(2, 9)}`;

// 1. ТОЧНЫЕ ШАБЛОНЫ ИЗ ДОКУМЕНТАЦИИ ZIGFLOW
const defaultTemplates = {
  set: '{\n  "set": {\n    "message": "Hello from Ziggy"\n  }\n}',
  
  wait: '{\n  "wait": {\n    "seconds": 2\n  }\n}',
  
  switch: '{\n  "switch": [\n    {\n      "electronic": {\n        "when": "${ $input.orderType == \'electronic\' }",\n        "then": "processElectronicOrder"\n      }\n    },\n    {\n      "default": {\n        "then": "handleUnknownOrderType"\n      }\n    }\n  ]\n}',
  
  // Добавил шаблон для вызовов
  call: '{\n  "do": [\n    {\n      "myApiCall": {\n        "call": "http",\n        "with": {\n          "method": "get",\n          "endpoint": "https://jsonplaceholder.typicode.com/posts"\n        }\n      }\n    }\n  ]\n}'
};

const initialNodes = [
  { 
    id: 'start', 
    position: { x: 250, y: 50 }, 
    data: { 
      stepName: 'initial_set', // Уникальное имя шага для YAML
      type: 'set',             // Тип действия для селекта
      body: defaultTemplates['set'] 
    } 
  }
];

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);
  const [workflowName, setWorkflowName] = useState('Switch Testing Workflow');
  const [description, setDescription] = useState('Testing branches');
  const [selectedNode, setSelectedNode] = useState(null);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const addNode = () => {
    setNodes((nds) => {
      const lastNode = nds[nds.length - 1];
      const newY = lastNode ? lastNode.position.y + 150 : 50;
      // Немного сдвигаем по X, чтобы было удобнее строить ветки
      const newX = lastNode ? lastNode.position.x + (Math.random() * 100 - 50) : 250; 

      const newNode = {
        id: getId(),
        position: { x: newX, y: newY },
        data: { 
          stepName: `step_${Math.floor(Math.random() * 1000)}`, 
          type: 'wait', 
          body: defaultTemplates['wait'] 
        }
      };
      return nds.concat(newNode);
    });
  };

  const onNodeClick = (_, node) => setSelectedNode(node);
  const onPaneClick = () => setSelectedNode(null);

  const updateNodeData = (field, value) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          return { ...n, data: { ...n.data, [field]: value } };
        }
        return n;
      })
    );
    setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, [field]: value } }));
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    const newBodyTemplate = defaultTemplates[newType];

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          return { ...n, data: { ...n.data, type: newType, body: newBodyTemplate } };
        }
        return n;
      })
    );
    
    setSelectedNode((prev) => ({ 
      ...prev, 
      data: { ...prev.data, type: newType, body: newBodyTemplate } 
    }));
  };

  // 2. ИСПРАВЛЕННЫЙ АЛГОРИТМ: Поддержка ветвления (Breadth-First Search)
  const getOrderedSteps = () => {
    if (nodes.length === 0) return [];

    const targetIds = new Set(edges.map((e) => e.target));
    const startNodes = nodes.filter((n) => !targetIds.has(n.id));

    if (startNodes.length === 0) throw new Error("Зацикленный граф!");

    const orderedSteps = [];
    const visited = new Set();
    const queue = [...startNodes];

    while (queue.length > 0) {
      const currentNode = queue.shift();
      
      if (visited.has(currentNode.id)) continue;
      visited.add(currentNode.id);
      
      let parsedBody = {};
      try {
        parsedBody = JSON.parse(currentNode.data.body || '{}');
      } catch (e) {
        throw new Error(`Ошибка JSON в шаге "${currentNode.data.stepName}": ${e.message}`);
      }

      orderedSteps.push({
        name: currentNode.data.stepName, 
        body: parsedBody
      });

      // Ищем ВСЕ исходящие связи (чтобы поддерживать Свитч)
      const nextEdges = edges.filter((e) => e.source === currentNode.id);
      nextEdges.forEach((edge) => {
        const nextNode = nodes.find((n) => n.id === edge.target);
        if (nextNode && !visited.has(nextNode.id)) {
          queue.push(nextNode);
        }
      });
    }

    return orderedSteps;
  };

  const handleSave = async () => {
    try {
      const steps = getOrderedSteps();
      const payload = { name: workflowName, description, steps };
      console.log("Отправляем JSON:", JSON.stringify(payload, null, 2));

      const response = await fetch('http://localhost:8080/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());
      alert(`Успешно! Workflow ID: ${(await response.json()).id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
      <div style={{ flexGrow: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
        >
          <Background />
          <Controls />
          <Panel position="top-left" style={{ background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} placeholder="Workflow Name" />
            </div>
            <button onClick={addNode} style={{ marginRight: '10px' }}>+ Add Node</button>
            <button onClick={handleSave} style={{ background: '#007bff', color: 'white', padding: '5px 15px', borderRadius: '3px', cursor: 'pointer' }}>Deploy</button>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <div style={{ width: '350px', background: '#f8f9fa', borderLeft: '1px solid #ddd', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3>Настройки шага</h3>
          
          <label style={{ fontWeight: 'bold' }}>Имя шага (ключ в YAML):</label>
          <input 
            type="text"
            value={selectedNode.data.stepName} 
            onChange={(e) => updateNodeData('stepName', e.target.value)}
            style={{ padding: '8px', marginTop: '5px' }}
          />

          <label style={{ marginTop: '15px', fontWeight: 'bold' }}>Тип операции:</label>
          <select 
            value={selectedNode.data.type} 
            onChange={handleTypeChange}
            style={{ padding: '8px', marginTop: '5px' }}
          >
            <option value="set">set (Присвоение)</option>
            <option value="wait">wait (Ожидание)</option>
            <option value="switch">switch (Ветвление)</option>
            <option value="call">call (Вызов саб-воркфлоу)</option>
          </select>

          <label style={{ marginTop: '15px', fontWeight: 'bold' }}>Параметры (JSON):</label>
          <textarea 
            value={selectedNode.data.body} 
            onChange={(e) => updateNodeData('body', e.target.value)}
            style={{ width: '100%', height: '350px', padding: '10px', marginTop: '5px', fontFamily: 'monospace', resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  );
}