import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchemaIcon from '@mui/icons-material/Schema';
import ShieldIcon from '@mui/icons-material/Shield';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';
import mermaid from 'mermaid';

// 初始化 Mermaid 图表编译器
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true
  }
});

// 从拓扑图自适应实时推导 Mermaid 二次控制原理图与主回路逻辑
function deriveMermaidFromTopology(
  nodes: Array<{ id: string; label: string; type: string }>,
  edges: Array<{ source: string; target: string; protocol?: string }>
): string {
  if (nodes.length === 0) {
    return `graph TD
  classDef default fill:#0f172a,stroke:#334155,stroke-width:2px,color:#94a3b8;
  NoData["[ 尚未生成项目原理图 ]\\n在左侧输入描述，或前往 [拓扑区] 添加器件以开始。"]`;
  }

  const lines: string[] = [];
  lines.push('graph TD');
  lines.push('  %% Style definitions for premium industrial look');
  lines.push('  classDef plc fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#c7d2fe;');
  lines.push('  classDef safety fill:#450a0a,stroke:#f87171,stroke-width:2px,color:#fecaca;');
  lines.push('  classDef power fill:#3b0764,stroke:#c084fc,stroke-width:2px,color:#f3e8ff;');
  lines.push('  classDef io fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#d1fae5;');
  lines.push('  classDef field fill:#0f172a,stroke:#475569,stroke-width:2px,color:#cbd5e1;');

  // 1. 划分电源分配主回路（L1/L2/L3 + 24V DC）
  lines.push('  subgraph PrimaryPower["三相主回路电源分配"]');
  lines.push('    L1L2L3["三相交流电源 L1/L2/L3\\n380V AC"]')
  lines.push('    MainBreaker["主回路断路器\\nQF1"]')
  lines.push('    L1L2L3 --> MainBreaker');
  lines.push('  end');

  lines.push('  subgraph ControlPower["24V DC 控制二次电源"]');
  lines.push('    PowerSupply["开关电源 U1\\n380VAC / 24VDC"]');
  lines.push('    ControlBreaker["控制断路器\\nQF2"]');
  lines.push('    MainBreaker -->|主接触器输出| PowerSupply');
  lines.push('    PowerSupply --> ControlBreaker');
  lines.push('  end');

  // 2. 区分和分类现有的元器件节点
  const contactors = nodes.filter(n => n.type.toLowerCase().includes('contactor') || n.label.toLowerCase().includes('接触器') || n.type.toLowerCase().includes('motor') || n.label.toLowerCase().includes('电机'));
  const safetyPlc = nodes.filter(n => n.type.toLowerCase().includes('safety') || n.label.toLowerCase().includes('安全'));
  const plc = nodes.filter(n => (n.type.toLowerCase().includes('plc') || n.label.toLowerCase().includes('1200') || n.label.toLowerCase().includes('控制器')) && !n.label.toLowerCase().includes('安全'));
  const estops = nodes.filter(n => n.label.toLowerCase().includes('急停') || n.label.toLowerCase().includes('门锁') || n.label.toLowerCase().includes('e-stop') || n.label.toLowerCase().includes('光幕'));
  const indicators = nodes.filter(n => n.label.toLowerCase().includes('灯') || n.label.toLowerCase().includes('指示') || n.type.toLowerCase().includes('lamp') || n.type.toLowerCase().includes('indicator'));

  // 3. 构建主回路动力链条
  if (contactors.length > 0) {
    lines.push('  subgraph MotorPowerLoop["三相动力负载驱动回路"]');
    contactors.forEach((c, idx) => {
      const safeContId = `Cont_${c.id.replace(/[-\s]+/g, '_')}`;
      lines.push(`    ${safeContId}["动力截止接触器/伺服\\nKM${idx + 1}"]`);
      lines.push(`    Motor_${idx + 1}["三相交流异步电机 / 伺服负载\\nM${idx + 1}"]`);
      lines.push(`    MainBreaker --> ${safeContId} --> Motor_${idx + 1}`);
      lines.push(`    class ${safeContId} power;`);
      lines.push(`    class Motor_${idx + 1} field;`);
    });
    lines.push('  end');
  }

  // 4. 构建安全控制输入回路
  if (estops.length > 0 || safetyPlc.length > 0) {
    lines.push('  subgraph SafetyLoop["ISO 13849-1 Cat.3 安全控制输入回路"]');
    estops.forEach((e, idx) => {
      const safeEstId = `Est_${e.id.replace(/[-\s]+/g, '_')}`;
      lines.push(`    ${safeEstId}["双通道安全限位开关/急停\\nSB${idx + 1}"]`);
      lines.push(`    ControlBreaker -->|24V DC 双回路| ${safeEstId}`);
      lines.push(`    class ${safeEstId} safety;`);
      
      if (safetyPlc.length > 0) {
        const safePlcId = `SPlc_${safetyPlc[0].id.replace(/[-\s]+/g, '_')}`;
        lines.push(`    ${safeEstId} -->|安全输入输入通道| ${safePlcId}`);
      }
    });
    
    if (safetyPlc.length > 0) {
      const safePlcId = `SPlc_${safetyPlc[0].id.replace(/[-\s]+/g, '_')}`;
      lines.push(`    ${safePlcId}["PIRZ 安全继电器/安全控制器\\nKC1"]`);
      lines.push(`    class ${safePlcId} safety;`);
      
      // 安全输出切断接触器控制回路
      if (contactors.length > 0) {
        contactors.forEach((c, idx) => {
          const safeContId = `Cont_${c.id.replace(/[-\s]+/g, '_')}`;
          lines.push(`    ${safePlcId} -->|冗余安全切断线圈输出| ${safeContId}`);
        });
      }
    }
    lines.push('  end');
  }

  // 5. 构建普通主控制器信号及指示反馈二次控制回路
  if (plc.length > 0 || indicators.length > 0) {
    lines.push('  subgraph StandardControl["PLC 信号与辅助监测回路"]');
    if (plc.length > 0) {
      const plcId = `Plc_${plc[0].id.replace(/[-\s]+/g, '_')}`;
      lines.push(`    ${plcId}["西门子 S7-1200 主PLC控制器\\nKF1"]`);
      lines.push(`    class ${plcId} plc;`);

      // 安全控制器辅助触点回传
      if (safetyPlc.length > 0) {
        const safePlcId = `SPlc_${safetyPlc[0].id.replace(/[-\s]+/g, '_')}`;
        lines.push(`    ${safePlcId} -->|安全回路状态诊断信号| ${plcId}`);
      }

      // 主PLC驱动指示灯
      if (indicators.length > 0) {
        indicators.forEach((ind, idx) => {
          const safeIndId = `Ind_${ind.id.replace(/[-\s]+/g, '_')}`;
          lines.push(`    ${safeIndId}["盘面运行诊断三色指示灯\\nHG${idx + 1}"]`);
          lines.push(`    ${plcId} -->|三极电晶体输出通道| ${safeIndId}`);
          lines.push(`    class ${safeIndId} io;`);
        });
      }
    }
    lines.push('  end');
  }

  // 6. 连通拓扑画布上的所有连线关系作为备用桥接
  edges.forEach((edge, i) => {
    const sId = edge.source.replace(/[-\s]+/g, '_');
    const tId = edge.target.replace(/[-\s]+/g, '_');
    
    // 如果这些节点存在于拓扑中，确保它们之间有弱逻辑关联虚线展示
    if (nodes.some(n => n.id === edge.source) && nodes.some(n => n.id === edge.target)) {
      lines.push(`  Node_${sId}["${nodes.find(n => n.id === edge.source)?.label}"] -.->|${edge.protocol || '回路'}| Node_${tId}["${nodes.find(n => n.id === edge.target)?.label}"]`);
    }
  });

  return lines.join('\n');
}

