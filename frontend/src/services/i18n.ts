export type Lang = 'zh' | 'en';
export type TranslationDict = typeof zh;

const zh = {
  app: { name: 'Volta', tagline: '电气工程智能设计平台' },
  header: {
    topology: '拓扑图',
    bom: '物料清单',
    code: 'ST 代码',
    version: 'v2.0.0',
  },
  chat: {
    tab: '对话',
    knowledge: '知识库',
    agent: 'LangGraph Agent',
    placeholder: '输入消息...',
    processing: 'LangGraph 处理中...',
    send: '发送',
    error: '错误',
    initStatus: '正在初始化 LangGraph 状态机...',
    completed: '任务执行完成。',
    welcome: '描述你的电气控制需求，开始设计。',
    example: '示例："设计一条带 3 台电机、急停按钮和互锁逻辑的传送带控制系统"',
  },
  topology: {
    active: '实时拓扑',
    sync: '同步到 SCL 代码',
    syncing: '同步中...',
    exportSvg: '导出 SVG',
    delete: '删除选中',
  },
  bom: {
    title: '物料清单',
    export: '导出 Excel',
    filter: '筛选',
    search: '搜索元器件...',
    itemNo: '序号',
    component: '元器件名称',
    manufacturer: '制造商',
    partNo: '型号',
    qty: '数量',
    specs: '规格参数',
  },
  scl: {
    title: 'PLC 代码 (SCL)',
    target: '目标平台: S7-1500',
    download: '下载代码',
    loading: '加载编辑器中...',
  },
  settings: {
    title: '系统设置',
    chatModel: '对话模型',
    embeddingModel: '向量模型',
    apiKey: 'API Key',
    baseUrl: 'Base URL',
    modelName: '模型名称',
    save: '保存配置',
    cancel: '取消',
    chatDesc: '用于需求拆解与元器件选型推理。',
    embedDesc: '用于设备规格和手册的向量化检索。',
  },
  knowledge: {
    title: '文档库',
    search: '搜索规格、文档...',
    upload: '上传文档',
    docs: [
      { title: 'Siemens S7-1500 手册', type: 'PDF', tags: ['PLC', 'Siemens'] },
      { title: 'SINAMICS G120C 通讯', type: 'DOCX', tags: ['VFD', 'Profinet'] },
      { title: 'IEC 61131-3 标准', type: 'PDF', tags: ['标准'] },
      { title: 'Pilz PNOZ X2.7P 规格', type: 'PDF', tags: ['安全'] },
      { title: 'ET200SP 硬件配置', type: 'PDF', tags: ['远程IO'] },
    ],
  },
};

const en: TranslationDict = {
  app: { name: 'Volta', tagline: 'Electrical Engineering AI Design Platform' },
  header: {
    topology: 'Topology',
    bom: 'BOM',
    code: 'ST Code',
    version: 'v2.0.0',
  },
  chat: {
    tab: 'Chat',
    knowledge: 'Knowledge',
    agent: 'LangGraph Agent',
    placeholder: 'Type a message...',
    processing: 'Processing via LangGraph...',
    send: 'Send',
    error: 'Error',
    initStatus: 'Initializing LangGraph state machine...',
    completed: 'Task completed successfully.',
    welcome: 'Describe your electrical control requirements to get started.',
    example: 'Example: "Design a conveyor system with 3 motors, E-Stop, and interlock logic"',
  },
  topology: {
    active: 'Active Topology',
    sync: 'Sync to SCL Code',
    syncing: 'Syncing...',
    exportSvg: 'Export SVG',
    delete: 'Delete Selected',
  },
  bom: {
    title: 'Bill of Materials',
    export: 'Export Excel',
    filter: 'Filters',
    search: 'Search parts...',
    itemNo: 'Item No.',
    component: 'Component Name',
    manufacturer: 'Manufacturer',
    partNo: 'Part Number',
    qty: 'Qty',
    specs: 'Specifications',
  },
  scl: {
    title: 'PLC Code (SCL)',
    target: 'Compiler Target: S7-1500',
    download: 'Download Code',
    loading: 'Loading editor...',
  },
  settings: {
    title: 'System Settings',
    chatModel: 'Chat Model',
    embeddingModel: 'Embedding Model',
    apiKey: 'API Key',
    baseUrl: 'Base URL',
    modelName: 'Model Name',
    save: 'Save Configuration',
    cancel: 'Cancel',
    chatDesc: 'Used for requirements breakdown and component selection logic.',
    embedDesc: 'Used for vectorizing equipment specs and manual searches.',
  },
  knowledge: {
    title: 'Document Library',
    search: 'Search specs, docs...',
    upload: 'Upload Document',
    docs: [
      { title: 'Siemens S7-1500 Manual', type: 'PDF', tags: ['PLC', 'Siemens'] },
      { title: 'SINAMICS G120C Comm', type: 'DOCX', tags: ['VFD', 'Profinet'] },
      { title: 'IEC 61131-3 Standard', type: 'PDF', tags: ['Standard'] },
      { title: 'Pilz PNOZ X2.7P Specs', type: 'PDF', tags: ['Safety'] },
      { title: 'ET200SP Hardware config', type: 'PDF', tags: ['Remote IO'] },
    ],
  },
};

const dictionaries = { zh, en };

export function t(lang: Lang): TranslationDict {
  return dictionaries[lang];
}

export function getInitialLang(): Lang {
  try {
    const stored = localStorage.getItem('volta-lang');
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return 'zh';
}
