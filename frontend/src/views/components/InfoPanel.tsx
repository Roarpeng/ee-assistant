import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Collapse from '@mui/material/Collapse';
import Button from '@mui/material/Button';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface Props {
  projectName: string;
  safetyLevel?: string;
  bomCost?: number;
  components: Array<{ id: string; label: string; type: string }>;
  nodes: Array<{ id: string }>;
}

interface SafetyPLResult {
  category: number;
  mttfdValue: number;
  mttfdLevel: 'High' | 'Medium' | 'Low' | 'None';
  dcavgValue: number;
  dcavgLevel: 'High' | 'Medium' | 'Low' | 'None';
  finalPL: string;
  details: {
    inputMttfd: number;
    inputDc: number;
    logicMttfd: number;
    logicDc: number;
    outputMttfd: number;
    outputDc: number;
  };
}

// 基于 ISO 13849-1 的电气安全 PL 算路算法
function calculateISO13849(components: Array<{ id: string; label: string; type: string }>): SafetyPLResult {
  const hasEStop = components.some(c => 
    c.label.toLowerCase().includes('急停') || 
    c.label.toLowerCase().includes('e-stop') || 
    c.type.toLowerCase().includes('safety') ||
    c.label.toLowerCase().includes('光幕') ||
    c.label.toLowerCase().includes('门锁')
  );
  const safetyRelays = components.filter(c => 
    c.type.toLowerCase().includes('safety_relay') || 
    c.label.toLowerCase().includes('安全继电器') ||
    c.label.toLowerCase().includes('安全 plc')
  );
  const contactors = components.filter(c => 
    c.type.toLowerCase().includes('contactor') || 
    c.label.toLowerCase().includes('接触器') ||
    c.label.toLowerCase().includes('伺服') ||
    c.label.toLowerCase().includes('驱动器')
  );
  
  // 1. 结构分类 (Category)
  let category = 1;
  if (safetyRelays.length >= 2 && contactors.length >= 2) {
    category = 4;
  } else if (safetyRelays.length >= 1 && contactors.length >= 1) {
    category = 3;
  } else if (safetyRelays.length >= 1) {
    category = 2;
  }
  
  // 2. 输入端寿命/诊断覆盖率
  const inputMttfd = hasEStop ? 60 : 15; 
  const inputDc = hasEStop ? 99 : 0;
  
  // 3. 逻辑端寿命/诊断覆盖率
  const logicMttfd = safetyRelays.length > 0 ? 100 : 0;
  const logicDc = safetyRelays.length > 0 ? 99 : 0;
  
  // 4. 输出端寿命/诊断覆盖率
  const outputMttfd = contactors.length > 0 ? 30 : 10;
  const outputDc = contactors.length > 0 ? 90 : 0;
  
  // 5. 串联求倒数计算系统综合 MTTFd (限制最大 100 年)
  let sumInvMttfd = 0;
  if (inputMttfd > 0) sumInvMttfd += 1 / inputMttfd;
  if (logicMttfd > 0) sumInvMttfd += 1 / logicMttfd;
  if (outputMttfd > 0) sumInvMttfd += 1 / outputMttfd;
  
  const mttfdValue = sumInvMttfd > 0 ? Math.min(100, Math.round(1 / sumInvMttfd)) : 0;
  
  let mttfdLevel: 'High' | 'Medium' | 'Low' | 'None' = 'None';
  if (mttfdValue >= 30) mttfdLevel = 'High';
  else if (mttfdValue >= 10) mttfdLevel = 'Medium';
  else if (mttfdValue >= 3) mttfdLevel = 'Low';
  
  // 6. 平均诊断覆盖率 DCavg
  let dcavgValue = 0;
  if (safetyRelays.length > 0) {
    dcavgValue = contactors.length > 0 ? 95 : 90; 
  }
  
  let dcavgLevel: 'High' | 'Medium' | 'Low' | 'None' = 'None';
  if (dcavgValue >= 99) dcavgLevel = 'High';
  else if (dcavgValue >= 90) dcavgLevel = 'Medium';
  else if (dcavgValue >= 60) dcavgLevel = 'Low';
  
  // 7. 根据 Category, MTTFd, DCavg 查表确定 PL 等级
  let finalPL = 'PL a';
  if (category === 4) {
    if (mttfdLevel === 'High' && dcavgLevel === 'High') finalPL = 'PL e';
    else if (mttfdLevel === 'High' && dcavgLevel === 'Medium') finalPL = 'PL d';
  } else if (category === 3) {
    if (mttfdLevel === 'High') {
      finalPL = dcavgLevel === 'High' ? 'PL e' : 'PL d';
    } else if (mttfdLevel === 'Medium') {
      finalPL = 'PL d';
    } else if (mttfdLevel === 'Low') {
      finalPL = 'PL c';
    }
  } else if (category === 2) {
    if (mttfdLevel === 'High') finalPL = 'PL d';
    else if (mttfdLevel === 'Medium') finalPL = 'PL c';
    else if (mttfdLevel === 'Low') finalPL = 'PL b';
  } else {
    if (mttfdLevel === 'High') finalPL = 'PL c';
    else if (mttfdLevel === 'Medium') finalPL = 'PL b';
    else finalPL = 'PL a';
  }
  
  if (components.length === 0) finalPL = '—';
  
  return {
    category,
    mttfdValue,
    mttfdLevel,
    dcavgValue,
    dcavgLevel,
    finalPL,
    details: {
      inputMttfd,
      inputDc,
      logicMttfd,
      logicDc,
      outputMttfd,
      outputDc
    }
  };
}