export function SCLPanel() {
  const mermaidCode = useStore((s) => s.mermaidCode);
  const ioItems = useStore((s) => s.ioItems);
  const topology = useStore((s) => s.topology);
  const language = useStore((s) => s.language);
  const tr = t(language);

  // 缩放控制 (1 = 100%)
  const [zoom, setZoom] = useState(1);
  const [svgHtml, setSvgHtml] = useState('');
  const [renderError, setRenderError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 导出下拉菜单状态
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(anchorEl);

  // 智能推导当前的原理图源码 (若后端无返回，则前端动态根据当前画布推导)
  const currentChartSource = mermaidCode || deriveMermaidFromTopology(topology.nodes, topology.edges);

  useEffect(() => {
    const renderChart = async () => {
      if (!currentChartSource) return;
      try {
        setRenderError('');
        // 生成唯一元素标识
        const elementId = 'mermaid-render-' + Math.random().toString(36).substring(2, 9);
        const { svg } = await mermaid.render(elementId, currentChartSource);
        setSvgHtml(svg);
      } catch (err: any) {
        console.error('Mermaid render failure:', err);
        // 如果出错，退回到拓扑自推导的极简图
        try {
          const fallbackSource = deriveMermaidFromTopology(topology.nodes, topology.edges);
          const elementId = 'mermaid-fallback-' + Math.random().toString(36).substring(2, 9);
          const { svg } = await mermaid.render(elementId, fallbackSource);
          setSvgHtml(svg);
        } catch {
          setRenderError('电气原理图语法校验未通过。正在等待后台多智能体重新生成设计...');
        }
      }
    };
    void renderChart();
  }, [currentChartSource, topology.nodes, topology.edges]);

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // 触发原理图相关文件下载
  const handleExport = (format: 'svg' | 'mermaid') => {
    handleMenuClose();
    if (format === 'svg' && svgHtml) {
      downloadFile(svgHtml, `${projectName()}_电气原理图.svg`, 'image/svg+xml');
    } else if (format === 'mermaid') {
      downloadFile(currentChartSource, `${projectName()}_原理图源码.mermaid`, 'text/plain');
    }
  };

  const projectName = () => {
    return useStore.getState().project?.name || 'Untitled_Project';
  };

  // 触发浏览器下载
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        p: 4,
        borderRadius: 5,
      }}
    >
      {/* Decorative background glow */}
      <Box
        sx={{
          position: 'absolute',
          right: -80,
          top: -80,
          width: 320,
          height: 320,
          bgcolor: 'rgba(99, 102, 241, 0.08)',
          borderRadius: '50%',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        }}
      />

      {/* Header controls bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3.5, position: 'relative', zIndex: 10 }}>
        <Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.5,
              bgcolor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: 999,
              mb: 1.25,
            }}
          >
            <SchemaIcon sx={{ fontSize: 13, color: 'primary.light' }} />
            <Typography
              sx={{
                color: 'primary.light',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontSize: '0.625rem'
              }}
            >
              System schematics
            </Typography>
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.75rem', color: 'text.primary', letterSpacing: '-0.02em' }}>
            电气原理控制逻辑图
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          {/* Zoom controls */}
          <Stack
            direction="row"
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '6px',
              bgcolor: 'background.paper',
              overflow: 'hidden',
              height: 36
            }}
          >
            <Button
              size="small"
              onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
              sx={{ minWidth: 36, color: 'text.secondary', p: 0, '&:hover': { bgcolor: 'action.hover' } }}
              title="缩小原理图"
            >
              <ZoomOutIcon sx={{ fontSize: 16 }} />
            </Button>
            <Box sx={{ px: 1.5, display: 'flex', alignItems: 'center', borderLeft: '1px solid', borderRight: '1px solid', borderColor: 'divider', fontSize: '0.6875rem', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'text.secondary' }}>
              {Math.round(zoom * 100)}%
            </Box>
            <Button
              size="small"
              onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
              sx={{ minWidth: 36, color: 'text.secondary', p: 0, '&:hover': { bgcolor: 'action.hover' } }}
              title="放大原理图"
            >
              <ZoomInIcon sx={{ fontSize: 16 }} />
            </Button>
          </Stack>

          {/* Export button */}
          <Button
            id="schematic-export-button"
            aria-controls={isMenuOpen ? 'schematic-export-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={isMenuOpen ? 'true' : undefined}
            variant="contained"
            onClick={handleMenuClick}
            startIcon={<FileDownloadIcon />}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontWeight: 700,
              fontSize: '0.75rem',
              px: 2.5,
              height: 36,
              borderRadius: '6px',
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
              '&:hover': {
                bgcolor: 'primary.dark',
                boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4)',
              },
            }}
          >
            导出图纸
          </Button>

          {/* Export Menu */}
          <Menu
            id="schematic-export-menu"
            anchorEl={anchorEl}
            open={isMenuOpen}
            onClose={handleMenuClose}
            MenuListProps={{
              'aria-labelledby': 'schematic-export-button',
            }}
            sx={{
              '& .MuiPaper-root': {
                borderRadius: '8px',
                mt: 1,
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                border: '1px solid',
                borderColor: 'divider',
                minWidth: 220,
              }
            }}
          >
            <MenuItem 
              onClick={() => handleExport('svg')}
              sx={{ fontSize: '0.75rem', fontWeight: 700, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}
            >
              <SchemaIcon sx={{ fontSize: 16, color: '#6366F1' }} />
              保存为高保真矢量图 (.svg)
            </MenuItem>
            <MenuItem 
              onClick={() => handleExport('mermaid')}
              sx={{ fontSize: '0.75rem', fontWeight: 700, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}
            >
              <FileDownloadIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              保存为 Mermaid 源码 (.mermaid)
            </MenuItem>
          </Menu>
        </Stack>
      </Box>

      {/* Schematic drawing canvas */}
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          overflow: 'hidden',
          borderRadius: '12px',
          borderColor: 'divider',
          bgcolor: '#0a0a0a', // 暗黑色工装图纸图板背景
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.05)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        {renderError ? (
          <Box sx={{ textAlign: 'center', color: 'text.disabled', maxWidth: 450, px: 3 }}>
            <ShieldIcon sx={{ fontSize: 40, color: 'warning.main', mb: 2, opacity: 0.8 }} />
            <Typography sx={{ fontSize: '0.8125rem', fontFamily: '"JetBrains Mono", monospace' }}>
              {renderError}
            </Typography>
          </Box>
        ) : !svgHtml ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
              正在编译并分析电气拓扑逻辑...
            </Typography>
          </Box>
        ) : (
          <Box
            ref={containerRef}
            className="custom-scrollbar"
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
              '& svg': {
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                maxWidth: 'none !important',
                height: 'auto !important',
              }
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}

        {/* Floating Dynamic Sync Indicator */}
        {topology.nodes.length > 0 && !renderError && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              bgcolor: 'rgba(15,23,42,0.85)',
              backdropFilter: 'blur(4px)',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '4px',
              px: 1.5,
              py: 0.75,
              fontSize: '0.625rem',
              fontFamily: '"JetBrains Mono", monospace',
              color: '#34D399',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <Box
              sx={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                bgcolor: '#34D399',
                boxShadow: '0 0 8px #34D399',
                '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                animation: 'blink 1.5s infinite'
              }}
            />
            拓扑图数据动态联动中
          </Box>
        )}
      </Paper>
    </Box>
  );
}
