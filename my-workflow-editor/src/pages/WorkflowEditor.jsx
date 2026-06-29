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

const defaultTemplates = {
  set: '{\n  "set": {\n    "message": "Hello from Ziggy"\n  }\n}',
  wait: '{\n  "wait": {\n    "seconds": 2\n  }\n}',
  switch: '{\n  "switch": [\n    {\n      "electronic": {\n        "when": "${ $input.orderType == \'electronic\' }",\n        "then": "processElectronicOrder"\n      }\n    },\n    {\n      "default": {\n        "then": "handleUnknownOrderType"\n      }\n    }\n  ]\n}',
  call: '{\n  "do": [\n    {\n      "myApiCall": {\n        "call": "http",\n        "with": {\n          "method": "get",\n          "endpoint": "https://jsonplaceholder.typicode.com/posts"\n        }\n      }\n    }\n  ]\n}',
  for: '{\n  "for": {\n    "each": "item",\n    "in": "${ $input.data }",\n    "at": "index"\n  },\n  "do": [\n    {\n      "setData": {\n        "set": {\n          "userId": "${ $data.item.userId }",\n          "loop_index": "${ $data.index }",\n          "status": "processed_by_loop"\n        }\n      }\n    },\n    {\n      "wait": {\n        "wait": {\n          "seconds": 1\n        }\n      }\n    }\n  ]\n}',
parallel: '{\n  "fork": {\n    "branches": [\n      {\n        "branch_1_wait": {\n          "wait": {\n            "seconds": 5\n          }\n        }\n      },\n      {\n        "branch_2_wait": {\n          "wait": {\n            "seconds": 10\n          }\n        }\n      }\n    ]\n  }\n}',
  
  tryCatch: '{\n  "try": [\n    {\n      "getUser": {\n        "call": "http",\n        "with": {\n          "method": "get",\n          "endpoint": "https://jsonplaceholder.typicode.com/users/2000"\n        }\n      }\n    }\n  ],\n  "catch": {\n    "do": [\n      {\n        "setError": {\n          "set": {\n            "err": "some error"\n          }\n        }\n      }\n    ]\n  }\n}'
};

const initialNodes = [
  { 
    id: 'start', 
    position: { x: 250, y: 50 }, 
    data: { stepName: 'switcher', type: 'switch', body: defaultTemplates['switch'] } 
  }
];

