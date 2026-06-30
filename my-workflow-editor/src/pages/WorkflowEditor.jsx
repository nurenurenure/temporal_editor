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
  for: '{\n  "for": {\n    "each": "item",\n    "in": "${ $input.data }",\n    "at": "index"\n  },\n  "do": [\n    {\n      "setData": {\n        "set": {\n          "userId": "${ $data.item.userId }",\n          "loop_index": "${ $data.index }",\n          "status": "processed_by_loop"\n        }\n      }\n    },\n    {\n      "wait": {\n        "wait": {\n          "seconds": 1\n        }\n      }\n    }\n  ]\n}',
  parallel: '{\n  "fork": {\n    "branches": [\n      {\n        "branch_1_wait": {\n          "wait": {\n            "seconds": 5\n          }\n        }\n      },\n      {\n        "branch_2_wait": {\n          "wait": {\n            "seconds": 10\n          }\n        }\n      }\n    ]\n  }\n}',
  
  tryCatch: '{\n  "try": {\n    "do": [\n      {\n        "getUser": {\n          "call": "http",\n          "with": {\n            "method": "get",\n            "endpoint": "https://jsonplaceholder.typicode.com/users/2000"\n          }\n        }\n      }\n    ]\n  },\n  "catch": {\n    "do": [\n      {\n        "setError": {\n          "set": {\n            "err": "some error"\n          }\n        }\n      }\n    ]\n  }\n}',
  call_http: '{\n  "call": "http",\n  "with": {\n    "method": "get",\n    "endpoint": "https://jsonplaceholder.typicode.com/posts/1"\n  }\n}',

  call_activity: '{\n  "call": "activity",\n  "with": {\n    "name": "ProcessPaymentActivity",\n    "input": {\n      "amount": "${ $input.amount }",\n      "currency": "USD"\n    }\n  }\n}',

  call_grpc: '{\n  "call": "grpc",\n  "with": {\n    "address": "user-service:50051",\n    "service": "users.UserService",\n    "method": "GetUserProfile",\n    "payload": {\n      "user_id": "${ $input.userId }"\n    }\n  }\n}'
};

const nodeTypes = {
  workflow: WorkflowNode
};

const initialNodes = [
  {
    id: 'start',
    type: 'workflow',
    position: { x: 250, y: 50 },
    data: {
      stepName: 'switcher',
      type: 'switch',
      body: defaultTemplates['switch']
    }
  }
];