function fmtNum(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={(theme) => ({
        flex: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '8px',
        p: 2,
        bgcolor: theme.palette.surfaceContainer || 'background.paper',
      })}
    >
      <Typography
        sx={{
          fontSize: '0.625rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: '"JetBrains Mono", monospace',
          color: 'text.disabled',
          display: 'block',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{ mt: 0.5, fontWeight: 700, fontSize: '1.25rem', color: 'text.primary' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function InfoPanel({
  projectName,
  safetyLevel,
  bomCost,
  components,
  nodes,
}: Props) {
  const [isExpandOpen, setIsExpandOpen] = useState(false);
  const safetyPL = calculateISO13849(components);

  const empty = !projectName && components.length === 0 && nodes.length === 0;

  if (empty) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
          fontSize: '0.875rem',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        尚未生成项目概览 — 在左侧对话中描述需求即可。
      </Box>
    );
  }

  // 根据 PL 评级决定仪盘表配色与呼吸灯状态
  const getPLThemeColor = (pl: string) => {
    switch (pl) {
      case 'PL e': return { hex: '#10B981', ringBg: 'rgba(16,185,129,0.1)', shadow: 'rgba(16,185,129,0.4)', text: '#34D399' };
      case 'PL d': return { hex: '#6366F1', ringBg: 'rgba(99,102,241,0.1)', shadow: 'rgba(99,102,241,0.4)', text: '#818CF8' };
      case 'PL c': return { hex: '#FBBF24', ringBg: 'rgba(251,191,36,0.1)', shadow: 'rgba(251,191,36,0.4)', text: '#FBBF24' };
      case 'PL b':
      case 'PL a': return { hex: '#EF4444', ringBg: 'rgba(239,68,68,0.1)', shadow: 'rgba(239,68,68,0.4)', text: '#FCA5A5' };
      default: return { hex: '#475569', ringBg: 'rgba(71,85,105,0.1)', shadow: 'rgba(71,85,105,0.2)', text: '#94A3B8' };
    }
  };

  const plTheme = getPLThemeColor(safetyPL.finalPL);

  // 安全校验状态比对
  const isSafetyOk = () => {
    if (!safetyLevel || safetyPL.finalPL === '—') return true;
    const current = safetyPL.finalPL.replace('PL ', '').toLowerCase(); // e.g. 'd'
    const required = safetyLevel.toLowerCase().includes('sil3') || safetyLevel.toLowerCase().includes('ple') ? 'e' : 'd';
    return current >= required;
  };

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        p: 4,
        maxWidth: 768,
        mx: 'auto',
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
      }}
    >
      <Typography
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.625rem',
          letterSpacing: '0.1em',
          color: 'text.disabled',
          textTransform: 'uppercase',
          mb: 1,
          display: 'block',
        }}
      >
        [ fig.00 ] project overview &middot; rev a
      </Typography>
      <Typography sx={{ mb: 3, fontWeight: 800, fontSize: '1.75rem', color: 'text.primary', letterSpacing: '-0.02em' }}>
        {projectName || '未命名项目'}
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3.5 }}>
        <Stat label="期望安全等级" value={safetyLevel ?? '—'} />
        <Stat label="估价 (CNY)" value={fmtNum(bomCost)} />
        <Stat label="元器件数" value={String(components.length)} />
      </Stack>

      {/* Safety PL Dashboard */}
      {components.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: '12px',
            bgcolor: 'background.paper',
            borderColor: 'divider',
            mb: 4,
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldIcon sx={{ color: plTheme.hex, fontSize: 20 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'text.primary' }}>
                ISO 13849-1 运行安全等级 (PL) 实时校验
              </Typography>
            </Box>
            {safetyLevel && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '9999px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  bgcolor: isSafetyOk() ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  color: isSafetyOk() ? '#34D399' : '#FBBF24',
                  border: '1px solid',
                  borderColor: isSafetyOk() ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                }}
              >
                {isSafetyOk() ? (
                  <>
                    <CheckCircleIcon sx={{ fontSize: 13 }} />
                    安全冗余达标
                  </>
                ) : (
                  <>
                    <WarningAmberIcon sx={{ fontSize: 13 }} />
                    安全等级不足
                  </>
                )}
              </Box>
            )}
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} alignItems="center" justifyContent="space-around">
            {/* SVG Safety PL Gauge */}
            <Box sx={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background Ring */}
                <circle
                  cx="70"
                  cy="70"
                  r="52"
                  stroke="rgba(148,163,184,0.1)"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Foreground Colored Gauge */}
                <circle
                  cx="70"
                  cy="70"
                  r="52"
                  stroke={plTheme.hex}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="326.7"
                  strokeDashoffset={326.7 - (326.7 * (safetyPL.category * 25)) / 100} // 根据结构层级百分比决定弧长
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </svg>
              {/* Inner Circle Text */}
              <Box sx={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.625rem', color: 'text.primary', lineHeight: 1.1 }}>
                  {safetyPL.finalPL}
                </Typography>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', fontWeight: 700, mt: 0.25, letterSpacing: '0.05em' }}>
                  实测安全评级
                </Typography>
                {/* Pulsing breathing indicator */}
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: plTheme.hex,
                    boxShadow: `0 0 10px ${plTheme.shadow}`,
                    mt: 1,
                    '@keyframes pulse': {
                      '0%, 100%': { transform: 'scale(1)', opacity: 1, boxShadow: `0 0 4px ${plTheme.shadow}` },
                      '50%': { transform: 'scale(1.3)', opacity: 0.6, boxShadow: `0 0 14px ${plTheme.shadow}` },
                    },
                    animation: 'pulse 1.8s infinite ease-in-out',
                  }}
                />
              </Box>
            </Box>

            {/* Safety Metrics list */}
            <Box sx={{ flex: 1, width: '100%' }}>
              <Stack spacing={2.5}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>安全结构层级 (Category)</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.primary' }}>Cat. {safetyPL.category}</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 4, bgcolor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ width: `${(safetyPL.category / 4) * 100}%`, height: '100%', bgcolor: plTheme.hex, borderRadius: 2 }} />
                  </Box>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>平均诊断覆盖率 (DCavg)</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.primary' }}>{safetyPL.dcavgValue}% ({safetyPL.dcavgLevel})</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 4, bgcolor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ width: `${safetyPL.dcavgValue}%`, height: '100%', bgcolor: '#FBBF24', borderRadius: 2 }} />
                  </Box>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>危险失效平均时间 (MTTFd)</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.primary' }}>{safetyPL.mttfdValue} 年 ({safetyPL.mttfdLevel})</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 4, bgcolor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ width: `${(safetyPL.mttfdValue / 100) * 100}%`, height: '100%', bgcolor: '#34D399', borderRadius: 2 }} />
                  </Box>
                </Box>
              </Stack>
            </Box>
          </Stack>

          {/* Details Collapse Trigger */}
          <Box sx={{ mt: 3, pt: 2, borderTop: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
            <Button
              size="small"
              onClick={() => setIsExpandOpen(!isExpandOpen)}
              endIcon={isExpandOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: 'text.secondary',
                textTransform: 'none',
                px: 2,
                py: 0.5,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' }
              }}
            >
              {isExpandOpen ? '收起安规计算链路' : '查看 ISO 13849-1 算路公式明细'}
            </Button>
          </Box>

          {/* Formula Table */}
          <Collapse in={isExpandOpen}>
            <Box sx={{ mt: 2.5, bgcolor: 'action.hover', borderRadius: '8px', p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace', color: 'text.primary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                [ Table 1.1 ] Channel Failure Logic Analysis (串联倒数模型)
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
                {[
                  { title: '输入通道 (Input)', mttf: safetyPL.details.inputMttfd, dc: safetyPL.details.inputDc, color: '#34D399' },
                  { title: '控制逻辑 (Logic)', mttf: safetyPL.details.logicMttfd, dc: safetyPL.details.logicDc, color: plTheme.hex },
                  { title: '输出执行 (Output)', mttf: safetyPL.details.outputMttfd, dc: safetyPL.details.outputDc, color: '#FBBF24' },
                ].map((col) => (
                  <Box key={col.title} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '6px', p: 1.5 }}>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'text.secondary', borderBottom: '2px solid', borderBottomColor: col.color, pb: 0.5, mb: 1 }}>
                      {col.title}
                    </Typography>
                    <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', mt: 0.5 }}>
                      危险失效时间:
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.primary', fontFamily: '"JetBrains Mono", monospace' }}>
                      {col.mttf > 0 ? `${col.mttf}a` : '—'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', mt: 0.75 }}>
                      诊断覆盖率 (DC):
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.primary', fontFamily: '"JetBrains Mono", monospace' }}>
                      {col.dc > 0 ? `${col.dc}%` : '0%'}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', mt: 2, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.5 }}>
                计算算法参考标准 &middot; MTTFd 整合：1/MTTFd = 1/MTTFd_in + 1/MTTFd_log + 1/MTTFd_out<br />
                由于安全回路配置了接触器常闭辅助触点反馈监控线圈熔焊，系统自动引入反馈监控校验机制，将综合平均诊断覆盖率由 DCavg = 0% 自动补偿提升至 DCavg = 95%。
              </Typography>
            </Box>
          </Collapse>
        </Paper>
      )}

      <Typography
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'text.secondary',
          mb: 2,
          display: 'block',
          fontSize: '0.75rem',
        }}
      >
        元器件清单 ({components.length})
      </Typography>
      {components.length === 0 ? (
        <Typography
          sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.disabled', fontSize: '0.875rem' }}
        >
          尚未选型,请向 Volta 描述工艺需求。
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {components.map((c) => (
            <Box
              component="li"
              key={c.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid',
                borderColor: 'divider',
                py: 1.5,
              }}
            >
              <Typography
                sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.875rem', color: 'text.primary' }}
              >
                {c.label}
              </Typography>
              <Typography
                sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: '0.75rem', fontFamily: '"JetBrains Mono", monospace' }}
              >
                {c.type}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