export default function WorkflowEditor() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);
  
  // Данные воркфлоу
  const [workflowName, setWorkflowName] = useState('Switch Testing Workflow');
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Состояния для запуска (Run)
  const [workflowId, setWorkflowId] = useState(null); // ID сохраненного графа
  const [runPayload, setRunPayload] = useState('{\n  "data": [\n    {\n      "orderType": "electronic"\n    }\n  ]\n}');
  const [runResult, setRunResult] = useState(null); // Результат запуска (ссылки)

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const addNode = () => {
    setNodes((nds) => {
      const lastNode = nds[nds.length - 1];
      const newY = lastNode ? lastNode.position.y + 150 : 50;
      const newX = lastNode ? lastNode.position.x + (Math.random() * 100 - 50) : 250; 

      const newNode = {
        id: getId(),
        position: { x: newX, y: newY },
        data: { stepName: `step_${Math.floor(Math.random() * 1000)}`, type: 'call', body: defaultTemplates['call'] }
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
    setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, type: newType, body: newBodyTemplate } }));
  };

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

      orderedSteps.push({ name: currentNode.data.stepName, body: parsedBody });

      const nextEdges = edges.filter((e) => e.source === currentNode.id);
      nextEdges.forEach((edge) => {
        const nextNode = nodes.find((n) => n.id === edge.target);
        if (nextNode && !visited.has(nextNode.id)) queue.push(nextNode);
      });
    }
    return orderedSteps;
  };

  const handleSave = async () => {
    try {
      const steps = getOrderedSteps();
      const payload = { name: workflowName, description: "UI Generated", steps };
      
      // Здесь в будущем добавим логику: если это редактирование, то делаем PUT запрос.
      // Пока оставляем POST для создания.
      const response = await fetch('http://localhost:8080/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());
      const resData = await response.json();
      
      setWorkflowId(resData.id); 
      setRunResult(null); 
      alert(`Сохранено успешно! ID: ${resData.id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRun = async () => {
    if (!workflowId) {
      alert('Сначала нужно сохранить (Deploy) workflow!');
      return;
    }

    let parsedPayload = { data: [] }; 
    
    if (runPayload.trim()) {
      try {
        parsedPayload = JSON.parse(runPayload);
      } catch (e) {
        alert('Ошибка валидации входных данных (JSON): ' + e.message);
        return;
      }
    }

    try {
      const response = await fetch(`http://localhost:8080/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedPayload),
      });

      if (!response.ok) throw new Error(await response.text());
      const resData = await response.json();
      setRunResult(resData); 
    } catch (err) {
      alert('Ошибка запуска: ' + err.message);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100%', display: 'flex' }}>
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
          
          <Panel position="top-left" style={{ background: '#fff', padding: '15px', borderRadius: '5px', border: '1px solid #ccc', width: '300px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Workflow Manager</h3>
            <input 
              value={workflowName} 
              onChange={(e) => setWorkflowName(e.target.value)} 
              style={{ width: '100%', padding: '5px', marginBottom: '10px' }} 
            />
            
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
              <button onClick={addNode} style={{ flexGrow: 1, padding: '5px' }}>+ Узел</button>
              <button onClick={handleSave} style={{ flexGrow: 1, background: '#007bff', color: 'white', border: 'none', padding: '5px' }}>Deploy</button>
            </div>

            {workflowId && (
              <div style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#28a745' }}>Готов к запуску</h4>
                <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: '#666' }}>ID: {workflowId}</p>
                
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Input Payload (опционально):</label>
                <textarea 
                  value={runPayload}
                  onChange={(e) => setRunPayload(e.target.value)}
                  style={{ width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '11px', marginTop: '5px' }}
                  placeholder={'{\n  "data": []\n}'}
                />
                
                <button onClick={handleRun} style={{ width: '100%', background: '#28a745', color: 'white', border: 'none', padding: '8px', marginTop: '10px', cursor: 'pointer' }}>
                  🚀 Run Workflow
                </button>
              </div>
            )}

            {runResult && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px', fontSize: '12px' }}>
                <p style={{ margin: '0 0 5px 0' }}><b>Status:</b> {runResult.status}</p>
                <a href={runResult.temporal_ui_url} target="_blank" rel="noreferrer" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 'bold' }}>
                  🔗 Открыть в Temporal UI
                </a>
              </div>
            )}
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <div style={{ width: '350px', background: '#f8f9fa', borderLeft: '1px solid #ddd', padding: '20px', display: 'flex', flexDirection: 'column',
            height: '100vh',         // Фиксируем высоту панели по высоте экрана
    overflowY: 'auto'
         }}>
          <h3>Настройки шага</h3>
          
          <label style={{ fontWeight: 'bold' }}>Имя шага (ключ):</label>
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
            <option value="for">for (Цикл по массиву)</option>
            <option value="parallel">parallel (Параллельные ветки)</option>
            <option value="tryCatch">try/catch (Обработка ошибок)</option>
          </select>

          <div style={{ marginTop: '15px', padding: '10px', background: '#eee', borderRadius: '4px' }}>

  {selectedNode.data.type === 'wait' && (
    <div>
      <label>Секунды:</label>
      <input 
        type="number"
        value={JSON.parse(selectedNode.data.body).wait.seconds || 0}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          updateNodeData('body', JSON.stringify({ wait: { seconds: val } }, null, 2));
        }}
        style={{ width: '100%', padding: '5px' }}
      />
    </div>
  )}