export default function WorkflowEditor() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);
  
  const [workflowName, setWorkflowName] = useState('Switch Testing Workflow');
  const [selectedNode, setSelectedNode] = useState(null);
  
  const [workflowId, setWorkflowId] = useState(null);
  const [runPayload, setRunPayload] = useState('{\n  "data": [\n    {\n      "orderType": "electronic"\n    }\n  ]\n}');
  const [runResult, setRunResult] = useState(null);

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
        type: "workflow",
        position: { x: newX, y: newY },
        data: {
          stepName: `step_${Math.floor(Math.random()*1000)}`,
          type: "call_http",
          body: defaultTemplates["call_http"]
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
    setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, type: newType, body: newBodyTemplate } }));
  };

  const getOrderedSteps = () => {
    if (nodes.length === 0) return [];

    const targetIds = new Set(edges.map((e) => e.target));
    const startNodes = nodes.filter((n) => !targetIds.has(n.id));

    if (startNodes.length === 0) throw new Error("Зацикленный граф!");
    const startNode = startNodes[0];

    const buildNativeSequence = (startNodeId, visited = new Set()) => {
      let currentId = startNodeId;
      const sequence = [];

      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const node = nodes.find(n => n.id === currentId);
        if (!node) break;

        let stepBody = {};

        if (node.data?.type === 'parallel') {
          const outEdges = edges.filter(e => e.source === currentId);
          const branches = outEdges.map((edge, index) => {
            return {
              [`branch_${index + 1}`]: {
                do: buildNativeSequence(edge.target, new Set(visited))
              }
            };
          });
          
          stepBody = { fork: { branches } };
          sequence.push({ [node.data.stepName]: stepBody });
          break;
        } 
        else if (node.data?.type === 'tryCatch') {
          const tryEdge = edges.find(e => e.source === currentId && e.sourceHandle === 'try');
          const catchEdge = edges.find(e => e.source === currentId && e.sourceHandle === 'catch');

          stepBody = {
            try: tryEdge ? buildNativeSequence(tryEdge.target, new Set(visited)) : [],
            catch: {
              do: catchEdge ? buildNativeSequence(catchEdge.target, new Set(visited)) : []
            }
          };
          
          sequence.push({ [node.data.stepName]: stepBody });
          break;
        }
        else {
          try {
            stepBody = JSON.parse(node.data.body || '{}');
          } catch (e) {
            throw new Error(`Ошибка JSON в шаге "${node.data.stepName}": ${e.message}`);
          }
          sequence.push({ [node.data.stepName]: stepBody });

          const outEdges = edges.filter(e => e.source === currentId);
          currentId = outEdges.length > 0 ? outEdges[0].target : null;
        }
      }
      return sequence;
    };

    const nativeSeq = buildNativeSequence(startNode.id);
    
    return nativeSeq.map(item => {
      const name = Object.keys(item)[0];
      return { name: name, body: item[name] };
    });
  };

  const handleSave = async () => {
    try {
      const steps = getOrderedSteps();
      const payload = { name: workflowName, description: "UI Generated", steps };
      
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
    <div style={{ width: '100%', height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
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
        <div style={{ width: '30%', minWidth: 300, maxWidth: 420, background: '#f8f9fa', borderLeft: '1px solid #ddd', padding: '20px', display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
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
            <option value="for">for (Цикл по массиву)</option>
            <option value="parallel">parallel (Параллельные ветки)</option>
            <option value="tryCatch">try/catch (Обработка ошибок)</option>
            <option value="call_http">call: HTTP (Внешний REST API)</option>
            <option value="call_activity">call: Activity (Код на воркере)</option>
            <option value="call_grpc">call: gRPC (Микросервисы)</option>
          </select>

          <div style={{ marginTop: '15px', padding: '10px', background: '#eee', borderRadius: '4px' }}>

            {selectedNode.data.type === 'wait' && (
              <div>
                <label>Секунды:</label>
                <input 
                  type="number"
                  value={JSON.parse(selectedNode.data.body || '{"wait":{"seconds":0}}').wait?.seconds || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    updateNodeData('body', JSON.stringify({ wait: { seconds: val } }, null, 2));
                  }}
                  style={{ width: '100%', padding: '5px' }}
                />
              </div>
            )}

            {selectedNode.data.type === 'set' && (
              <div>
                <label style={{ fontWeight: 'bold' }}>Данные для установки:</label>
                {Object.entries(JSON.parse(selectedNode.data.body || '{"set":{}}').set || {}).map(([key, value], index) => (
                  <div key={index} style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    <input 
                      value={key} 
                      placeholder="Ключ"
                      onChange={(e) => {
                        const newKey = e.target.value;
                        const currentData = JSON.parse(selectedNode.data.body).set;
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
                    const currentData = JSON.parse(selectedNode.data.body || '{"set":{}}').set || {};
                    const newKeyName = "new_field";
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
                {JSON.parse(selectedNode.data.body || '{"switch":[]}').switch.map((item, index) => {
                  const type = item.default ? 'default' : Object.keys(item)[0];
                  const condition = item[type].when || '';
                  const target = item[type].then;

                  return (
                    <div key={index} style={{ background: '#f0f0f0', padding: '8px', marginTop: '10px', borderRadius: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Имя ветки (ключ):</label>
                      <input 
                        value={type}
                        readOnly={type === 'default'} 
                        onChange={(e) => {
                          const newKey = e.target.value;
                          const newSwitch = [...JSON.parse(selectedNode.data.body).switch];
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
                    const newSwitch = [...currentSwitch.slice(0, -1), newCondition, currentSwitch[currentSwitch.length - 1]];
                    updateNodeData('body', JSON.stringify({ switch: newSwitch }, null, 2));
                  }}
                  style={{ marginTop: '10px', width: '100%', padding: '8px', background: '#e0e0e0', border: 'none', cursor: 'pointer' }}
                >
                  + Добавить условие
                </button>
              </div>
            )}

            {/* 🌐 ИНТЕРФЕЙС ДЛЯ CALL HTTP */}
            {selectedNode.data.type === 'call_http' && (() => {
              let bodyObj = { call: "http", with: { method: "get", endpoint: "" } };
              try { bodyObj = JSON.parse(selectedNode.data.body || '{}'); } catch(e){}
              const withData = bodyObj.with || {};
              return (
                <div>
                  <label style={{ fontWeight: 'bold' }}>HTTP Метод:</label>
                  <select
                    value={withData.method || 'get'}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, method: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '12px' }}
                  >
                    <option value="get">GET</option>
                    <option value="post">POST</option>
                    <option value="put">PUT</option>
                    <option value="delete">DELETE</option>
                    <option value="patch">PATCH</option>
                  </select>

                  <label style={{ fontWeight: 'bold' }}>Эндпоинт (Endpoint URL):</label>
                  <input
                    type="text"
                    value={withData.endpoint || ''}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, endpoint: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', boxSizing: 'border-box' }}
                    placeholder="https://api.example.com/v1/data"
                  />
                </div>
              );
            })()}

            {/* ⚡ ИНТЕРФЕЙС ДЛЯ CALL ACTIVITY */}
            {selectedNode.data.type === 'call_activity' && (() => {
              let bodyObj = { call: "activity", with: { name: "", input: {} } };
              try { bodyObj = JSON.parse(selectedNode.data.body || '{}'); } catch(e){}
              const withData = bodyObj.with || {};
              const inputs = withData.input || {};
              return (
                <div>
                  <label style={{ fontWeight: 'bold' }}>Название Активити (Name):</label>
                  <input
                    type="text"
                    value={withData.name || ''}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, name: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '12px', boxSizing: 'border-box' }}
                    placeholder="ProcessPaymentActivity"
                  />

                  <label style={{ fontWeight: 'bold' }}>Параметры (Input):</label>
                  {Object.entries(inputs).map(([key, value], index) => (
                    <div key={index} style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                      <input
                        value={key}
                        placeholder="Ключ"
                        onChange={(e) => {
                          const newKey = e.target.value;
                          if (newKey !== key && inputs.hasOwnProperty(newKey)) {
                            alert("Такой параметр уже добавлен!");
                            return;
                          }
                          const newInput = { ...inputs };
                          delete newInput[key];
                          newInput[newKey] = value;
                          const newBody = { ...bodyObj, with: { ...withData, input: newInput } };
                          updateNodeData('body', JSON.stringify(newBody, null, 2));
                        }}
                        style={{ width: '40%', padding: '4px' }}
                      />
                      <input
                        value={value}
                        placeholder="Значение"
                        onChange={(e) => {
                          const newInput = { ...inputs, [key]: e.target.value };
                          const newBody = { ...bodyObj, with: { ...withData, input: newInput } };
                          updateNodeData('body', JSON.stringify(newBody, null, 2));
                        }}
                        style={{ width: '60%', padding: '4px' }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newKeyName = "new_param";
                      if (inputs.hasOwnProperty(newKeyName)) {
                        alert("Сначала переименуйте предыдущее добавленное поле!");
                        return;
                      }
                      const newInput = { ...inputs, [newKeyName]: "значение" };
                      const newBody = { ...bodyObj, with: { ...withData, input: newInput } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ marginTop: '10px', width: '100%', padding: '5px' }}
                  >
                    + Добавить параметр
                  </button>
                </div>
              );
            })()}

            {/* 🧬 ИНТЕРФЕЙС ДЛЯ CALL GRPC */}
            {selectedNode.data.type === 'call_grpc' && (() => {
              let bodyObj = { call: "grpc", with: { address: "", service: "", method: "", payload: {} } };
              try { bodyObj = JSON.parse(selectedNode.data.body || '{}'); } catch(e){}
              const withData = bodyObj.with || {};
              const payload = withData.payload || {};
              return (
                <div>
                  <label style={{ fontWeight: 'bold' }}>Адрес Хоста (Address):</label>
                  <input
                    type="text"
                    value={withData.address || ''}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, address: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '10px', boxSizing: 'border-box' }}
                    placeholder="user-service:50051"
                  />

                  <label style={{ fontWeight: 'bold' }}>Сервис (Service):</label>
                  <input
                    type="text"
                    value={withData.service || ''}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, service: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '10px', boxSizing: 'border-box' }}
                    placeholder="users.UserService"
                  />

                  <label style={{ fontWeight: 'bold' }}>Метод (Method):</label>
                  <input
                    type="text"
                    value={withData.method || ''}
                    onChange={(e) => {
                      const newBody = { ...bodyObj, with: { ...withData, method: e.target.value } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '12px', boxSizing: 'border-box' }}
                    placeholder="GetUserProfile"
                  />

                  <label style={{ fontWeight: 'bold' }}>Пейлоад (Payload данные):</label>
                  {Object.entries(payload).map(([key, value], index) => (
                    <div key={index} style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                      <input
                        value={key}
                        placeholder="Ключ"
                        onChange={(e) => {
                          const newKey = e.target.value;
                          if (newKey !== key && payload.hasOwnProperty(newKey)) {
                            alert("Поле с таким именем уже есть!");
                            return;
                          }
                          const newPayload = { ...payload };
                          delete newPayload[key];
                          newPayload[newKey] = value;
                          const newBody = { ...bodyObj, with: { ...withData, payload: newPayload } };
                          updateNodeData('body', JSON.stringify(newBody, null, 2));
                        }}
                        style={{ width: '40%', padding: '4px' }}
                      />
                      <input
                        value={value}
                        placeholder="Значение"
                        onChange={(e) => {
                          const newPayload = { ...payload, [key]: e.target.value };
                          const newBody = { ...bodyObj, with: { ...withData, payload: newPayload } };
                          updateNodeData('body', JSON.stringify(newBody, null, 2));
                        }}
                        style={{ width: '60%', padding: '4px' }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newKeyName = "new_field";
                      if (payload.hasOwnProperty(newKeyName)) {
                        alert("Переименуйте текущее созданное поле перед добавлением!");
                        return;
                      }
                      const newPayload = { ...payload, [newKeyName]: "значение" };
                      const newBody = { ...bodyObj, with: { ...withData, payload: newPayload } };
                      updateNodeData('body', JSON.stringify(newBody, null, 2));
                    }}
                    style={{ marginTop: '10px', width: '100%', padding: '5px' }}
                  >
                    + Добавить поле payload
                  </button>
                </div>
              );
            })()}

            {['parallel', 'tryCatch'].includes(selectedNode.data.type) && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '4px' }}>
                <p style={{ fontSize: '12px', margin: 0, color: '#0d47a1' }}>
                  ℹ️ Конфигурация этого блока задается визуально.<br/><br/>
                  Подключите следующие шаги с помощью линий связи (edges) прямо на холсте.
                </p>
              </div>
            )}
            {/* 🔄 ИНТЕРФЕЙС ДЛЯ FOR LOOP */}
{selectedNode.data.type === 'for' && (() => {
  // Дефолтная структура на случай, если body пустой или поврежден
  let bodyObj = { for: { each: "item", in: "", at: "index" }, do: [] };
  try { 
    bodyObj = JSON.parse(selectedNode.data.body || '{}'); 
  } catch(e) {}
  
  const forData = bodyObj.for || {};
  const doData = bodyObj.do || [];

  // Функция для безопасного обновления полей итератора
  const updateForField = (field, value) => {
    const newBody = {
      ...bodyObj,
      for: {
        ...forData,
        [field]: value
      }
    };
    updateNodeData('body', JSON.stringify(newBody, null, 2));
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 10px 0', color: '#2196f3' }}>Настройка итератора</h4>
      
      <label style={{ fontWeight: 'bold', fontSize: '12px' }}>Имя переменной элемента (each):</label>
      <input
        type="text"
        value={forData.each || 'item'}
        onChange={(e) => updateForField('each', e.target.value)}
        style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '12px', boxSizing: 'border-box' }}
        placeholder="item"
      />

      <label style={{ fontWeight: 'bold', fontSize: '12px' }}>Массив для перебора (in):</label>
      <input
        type="text"
        value={forData.in || ''}
        onChange={(e) => updateForField('in', e.target.value)}
        style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '12px', boxSizing: 'border-box' }}
        placeholder="${ $input.ordersArray }"
      />

      <label style={{ fontWeight: 'bold', fontSize: '12px' }}>Переменная индекса (at):</label>
      <input
        type="text"
        value={forData.at || 'index'}
        onChange={(e) => updateForField('at', e.target.value)}
        style={{ width: '100%', padding: '6px', marginTop: '5px', marginBottom: '15px', boxSizing: 'border-box' }}
        placeholder="index"
      />

      <div style={{ borderTop: '1px solid #ccc', paddingTop: '10px' }}>
        <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#555' }}>
          Тело цикла (массив шагов `do`):
        </label>
        <textarea
          value={typeof doData === 'string' ? doData : JSON.stringify(doData, null, 2)}
          onChange={(e) => {
            const rawText = e.target.value;
            try {
              // Если пользователь ввёл валидный JSON-массив, парсим и обновляем
              const parsedDo = JSON.parse(rawText);
              const newBody = { ...bodyObj, do: parsedDo };
              updateNodeData('body', JSON.stringify(newBody, null, 2));
            } catch (err) {
              // Если JSON в процессе ввода временно невалиден, не ломаем UI, 
              // а просто обновляем текст напрямую, чтобы пользователь мог дописать кавычку/скобку
              const newBody = { ...bodyObj, do: rawText };
              updateNodeData('body', JSON.stringify(newBody));
            }
          }}
          style={{ 
            width: '100%', 
            height: '180px', 
            marginTop: '5px', 
            fontFamily: 'monospace', 
            fontSize: '11px',
            boxSizing: 'border-box'
          }}
          placeholder={`[
  {
    "stepName": {}
  }
]`}
        />
        <span style={{ fontSize: '10px', color: '#888' }}>
          💡 Внутри тела цикла вы можете обращаться к элементу как <code>{"${ $data.item }"}</code> (или вашему имени из поля each).
        </span>
      </div>
    </div>
  );
})()}
            
          </div>
        </div>
      )}
    </div>
  );
}

import { Handle, Position } from "reactflow";

function WorkflowNode({ data }) {
  const colors = {
    set: "#4caf50", wait: "#ff9800", switch: "#9c27b0", for: "#2196f3",
    parallel: "#00bcd4", tryCatch: "#f44336", call_http: "#3f51b5",
    call_activity: "#607d8b", call_grpc: "#009688"
  };

  const isTryCatch = data.type === 'tryCatch';

  return (
    <div style={{ minWidth: 180, border: "1px solid #bbb", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 2px 5px rgba(0,0,0,.15)" }}>
      <Handle type="target" position={Position.Top} />

      <div style={{ background: colors[data.type] || "#666", color: "white", padding: "6px 10px", fontWeight: "bold", fontSize: 13 }}>
        {data.type}
      </div>

      <div style={{ padding: 10, fontSize: 14 }}>
        {data.stepName}
      </div>

      {!isTryCatch ? (
        <Handle type="source" position={Position.Bottom} />
      ) : (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '6px 20px', background: '#f9f9f9', borderTop: '1px solid #eee', fontSize: 10, fontWeight: 'bold' }}>
          <div style={{ color: '#4caf50' }}>TRY</div>
          <div style={{ color: '#f44336' }}>CATCH</div>
          <Handle type="source" position={Position.Bottom} id="try" style={{ left: '25%', background: '#4caf50', width: 10, height: 10 }} />
          <Handle type="source" position={Position.Bottom} id="catch" style={{ left: '75%', background: '#f44336', width: 10, height: 10 }} />
        </div>
      )}
    </div>
  );
}