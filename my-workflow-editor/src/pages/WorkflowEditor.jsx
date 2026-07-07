import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  parallel: '{\n  "fork": {\n    "branches": [\n      {\n        "branch_1_wait": {\n          "do": [\n            {\n              "wait": {\n                "wait": {\n                  "seconds": 5\n                }\n              }\n            }\n          ]\n        }\n      },\n      {\n        "branch_2_wait": {\n          "do": [\n            {\n              "wait": {\n                "wait": {\n                  "seconds": 10\n                }\n              }\n            }\n          ]\n        }\n      }\n    ]\n  }\n}',
  
  tryCatch: '{\n  "try": {\n    "do": [\n      {\n        "getUser": {\n          "call": "http",\n          "with": {\n            "method": "get",\n            "endpoint": "https://jsonplaceholder.typicode.com/users/2000"\n          }\n        }\n      }\n    ]\n  },\n  "catch": {\n    "do": [\n      {\n        "setError": {\n          "set": {\n            "err": "some error"\n          }\n        }\n      }\n    ]\n  }\n}',
  call_http: '{\n  "call": "http",\n  "with": {\n    "method": "get",\n    "endpoint": "https://jsonplaceholder.typicode.com/posts/1"\n  }\n}',

  call_activity: '{\n  "call": "activity",\n  "with": {\n    "name": "ProcessPaymentActivity",\n    "input": {\n      "amount": "${ $input.amount }",\n      "currency": "USD"\n    }\n  }\n}',

  call_grpc: '{\n  "call": "grpc",\n  "with": {\n    "address": "user-service:50051",\n    "service": "users.UserService",\n    "method": "GetUserProfile",\n    "payload": {\n      "user_id": "${ $input.userId }"\n    }\n  }\n}',
  join: '{\n  "join": {}\n}',
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

// --- ОБРАТНЫЙ МАППЕР (Deserializer) ---
function inferNodeType(body) {
  if (!body) return 'call_http';
  if (body.join) return 'join';
  if (body.wait) return 'wait';
  if (body.set) return 'set';
  if (body.switch) return 'switch';
  if (body.for) return 'for';
  if (body.fork) return 'parallel';
  if (body.try) return 'tryCatch';
  if (body.call === 'http') return 'call_http';
  if (body.call === 'activity') return 'call_activity';
  if (body.call === 'grpc') return 'call_grpc';
  return 'call_http'; // Default
}