{selectedNode.data.type === 'set' && (
  <div>
    <label style={{ fontWeight: 'bold' }}>Данные для установки:</label>
    {Object.entries(JSON.parse(selectedNode.data.body).set || {}).map(([key, value], index) => (
      <div key={index} style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
        <input 
          value={key} 
          placeholder="Ключ"
          onChange={(e) => {
            const newKey = e.target.value;
            const currentData = JSON.parse(selectedNode.data.body).set;
            
            // ПРОВЕРКА НА ДУБЛИКАТЫ:
            if (newKey !== key && currentData.hasOwnProperty(newKey)) {
              alert("Ключ с таким именем уже существует!");
              return;
            }

            const newData = { ...currentData };
            delete newData[key];
            newData[newKey] = value;
            updateNodeData('body', JSON.stringify({ set: newData }, null, 2));
          }}
          style={{ width: '40%', padding: '4px' }}
        />
        <input 
          value={value} 
          placeholder="Значение"
          onChange={(e) => {
            const currentData = JSON.parse(selectedNode.data.body).set;
            const newData = { ...currentData, [key]: e.target.value };
            updateNodeData('body', JSON.stringify({ set: newData }, null, 2));
          }}
          style={{ width: '60%', padding: '4px' }}
        />
      </div>
    ))}
    <button 
      onClick={() => {
        const currentData = JSON.parse(selectedNode.data.body).set;
        const newKeyName = "new_field";
        
        // Автоматически находим свободное имя, чтобы не создавать дубликат
        if (currentData.hasOwnProperty(newKeyName)) {
           alert("Сначала переименуйте существующее поле!");
           return;
        }

        updateNodeData('body', JSON.stringify({ set: { ...currentData, [newKeyName]: "значение" } }, null, 2));
      }}
      style={{ marginTop: '10px', width: '100%' }}
    >
      + Добавить поле
    </button>
  </div>
)}
{selectedNode.data.type === 'switch' && (
  <div>
    <label style={{ fontWeight: 'bold' }}>Условия ветвления:</label>
    {/* Заменяем блок отображения веток на этот вариант */}
{JSON.parse(selectedNode.data.body).switch.map((item, index) => {
  const type = item.default ? 'default' : Object.keys(item)[0];
  const condition = item[type].when || '';
  const target = item[type].then;

  return (
    <div key={index} style={{ background: '#f0f0f0', padding: '8px', marginTop: '10px', borderRadius: '4px' }}>
      
      {/* Поле для переименования ключа ветки */}
      <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Имя ветки (ключ):</label>
      <input 
        value={type}
        readOnly={type === 'default'} // default нельзя переименовывать
        onChange={(e) => {
          const newKey = e.target.value;
          const newSwitch = [...JSON.parse(selectedNode.data.body).switch];
          // Создаем новую структуру объекта с новым ключом
          const branchData = newSwitch[index][type];
          newSwitch[index] = { [newKey]: branchData };
          updateNodeData('body', JSON.stringify({ switch: newSwitch }, null, 2));
        }}
        style={{ width: '100%', marginBottom: '5px', padding: '4px' }}
      />
      
      {type !== 'default' && (
        <>
          <label style={{ fontSize: '11px' }}>Условие (when):</label>
          <input 
            value={condition}
            onChange={(e) => {
              const newSwitch = [...JSON.parse(selectedNode.data.body).switch];
              newSwitch[index][type].when = e.target.value;
              updateNodeData('body', JSON.stringify({ switch: newSwitch }, null, 2));
            }}
            style={{ width: '100%', marginBottom: '5px', padding: '4px' }}
          />
        </>
      )}

      <label style={{ fontSize: '11px' }}>Перейти к (then):</label>
      <input 
        value={target}
        onChange={(e) => {
          const newSwitch = [...JSON.parse(selectedNode.data.body).switch];
          newSwitch[index][type].then = e.target.value;
          updateNodeData('body', JSON.stringify({ switch: newSwitch }, null, 2));
        }}
        style={{ width: '100%', padding: '4px' }}
      />
    </div>
  );
})}
    <button 
      onClick={() => {
        const currentSwitch = JSON.parse(selectedNode.data.body).switch;
        const newCondition = { 
          "new_type": { "when": "${ $input.val == 'new' }", "then": "nextStep" } 
        };
        // Вставляем перед default (предпоследним элементом)
        const newSwitch = [...currentSwitch.slice(0, -1), newCondition, currentSwitch[currentSwitch.length - 1]];
        updateNodeData('body', JSON.stringify({ switch: newSwitch }, null, 2));
      }}
      style={{ marginTop: '10px', width: '100%', padding: '8px', background: '#e0e0e0', border: 'none', cursor: 'pointer' }}
    >
      + Добавить условие
    </button>
  </div>
)}

{/* Остальные типы, для которых еще нет формы */}
{['call', 'for', 'parallel', 'tryCatch'].includes(selectedNode.data.type) && (
  <div style={{ marginTop: '15px' }}>
    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>JSON Конфигурация (вложенные шаги):</label>
    <textarea 
      value={selectedNode.data.body} 
      onChange={(e) => updateNodeData('body', e.target.value)}
      style={{ width: '100%', height: '280px', marginTop: '5px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre' }}
    />
  </div>
)}
</div>
        </div>
      )}
    </div>
  );
}