function stepsToGraph(steps) {
  const nodes = [];
  const edges = [];

  // 1. Строим карту определений workflow: name -> массив шагов
  const workflowDefs = {};
  const mainSteps = [];

  for (const step of steps) {
    if (step.body && step.body.do) {
      workflowDefs[step.name] = step.body.do;
    } else {
      mainSteps.push(step);
    }
  }

  // Вспомогательная функция для конвертации [ {name, body} ] -> [ {name: body} ]
  const mapRawSteps = (rawArray) => {
    if (!Array.isArray(rawArray)) return [];
    return rawArray.map(obj => {
      const name = Object.keys(obj)[0];
      return { name, body: obj[name] };
    });
  };

  // Множество использованных определений (чтобы не дублировать)
  const usedDefs = new Set();

  function traverse(stepList, parentId = null, sourceHandle = null, startX = 250, startY = 50) {
    let currentParentId = parentId;
    let currentY = startY;
    let currentX = startX;
    let maxY = startY;

    for (let i = 0; i < stepList.length; i++) {
      const stepObj = stepList[i];
      const stepName = stepObj.name;
      const stepBody = stepObj.body;
      
      const nodeType = inferNodeType(stepBody);
      const nodeId = getId();

      nodes.push({
        id: nodeId,
        type: 'workflow',
        position: { x: currentX, y: currentY },
        data: {
          stepName: stepName,
          type: nodeType,
          body: JSON.stringify(stepBody, null, 2)
        }
      });

      if (currentParentId) {
        edges.push({
          id: `e_${currentParentId}-${nodeId}`,
          source: currentParentId,
          target: nodeId,
          ...(sourceHandle ? { sourceHandle } : {})
        });
        sourceHandle = null;
      }

      currentParentId = nodeId;
      currentY += 150;
      maxY = Math.max(maxY, currentY);

      // Обработка switch
      if (nodeType === 'switch') {
  const branches = stepBody.switch || [];
  const branchWidth = 250;
  const startBranchX = currentX - ((branches.length - 1) * branchWidth) / 2;
  let maxBranchY = currentY;
  const lastBranchIds = [];

  for (let idx = 0; idx < branches.length; idx++) {
    const branchObj = branches[idx];
    const branchKey = Object.keys(branchObj)[0];
    const branch = branchObj[branchKey];
    const thenTarget = branch.then || branchKey;

    let branchStartNodeId = null;
    let branchSteps = [];

    if (workflowDefs[thenTarget]) {
      // Берём определение подпроцесса
      branchSteps = mapRawSteps(workflowDefs[thenTarget]);
      usedDefs.add(thenTarget);

      if (branchSteps.length > 0) {
        // Первый шаг определения будет корнем ветки
        const firstStep = branchSteps[0];
        const firstNodeType = inferNodeType(firstStep.body);
        const firstNodeId = getId();
        nodes.push({
          id: firstNodeId,
          type: 'workflow',
          position: { x: startBranchX + idx * branchWidth, y: currentY },
          data: {
            stepName: firstStep.name,
            type: firstNodeType,
            body: JSON.stringify(firstStep.body, null, 2)
          }
        });
        edges.push({
          id: `e_${nodeId}-${firstNodeId}`,
          source: nodeId,
          target: firstNodeId
        });
        branchStartNodeId = firstNodeId;
        // Рекурсивно добавляем остальные шаги ветки
        const res = traverse(
          branchSteps.slice(1),
          firstNodeId,
          null,
          startBranchX + idx * branchWidth,
          currentY + 150
        );
        if (res.lastId) lastBranchIds.push(res.lastId);
        maxBranchY = Math.max(maxBranchY, res.maxY);
      } else {
        // Пустое определение – создаём заглушку с именем then
        const stubId = getId();
        nodes.push({
          id: stubId,
          type: 'workflow',
          position: { x: startBranchX + idx * branchWidth, y: currentY },
          data: {
            stepName: thenTarget,
            type: 'set',
            body: JSON.stringify({ set: { placeholder: true } })
          }
        });
        edges.push({
          id: `e_${nodeId}-${stubId}`,
          source: nodeId,
          target: stubId
        });
        lastBranchIds.push(stubId);
        maxBranchY = Math.max(maxBranchY, currentY + 150);
      }
    } else {
      // Определение не найдено – заглушка
      const stubId = getId();
      nodes.push({
        id: stubId,
        type: 'workflow',
        position: { x: startBranchX + idx * branchWidth, y: currentY },
        data: {
          stepName: thenTarget,
          type: 'set',
          body: JSON.stringify({ set: { undefined: true } })
        }
      });
      edges.push({
        id: `e_${nodeId}-${stubId}`,
        source: nodeId,
        target: stubId
      });
      lastBranchIds.push(stubId);
      maxBranchY = Math.max(maxBranchY, currentY + 150);
    }
  }

  // Точка слияния (join)
  const joinNodeId = getId();
  currentY = maxBranchY + 50;
  nodes.push({
    id: joinNodeId,
    type: 'workflow',
    position: { x: currentX, y: currentY },
    data: {
      stepName: `join_${Math.floor(Math.random() * 1000)}`,
      type: 'join',
      body: '{\n  "join": {}\n}'
    }
  });
  lastBranchIds.forEach(bId => {
    edges.push({ id: `e_${bId}-${joinNodeId}`, source: bId, target: joinNodeId });
  });

  currentParentId = joinNodeId;
  currentY += 150;
  maxY = Math.max(maxY, currentY);
}
      // Обработка parallel (fork)
      else if (nodeType === 'parallel') {
        const branches = stepBody.fork?.branches || [];
        const lastBranchIds = [];
        const branchWidth = 250;
        const startBranchX = currentX - ((branches.length - 1) * branchWidth) / 2;
        let maxBranchY = currentY;

        for (let idx = 0; idx < branches.length; idx++) {
          const branchObj = branches[idx];
          const branchKey = Object.keys(branchObj)[0];
          const rawBranchSteps = branchObj[branchKey]?.do || [];
          const branchSteps = mapRawSteps(rawBranchSteps);
          
          const bX = startBranchX + idx * branchWidth;
          const res = traverse(branchSteps, nodeId, null, bX, currentY);
          if (res.lastId && res.lastId !== nodeId) {
            lastBranchIds.push(res.lastId);
          }
          maxBranchY = Math.max(maxBranchY, res.maxY);
        }

        const joinNodeId = getId();
        currentY = maxBranchY + 50;
        nodes.push({
          id: joinNodeId,
          type: 'workflow',
          position: { x: currentX, y: currentY },
          data: {
            stepName: `join_${Math.floor(Math.random() * 1000)}`,
            type: 'join',
            body: '{\n  "join": {}\n}'
          }
        });
        lastBranchIds.forEach(bId => {
          edges.push({ id: `e_${bId}-${joinNodeId}`, source: bId, target: joinNodeId });
        });

        currentParentId = joinNodeId;
        currentY += 150;
        maxY = Math.max(maxY, currentY);
      }
      else if (nodeType === 'tryCatch') {
        // Парсим try
        const rawTrySteps = stepBody.try?.do || stepBody.try || [];
        const trySteps = mapRawSteps(rawTrySteps);
        
        // Парсим catch
        const rawCatchSteps = stepBody.catch?.do || [];
        const catchSteps = mapRawSteps(rawCatchSteps);

        let maxChildY = currentY;

        const tryRes = traverse(trySteps, nodeId, 'try', currentX - 180, currentY);
        const catchRes = traverse(catchSteps, nodeId, 'catch', currentX + 180, currentY);
        
        maxChildY = Math.max(maxChildY, tryRes.maxY, catchRes.maxY);
        currentY = maxChildY;
        maxY = Math.max(maxY, currentY);
        
        break; 
      }
    }
    return { lastId: currentParentId, maxY: maxY };
  }
traverse(mainSteps);


  return { nodes, edges };
}
const validateGraph = (nodes, edges) => {
  const errors = [];

  // Стартовые узлы
  const targetIds = new Set(edges.map(e => e.target));
  const startNodes = nodes.filter(n => !targetIds.has(n.id));
  if (startNodes.length === 0) {
    errors.push({ message: 'Нет стартового узла (без входящих рёбер).' });
  } else if (startNodes.length > 1) {
    const names = startNodes.map(n => n.data?.stepName || n.id).join(', ');
    errors.push({ message: `Несколько стартовых узлов: ${names}. Должен быть один основной поток.` });
  }

  // Проверка циклов (DFS)
  const state = {};
  nodes.forEach(n => state[n.id] = 0);
  const hasCycle = (nodeId) => {
    if (state[nodeId] === 1) return true;
    if (state[nodeId] === 2) return false;
    state[nodeId] = 1;
    const outEdges = edges.filter(e => e.source === nodeId);
    for (let edge of outEdges) {
      if (hasCycle(edge.target)) return true;
    }
    state[nodeId] = 2;
    return false;
  };
  if (startNodes.length > 0 && hasCycle(startNodes[0].id)) {
    errors.push({ message: 'Обнаружен цикл в графе.' });
  }

  // Достижимость всех узлов из стартового
  if (startNodes.length > 0) {
    const reachable = new Set();
    const dfs = (nodeId) => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      edges.filter(e => e.source === nodeId).forEach(e => dfs(e.target));
    };
    dfs(startNodes[0].id);
    const unreachable = nodes.filter(n => !reachable.has(n.id));
    if (unreachable.length > 0) {
      const names = unreachable.map(n => n.data?.stepName || n.id).join(', ');
      errors.push({ message: `Несвязанные узлы: ${names}.` });
    }
  }

  // Уникальность имён шагов
  const nameCounts = {};
  nodes.forEach(n => {
    const name = n.data?.stepName;
    if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
  });
  const duplicates = Object.entries(nameCounts).filter(([, c]) => c > 1).map(([n]) => n);
  if (duplicates.length > 0) {
    errors.push({ message: `Дублирующиеся имена шагов: ${duplicates.join(', ')}.` });
  }

  // Проверки по типам узлов
  nodes.forEach(node => {
    const outEdges = edges.filter(e => e.source === node.id);
    const data = node.data;
    if (!data) return;

    switch (data.type) {
      case 'parallel':
        if (outEdges.length < 2) {
          errors.push({ message: `Узел '${data.stepName}' (parallel) должен иметь ≥2 исходящие связи.` });
        }
        break;

      case 'switch': {
        let body;
        try {
          body = JSON.parse(data.body || '{}');
        } catch {
          errors.push({ message: `Узел '${data.stepName}' (switch): некорректный JSON.` });
          break;
        }
        const branches = body.switch || [];
        if (branches.length === 0) {
          errors.push({ message: `Узел '${data.stepName}' (switch): нет ни одного условия.` });
        }
        branches.forEach(branch => {
          const key = Object.keys(branch)[0];
          const thenTarget = branch[key]?.then;
          if (!thenTarget) {
            errors.push({ message: `Ветка '${key}' switch '${data.stepName}' не содержит 'then'.` });
          } else if (!['continue', 'exit', 'end'].includes(thenTarget) && !nodes.some(n => n.data?.stepName === thenTarget)) {
            errors.push({ message: `Для ветки '${key}' switch '${data.stepName}' не найден узел '${thenTarget}'.` });
          }
        });
        break;
      }

      case 'tryCatch':
        if (!outEdges.some(e => e.sourceHandle === 'try')) {
          errors.push({ message: `Узел '${data.stepName}' (tryCatch) не имеет ветки try.` });
        }
        if (!outEdges.some(e => e.sourceHandle === 'catch')) {
          errors.push({ message: `Узел '${data.stepName}' (tryCatch) не имеет ветки catch.` });
        }
        break;

      case 'join':
        if (outEdges.length > 1) {
          errors.push({ message: `Узел join '${data.stepName}' не должен иметь более одного исходящего ребра.` });
        }
        break;

      default:
        if (!['parallel', 'switch', 'tryCatch', 'join'].includes(data.type) && outEdges.length > 1) {
          errors.push({ message: `Узел '${data.stepName}' имеет >1 исходящих рёбер, что недопустимо для типа ${data.type}.` });
        }
    }
  });

  return errors;
};
export default function WorkflowEditor() {
  const getEventColor = (type) => {
  if (type.includes('Started')) return '#d4edda';   // светло-зелёный
  if (type.includes('Completed')) return '#cce5ff'; // светло-синий
  if (type.includes('Failed') || type.includes('TimedOut') || type.includes('Canceled')) return '#f8d7da'; // светло-красный
  if (type.includes('Scheduled')) return '#fff3cd'; // светло-жёлтый
  if (type.includes('Fired')) return '#e2d8f0';     // светло-фиолетовый (для TimerFired)
  return 'transparent';
};
  const { id } = useParams(); // Читаем ID из URL (например, /workflows/:id/edit)
  const navigate = useNavigate();

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [selectedNode, setSelectedNode] = useState(null);
  
  const [workflowId, setWorkflowId] = useState(null);
  const [runPayload, setRunPayload] = useState('{\n  "data": [\n    {\n      "orderType": "electronic"\n    }\n  ]\n}');
  const [runResult, setRunResult] = useState(null);
  const [runDetails, setRunDetails] = useState(null);
  const pollingIntervalRef = useRef(null);
  const historyIntervalRef = useRef(null);
  const [history, setHistory] = useState(null);
const [showHistory, setShowHistory] = useState(false);
const [validationErrors, setValidationErrors] = useState([]);
  
  // 1. ОПРЕДЕЛЕНИЕ РЕЖИМА И ЗАГРУЗКА
  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!id || id === 'new') {
        // Режим создания
        setNodes(initialNodes);
        setEdges([]);
        setWorkflowId(null);
        setIsInitializing(false);
        return;
      }

      // Режим редактирования
      try {
        const response = await fetch(`/api/workflows/${id}`);
        if (!response.ok) throw new Error('Ошибка загрузки воркфлоу');
        const wf = await response.json();

        setWorkflowId(wf.id);
        setWorkflowName(wf.name || 'Без названия');
        
        if (wf.steps && wf.steps.length > 0) {
          const graph = stepsToGraph(wf.steps);
          setNodes(graph.nodes);
          setEdges(graph.edges);
        } else {
          setNodes([]);
          setEdges([]);
        }
      } catch (error) {
        alert('Не удалось загрузить граф: ' + error.message);
        setNodes(initialNodes);
      } finally {
        setIsInitializing(false);
      }
    };

    fetchWorkflow();
  }, [id]);
    useEffect(() => {
    return () => stopPolling();
  }, []);
  useEffect(() => {
  const errors = validateGraph(nodes, edges);
  setValidationErrors(errors);
}, [nodes, edges]);
  useEffect(() => {
  if (showHistory && runDetails) {
    // Загружаем историю сразу
    fetchHistory(runDetails.workflow_id, runDetails.run_id);
    // Запускаем интервал обновления каждые 3 секунды
    historyIntervalRef.current = setInterval(() => {
      fetchHistory(runDetails.workflow_id, runDetails.run_id);
    }, 3000);
  }
  return () => {
    if (historyIntervalRef.current) {
      clearInterval(historyIntervalRef.current);
      historyIntervalRef.current = null;
    }
  };
}, [showHistory, runDetails]); // зависит от showHistory и runDetails

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const stopPolling = () => {
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
  }
};
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
  const fetchHistory = async (workflowId, runId) => {
  try {
    const response = await fetch(
      `/api/runs/${workflowId}/${runId}/history`
    );
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    setHistory(data.events);
    setShowHistory(true);
  } catch (err) {
    alert('Ошибка загрузки истории: ' + err.message);
  }
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

    const findJoinNode = (forkId) => {
      let queue = edges.filter(e => e.source === forkId).map(e => e.target);
      let seen = new Set();
      
      while(queue.length > 0) {
        let currId = queue.shift();
        if (seen.has(currId)) continue;
        seen.add(currId);
        
        let node = nodes.find(x => x.id === currId);
        if (node && node.data?.type === 'join') {
          return currId; 
        }
        
        let nextEdges = edges.filter(e => e.source === currId).map(e => e.target);
        queue.push(...nextEdges);
      }
      return null;
    };
    const findSwitchEndNode = (switchId) => {
  const outEdges = edges.filter(e => e.source === switchId);

  if (outEdges.length === 0) return null;

  let common = null;

  for (const edge of outEdges) {
    let queue = [edge.target];
    let visited = new Set();

    while (queue.length) {
      const id = queue.shift();

      if (visited.has(id)) continue;
      visited.add(id);

      const incoming = edges.filter(e => e.target === id);

      if (incoming.length > 1) {
        if (!common) common = id;
        else if (common === id) return id;
      }

      edges
        .filter(e => e.source === id)
        .forEach(e => queue.push(e.target));
    }
  }

  return common;
};

    const buildNativeSequence = (startNodeId, visited = new Set(), stopNodeId = null) => {
      let currentId = startNodeId;
      const sequence = [];

      while (currentId && currentId !== stopNodeId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const node = nodes.find(n => n.id === currentId);
        if (!node) break;

        let stepBody = {};
        if (node.data?.type === 'parallel') {
          const outEdges = edges.filter(e => e.source === currentId);
const joinNodeId = findJoinNode(currentId);

const branches = outEdges.map((edge, index) => ({
    [`branch_${index + 1}`]: {
        do: buildNativeSequence(edge.target, new Set(visited), joinNodeId)
    }
}));

sequence.push({
    [node.data.stepName]: {
        fork: {
            branches
        }
    }
});

if (joinNodeId) {
    currentId = joinNodeId;
    continue;
}

break;
        }
        else if (node.data?.type === 'join') {
          const outEdges = edges.filter(e => e.source === currentId);
          currentId = outEdges.length > 0 ? outEdges[0].target : null;
          continue; 
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
        else if (node.data?.type === 'switch') {
    const switchEnd = findSwitchEndNode(currentId);
    const body = JSON.parse(node.data.body || "{}");
    const conditions = body.switch || [];

    // Собираем все условия (ветки) без фильтрации по наличию рёбер
    const branches = conditions.map(cond => {
        const key = Object.keys(cond)[0];       // electronic / default и т.д.
        const value = cond[key];
        return {
            [key]: {
                when: value.when || undefined,
                then: value.then || key,
            }
        };
    });

    // Добавляем сам switch
    sequence.push({
        [node.data.stepName]: {
            switch: branches
        }
    });

    // Извлекаем уникальные then‑значения (имена подпроцессов)
    const thenNames = new Set(branches.map(b => Object.values(b)[0].then));

    for (const thenName of thenNames) {
        // flow‑директивы не нуждаются в объявлении отдельного workflow
        if (['continue', 'exit', 'end'].includes(thenName)) continue;

        // Ищем узел, имя которого совпадает с then
        const targetNode = nodes.find(n => n.data?.stepName === thenName);
        if (targetNode) {
            const subDo = buildNativeSequence(
                targetNode.id,
                new Set(visited),
                switchEnd
            );
            sequence.push({ [thenName]: { do: subDo } });
        } else {
            // Если узел не найден, создаём пустой workflow (заглушку)
            sequence.push({ [thenName]: { do: [] } });
        }
    }

    // Переходим к шагу после слияния
    currentId = switchEnd;
    continue;
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
      const errors = validateGraph(nodes, edges);
  if (errors.length > 0) {
    alert('Граф содержит ошибки:\n\n' + errors.map(e => '• ' + e.message).join('\n'));
    return;
  }
    try {
      const steps = getOrderedSteps();
      const payload = { name: workflowName, description: "UI Generated", steps };
      
      const url = workflowId 
        ? `/api/workflows/${workflowId}` 
        : '/api/workflows';
        
      const method = workflowId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());
      const resData = await response.json();
      
      setWorkflowId(resData.id); 
      setRunResult(null); 
      alert(`Сохранено успешно! ID: ${resData.id}`);
      
      // Если это было создание, обновляем урл, чтобы перевести в режим редактирования
      if (!workflowId) {
        navigate(`/workflows/${resData.id}/edit`, { replace: true });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRun = async () => {
    const errors = validateGraph(nodes, edges);
if (errors.length > 0) {
  alert('Граф содержит ошибки. Запуск невозможен.');
  return;
}
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
    const response = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedPayload),
    });

    if (!response.ok) throw new Error(await response.text());
    const resData = await response.json();
    setRunResult(resData);
    // Останавливаем предыдущий опрос, если был
    stopPolling();
    // Запускаем опрос каждые 3 секунды
    pollingIntervalRef.current = setInterval(() => {
      fetchRunDetails(resData.workflow_id, resData.run_id);
    }, 3000);
    // Сразу получаем первые детали
    fetchRunDetails(resData.workflow_id, resData.run_id);
  } catch (err) {
    alert('Ошибка запуска: ' + err.message);
  }
};
  const fetchRunDetails = async (workflowId, runId) => {
  try {
    const response = await fetch(
      `/api/runs/${workflowId}/${runId}`
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    setRunDetails(data);

    // Если статус конечный, останавливаем опрос
    const terminalStatuses = ['COMPLETED', 'FAILED', 'TERMINATED', 'TIMED_OUT', 'CANCELED'];
    if (terminalStatuses.includes(data.status)) {
      stopPolling();
    }
  } catch (err) {
    console.error(err);
    stopPolling(); // при ошибке тоже останавливаем
  }
};
  if (isInitializing) return <div style={{ padding: '20px' }}>Инициализация холста...</div>;

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
          deleteKeyCode={['Backspace', 'Delete']} 
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
            {validationErrors.length > 0 && (
  <div style={{ marginTop: 10, padding: 8, background: '#ffe0e0', border: '1px solid red', borderRadius: 4, fontSize: 12 }}>
    <b>⚠️ Ошибки валидации:</b>
    <ul style={{ margin: '4px 0 0 15px', paddingLeft: 10 }}>
      {validationErrors.map((err, i) => <li key={i}>{err.message}</li>)}
    </ul>
  </div>
)}

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
            {runResult && pollingIntervalRef.current &&(
                <p style={{ fontSize: 12, color: '#555', margin: '5px 0' }}>🔄 Автообновление...</p>
)}
{runDetails && (
  <div
    style={{
      marginTop: 10,
      padding: 10,
      background: "#eef5ff",
      borderRadius: 4
    }}

  >
    <div><b>Workflow ID:</b> {runDetails.workflow_id}</div>
    <div><b>Run ID:</b> {runDetails.run_id}</div>
    <div><b>Status:</b> {runDetails.status}</div>
    <div><b>Started:</b> {runDetails.start_time}</div>
    <div><b>History Lenght:</b>{runDetails.history_length}</div>
    <div><b>Workflow type:</b>{runDetails.workflow_type}</div>

{runDetails.close_time && (
  <div><b>Finished:</b> {runDetails.close_time}</div>
)}
<button
  onClick={() => setShowHistory(true)}
  style={{ marginTop: 8, padding: 4, cursor: 'pointer' }}
>
  📜 История
</button>
  </div>
  
)}
{showHistory && history && (
  <div style={{
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
    alignItems: 'center', zIndex: 1000
  }}>
    <div style={{
      background: 'white', padding: 20, borderRadius: 8, maxWidth: 800, width: '90%',
      maxHeight: '80vh', overflowY: 'auto'
    }}>
      <h3>История выполнения</h3>
      <button onClick={() => setShowHistory(false)} style={{ float: 'right', cursor: 'pointer' }}>
        ✖ Закрыть
      </button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: 5 }}>ID</th>
            <th style={{ padding: 5 }}>Время</th>
            <th style={{ padding: 5 }}>Тип события</th>
          </tr>
        </thead>
        <tbody>
          {history.map(ev => (
            <tr key={ev.eventId} style={{ backgroundColor: getEventColor(ev.type), borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: 5 }}>{ev.eventId}</td>
              <td style={{ padding: 5 }}>{ev.timestamp}</td>
              <td style={{ padding: 5 }}>{ev.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

            {runResult && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px', fontSize: '12px' }}>
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
            <option value="join">join (Точка слияния fork)</option>
            <option value="tryCatch">try/catch (Обработка ошибок)</option>
            <option value="call_http">call: HTTP (Внешний REST API)</option>
            <option value="call_activity">call: Activity (Код на воркере)</option>
            <option value="call_grpc">call: gRPC (Микросервисы)</option>
          </select>

          {/* ОБЩЕЕ ПОЛЕ IF (УСЛОВИЕ ВЫПОЛНЕНИЯ) */}
          <div style={{ marginTop: '15px', padding: '10px', background: '#e3f2fd', borderRadius: '4px', border: '1px solid #90caf9' }}>
            <label style={{ fontWeight: 'bold', fontSize: '12px', color: '#0d47a1' }}>
              Условие выполнения (if):
            </label>
            <input 
              type="text"
              value={JSON.parse(selectedNode.data.body || '{}').if || ''}
              onChange={(e) => {
                const val = e.target.value;
                try {
                  const currentBody = JSON.parse(selectedNode.data.body || '{}');
                  if (val.trim() === '') {
                    delete currentBody.if;
                    updateNodeData('body', JSON.stringify(currentBody, null, 2));
                  } else {
                    const { if: oldIf, ...restBody } = currentBody;
                    const newBody = { if: val, ...restBody };
                    updateNodeData('body', JSON.stringify(newBody, null, 2));
                  }
                } catch(err) {}
              }}
              placeholder="Например: ${ $input.integer % 2 == 0 }"
              style={{ width: '100%', padding: '6px', marginTop: '5px', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: '10px', color: '#555', margin: '4px 0 0 0' }}>
              Оставьте пустым для безусловного выполнения.
            </p>
          </div>

          <div style={{ marginTop: '15px', padding: '10px', background: '#eee', borderRadius: '4px' }}>
            {selectedNode.data.type === 'wait' && (
              <div>
                <label>Секунды:</label>
                <input 
                  type="number"
                  value={JSON.parse(selectedNode.data.body || '{"wait":{"seconds":0}}').wait?.seconds || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    try {
                      const currentBody = JSON.parse(selectedNode.data.body || '{}');
                      updateNodeData('body', JSON.stringify({ ...currentBody, wait: { seconds: val } }, null, 2));
                    } catch(err) {}
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
                        try {
                          const currentBody = JSON.parse(selectedNode.data.body || '{}');
                          const currentData = currentBody.set || {};
                          if (newKey !== key && currentData.hasOwnProperty(newKey)) {
                            alert("Ключ с таким именем уже существует!");
                            return;
                          }
                          const newData = { ...currentData };
                          delete newData[key];
                          newData[newKey] = value;
                          updateNodeData('body', JSON.stringify({ ...currentBody, set: newData }, null, 2));
                        } catch(err){}
                      }}
                      style={{ width: '40%', padding: '4px' }}
                    />
                    <input 
                      value={value} 
                      placeholder="Значение"
                      onChange={(e) => {
                        try {
                          const currentBody = JSON.parse(selectedNode.data.body || '{}');
                          const currentData = currentBody.set || {};
                          const newData = { ...currentData, [key]: e.target.value };
                          updateNodeData('body', JSON.stringify({ ...currentBody, set: newData }, null, 2));
                        } catch(err){}
                      }}
                      style={{ width: '60%', padding: '4px' }}
                    />
                  </div>
                ))}
                <button 
                  onClick={() => {
                    try {
                      const currentBody = JSON.parse(selectedNode.data.body || '{}');
                      const currentData = currentBody.set || {};
                      const newKeyName = "new_field";
                      if (currentData.hasOwnProperty(newKeyName)) {
                         alert("Сначала переименуйте существующее поле!");
                         return;
                      }
                      updateNodeData('body', JSON.stringify({ ...currentBody, set: { ...currentData, [newKeyName]: "значение" } }, null, 2));
                    } catch(err){}
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
                {JSON.parse(selectedNode.data.body || '{"switch":[]}').switch?.map((item, index) => {
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
                          try {
                            const currentBody = JSON.parse(selectedNode.data.body || '{}');
                            const newSwitch = [...(currentBody.switch || [])];
                            const branchData = newSwitch[index][type];
                            newSwitch[index] = { [newKey]: branchData };
                            updateNodeData('body', JSON.stringify({ ...currentBody, switch: newSwitch }, null, 2));
                          } catch(err){}
                        }}
                        style={{ width: '100%', marginBottom: '5px', padding: '4px' }}
                      />
                      
                      {type !== 'default' && (
                        <>
                          <label style={{ fontSize: '11px' }}>Условие (when):</label>
                          <input 
                            value={condition}
                            onChange={(e) => {
                              try {
                                const currentBody = JSON.parse(selectedNode.data.body || '{}');
                                const newSwitch = [...(currentBody.switch || [])];
                                newSwitch[index][type].when = e.target.value;
                                updateNodeData('body', JSON.stringify({ ...currentBody, switch: newSwitch }, null, 2));
                              } catch(err){}
                            }}
                            style={{ width: '100%', marginBottom: '5px', padding: '4px' }}
                          />
                        </>
                      )}

                      <label style={{ fontSize: '11px' }}>Перейти к (then):</label>
                      <input 
                        value={target}
                        onChange={(e) => {
                          try {
                            const currentBody = JSON.parse(selectedNode.data.body || '{}');
                            const newSwitch = [...(currentBody.switch || [])];
                            newSwitch[index][type].then = e.target.value;
                            updateNodeData('body', JSON.stringify({ ...currentBody, switch: newSwitch }, null, 2));
                          } catch(err){}
                        }}
                        style={{ width: '100%', padding: '4px' }}
                      />
                    </div>
                  );
                })}
                <button 
                  onClick={() => {
                    try {
                      const currentBody = JSON.parse(selectedNode.data.body || '{}');
                      const currentSwitch = currentBody.switch || [];
                      const newCondition = { 
                        "new_type": { "when": "${ $input.val == 'new' }", "then": "nextStep" } 
                      };
                      const newSwitch = [...currentSwitch.slice(0, -1), newCondition, currentSwitch[currentSwitch.length - 1]];
                      updateNodeData('body', JSON.stringify({ ...currentBody, switch: newSwitch }, null, 2));
                    } catch(err){}
                  }}
                  style={{ marginTop: '10px', width: '100%', padding: '8px', background: '#e0e0e0', border: 'none', cursor: 'pointer' }}
                >
                  + Добавить условие
                </button>
              </div>
            )}

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

            {/* 🔄 ДРУЖЕСТВЕННЫЙ ИНТЕРФЕЙС ДЛЯ FOR LOOP */}
            {selectedNode.data.type === 'for' && (() => {
              let bodyObj = { for: { each: "item", in: "", at: "index" }, do: [] };
              try { 
                bodyObj = JSON.parse(selectedNode.data.body || '{}'); 
              } catch(e) {}
              
              const forData = bodyObj.for || {};
              const doData = bodyObj.do || [];

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
                <div style={{ textAlign: 'left' }}>
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
                          const parsedDo = JSON.parse(rawText);
                          const newBody = { ...bodyObj, do: parsedDo };
                          updateNodeData('body', JSON.stringify(newBody, null, 2));
                        } catch (err) {
                          const newBody = { ...bodyObj, do: rawText };
                          updateNodeData('body', JSON.stringify(newBody));
                        }
                      }}
                      style={{ 
                        width: '100%', height: '180px', marginTop: '5px', 
                        fontFamily: 'monospace', fontSize: '11px', boxSizing: 'border-box'
                      }}
                      placeholder={`[
  {
    "stepName": {}
  }
]`}
                    />
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
    call_activity: "#607d8b", call_grpc: "#009688", join: "#757575"
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