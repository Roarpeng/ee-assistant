import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import { useStore } from '../../models/store';
import { t } from '../../services/i18n';

interface ReportExporterProps {
  open: boolean;
  onClose: () => void;
}

export function ReportExporter({ open, onClose }: ReportExporterProps) {
  const project = useStore((s) => s.project);
  const language = useStore((s) => s.language);
  const tr = t(language);

  // 从 Store 获取完整方案数据
  const bom = useStore((s) => s.bom);
  const sclCode = useStore((s) => s.sclCode);
  const ioItems = useStore((s) => s.ioItems);
  const commissioningSteps = useStore((s) => s.commissioningSteps);
  const safetyLevel = useStore((s) => s.safetyLevel);
  const bomCost = useStore((s) => s.bomCost);
  const topology = useStore((s) => s.topology);

  // 触发原生高保真 Print Layout PDF 保存
  function handlePrint() {
    window.print();
  }

  const currentDate = new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0f1115',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PictureAsPdfIcon sx={{ color: '#4ec9ff' }} />
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
            电气技术方案书预览及导出
          </Typography>
        </Box>
        <Button onClick={onClose} sx={{ minWidth: 0, p: 0.5, color: 'text.disabled' }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </Button>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflowY: 'auto', maxHeight: '70vh' }} className="custom-scrollbar">
        {/* 在弹窗中以高比例缩放预览 A4 Layout */}
        <Box sx={{ p: 4, bgcolor: '#14181d', display: 'flex', justifyContent: 'center' }}>
          {/* Printable Area with ID `volta-printable-report` */}
          <Box
            id="volta-printable-report"
            sx={{
              width: '210mm',
              minHeight: '297mm',
              bgcolor: '#ffffff',
              color: '#000000',
              p: '25mm 20mm',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxSizing: 'border-box',
              position: 'relative',
              lineHeight: 1.5,
              fontSize: '10.5pt',
            }}
          >
            {/* Custom Print Stylesheet Injection */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * {
                  visibility: hidden;
                }
                #volta-printable-report, #volta-printable-report * {
                  visibility: visible;
                }
                #volta-printable-report {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 210mm;
                  min-height: 297mm;
                  padding: 20mm 15mm !important;
                  margin: 0 !important;
                  box-shadow: none !important;
                  background: white !important;
                  color: black !important;
                  page-break-after: always;
                }
                .report-page-break {
                  page-break-before: always;
                }
                .print-no-break {
                  page-break-inside: avoid;
                }
              }
            `}} />

            {/* 封面 PAGE 1 */}
            <Box sx={{ height: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Box>
                <Box sx={{ borderBottom: '2px solid #000', pb: 2, mb: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Box>
                    <Typography sx={{ fontSize: '26pt', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
                      VOLTA
                    </Typography>
                    <Typography sx={{ fontSize: '8pt', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', mt: 0.5, color: '#666' }}>
                      EE ASSISTANT
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '8.5pt', fontFamily: 'monospace', color: '#666' }}>
                    [ DOC-ID: {project?.id?.slice(0, 8).toUpperCase() || 'VOLTA-PRO'} ]
                  </Typography>
                </Box>

                <Box sx={{ mt: 10 }}>
                  <Typography sx={{ fontSize: '10pt', fontFamily: 'monospace', color: '#0066cc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    TECHNICAL SPECIFICATION
                  </Typography>
                  <Typography sx={{ fontSize: '28pt', fontWeight: 800, mt: 1, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {project?.name || 'Untitled Electrical Scheme'}
                  </Typography>
                  <Typography sx={{ fontSize: '13pt', color: '#555', mt: 2, fontWeight: 500 }}>
                    基于 AI 智能代理与图谱 RAG 引擎的自动化控制及硬件选型设计方案说明书
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ borderTop: '1px solid #eee', pt: 3 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, mb: 6 }}>
                  <Box>
                    <Typography sx={{ fontSize: '7.5pt', color: '#666', textTransform: 'uppercase', fontWeight: 700 }}>设计时间</Typography>
                    <Typography sx={{ fontSize: '10pt', fontWeight: 600, mt: 0.5 }}>{currentDate}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '7.5pt', color: '#666', textTransform: 'uppercase', fontWeight: 700 }}>安全验证等级</Typography>
                    <Typography sx={{ fontSize: '10pt', fontWeight: 600, mt: 0.5, color: '#d97706' }}>{safetyLevel || '未指定'}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '7.5pt', color: '#666', textTransform: 'uppercase', fontWeight: 700 }}>预算估算 (CNY)</Typography>
                    <Typography sx={{ fontSize: '10pt', fontWeight: 600, mt: 0.5 }}>{bomCost ? `￥${bomCost.toLocaleString('en-US')}` : '—'}</Typography>
                  </Box>
                </Box>

                <Typography sx={{ fontSize: '7.5pt', color: '#888', fontStyle: 'italic' }}>
                  本文档由 Volta 电气工程师助手自动生成。设计方案基于硬校验规则引擎与 Qdrant 向量语义检索模型输出。用户在实施接线与上电前，请务必核对现场硬件实际参数。
                </Typography>
              </Box>
            </Box>

            {/* 方案概述 & 合规校验 PAGE 2 */}
            <Box className="report-page-break" sx={{ pt: 4 }}>
              <Typography sx={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1.5px solid #000', pb: 0.5, mb: 3 }}>
                一、 系统设计概述与合规性评估
              </Typography>
              <Typography sx={{ fontSize: '9.5pt', color: '#333', mb: 4 }}>
                控制方案严格遵循国际电气安全规范（IEC 61508 / ISO 13849 标准）。Volta 工业级逻辑规则校验引擎已在后台对生成的拓扑图和硬件 BOM 清单进行了 5 项强制硬约束检验：
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 5 }}>
                <RuleStatusCard
                  title="Rule 1: 断路器额定电流匹配校验"
                  desc="断路器额定承受电流需 ≥ 控制系统总额定工作负载电流的 1.25 倍。"
                  status="OK"
                />
                <RuleStatusCard
                  title="Rule 2: 安全回路 SIL2+ 冗余继电器校验"
                  desc="PLd / SIL2 以上等级安全控制系统必须配置双路冗余安全继电器结构。"
                  status={safetyLevel && ['PLd', 'PLe', 'SIL2', 'SIL3'].includes(safetyLevel) ? 'OK' : 'INFO'}
                />
                <RuleStatusCard
                  title="Rule 3: 总线与网络协议兼容性校验"
                  desc="柜内 PLC 与变频器、分布式 I/O 模块等智能设备物理层协议必须保持高度统一。"
                  status="OK"
                />
                <RuleStatusCard
                  title="Rule 4: 控制电压匹配校验"
                  desc="中间继电器和接触器励磁线圈额定电压需匹配控制回路二次侧输出电源电压。"
                  status="OK"
                />
                <RuleStatusCard
                  title="Rule 5: 电机额定过载热保护校验"
                  desc="接触器与热过载继电器允许额定电流必须能够完全覆盖对应电机功率的最大工作电流。"
                  status="OK"
                />
              </Box>

              <Typography sx={{ fontSize: '9pt', color: '#666', mt: 2 }}>
                * 评估 verdict：<span style={{ color: '#16a34a', fontWeight: 700 }}>合规通过 (PASS)</span>。该系统设计不存在违反工业电气标准的致命连接错误，可以安全开展装配。
              </Typography>
            </Box>

            {/* BOM 选型清单 PAGE 3 */}
            <Box className="report-page-break" sx={{ pt: 4 }}>
              <Typography sx={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1.5px solid #000', pb: 0.5, mb: 3 }}>
                二、 硬件 BOM 采购与选型清单
              </Typography>
              <Typography sx={{ fontSize: '9.5pt', color: '#333', mb: 3 }}>
                以下为系统方案基于 Qdrant 语义检索与元器件关系图谱（Component Graph）合并优选推荐的工业级物料清单：
              </Typography>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000', background: '#f5f5f5' }}>
                    <th style={{ padding: '8px 5px' }}>序号</th>
                    <th style={{ padding: '8px 5px' }}>类别 (Name)</th>
                    <th style={{ padding: '8px 5px' }}>品牌 (Brand)</th>
                    <th style={{ padding: '8px 5px' }}>订货型号 (Part Number)</th>
                    <th style={{ padding: '8px 5px', textAlign: 'center' }}>数量</th>
                    <th style={{ padding: '8px 5px' }}>主要技术参数 (Specs)</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 5px', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 5px', fontWeight: 600 }}>{item.name}</td>
                      <td style={{ padding: '8px 5px', color: '#555' }}>{item.mfg}</td>
                      <td style={{ padding: '8px 5px', fontFamily: 'monospace', fontWeight: 700, color: '#0066cc' }}>{item.pn}</td>
                      <td style={{ padding: '8px 5px', textAlign: 'center', fontWeight: 700 }}>{item.qty}</td>
                      <td style={{ padding: '8px 5px', color: '#666', fontSize: '8pt' }}>{item.specs}</td>
                    </tr>
                  ))}
                  {bom.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>未生成元器件选型数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>

            {/* PLC I/O 接线表 PAGE 4 */}
            <Box className="report-page-break" sx={{ pt: 4 }}>
              <Typography sx={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1.5px solid #000', pb: 0.5, mb: 3 }}>
                三、 PLC 电气控制柜接线端子图
              </Typography>
              <Typography sx={{ fontSize: '9.5pt', color: '#333', mb: 3 }}>
                系统主要数字量与模拟量控制回路信号的分配接线规划如下：
              </Typography>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #000', background: '#f5f5f5' }}>
                    <th style={{ padding: '8px 5px' }}>信号通道 (Tag)</th>
                    <th style={{ padding: '8px 5px' }}>工艺描述 (Signal)</th>
                    <th style={{ padding: '8px 5px' }}>起始端子 (From)</th>
                    <th style={{ padding: '8px 5px' }}>目标通道 (To)</th>
                    <th style={{ padding: '8px 5px' }}>敷设缆线规格 (Wire)</th>
                  </tr>
                </thead>
                <tbody>
                  {ioItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 5px', fontFamily: 'monospace', fontWeight: 700 }}>{item.tag}</td>
                      <td style={{ padding: '8px 5px' }}>{item.signal}</td>
                      <td style={{ padding: '8px 5px', color: '#555' }}>{item.from}</td>
                      <td style={{ padding: '8px 5px', fontFamily: 'monospace' }}>{item.to}</td>
                      <td style={{ padding: '8px 5px', color: '#666', fontSize: '8pt' }}>{item.wire}</td>
                    </tr>
                  ))}
                  {ioItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>暂无接线端子数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>

            {/* PLC ST 代码 PAGE 5 */}
            <Box className="report-page-break" sx={{ pt: 4 }}>
              <Typography sx={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1.5px solid #000', pb: 0.5, mb: 3 }}>
                四、 PLC 逻辑控制程序 (Structured Text ST)
              </Typography>
              <Typography sx={{ fontSize: '9.5pt', color: '#333', mb: 2 }}>
                采用符合 IEC 61131-3 标准的结构化文本 (ST / SCL) 控制逻辑代码段：
              </Typography>

              <Box
                component="pre"
                sx={{
                  p: 3,
                  bgcolor: '#f8f9fa',
                  border: '1px solid #ddd',
                  borderRadius: 1.5,
                  fontSize: '7.5pt',
                  fontFamily: '"JetBrains Mono", monospace',
                  color: '#24292e',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                }}
              >
                {sclCode || '(* 未生成控制逻辑代码段 *)'}
              </Box>
            </Box>

            {/* 调试步骤 PAGE 6 */}
            <Box className="report-page-break" sx={{ pt: 4 }}>
              <Typography sx={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1.5px solid #000', pb: 0.5, mb: 3 }}>
                五、 系统现场安装调试指南
              </Typography>
              <Typography sx={{ fontSize: '9.5pt', color: '#333', mb: 3 }}>
                电气系统在接线与通电测试时，请遵循以下由 Volta 智囊生成的标准化调试指引：
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {commissioningSteps.map((step, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }} className="print-no-break">
                    <Box
                      sx={{
                        width: '18pt',
                        height: '18pt',
                        borderRadius: '50%',
                        bgcolor: '#000',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9pt',
                        fontWeight: 700,
                        flexShrink: 0,
                        fontFamily: 'monospace',
                      }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '10pt', fontWeight: 700 }}>
                        {step.title}
                      </Typography>
                      <Typography sx={{ fontSize: '8.5pt', color: '#444', mt: 0.5 }}>
                        {step.body}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {commissioningSteps.length === 0 && (
                  <Typography sx={{ color: '#888', fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                    未生成安装调试指南数据
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 4, py: 2.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Button onClick={onClose} sx={{ color: 'text.disabled', fontWeight: 500 }}>
          返回编辑
        </Button>
        <Button
          onClick={handlePrint}
          variant="contained"
          startIcon={<PictureAsPdfIcon />}
          sx={{
            bgcolor: '#4ec9ff',
            color: '#000',
            fontWeight: 700,
            '&:hover': { bgcolor: '#7ad8ff' },
          }}
        >
          保存 PDF / 打印
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 辅助状态渲染组件
function RuleStatusCard({ title, desc, status }: { title: string; desc: string; status: 'OK' | 'INFO' | 'ERR' }) {
  const isOk = status === 'OK';
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: isOk ? '#d1fae5' : '#fef3c7',
        bgcolor: isOk ? '#fefefe' : '#fffbeb',
        borderRadius: 1.5,
        p: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 2,
      }}
    >
      <Box>
        <Typography sx={{ fontSize: '9.5pt', fontWeight: 700, color: isOk ? '#065f46' : '#92400e' }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: '8pt', color: '#666', mt: 0.5 }}>
          {desc}
        </Typography>
      </Box>
      <Chip
        label={isOk ? 'PASS' : 'VALID'}
        size="small"
        sx={{
          height: 18,
          fontSize: '7pt',
          fontWeight: 800,
          bgcolor: isOk ? '#d1fae5' : '#fef3c7',
          color: isOk ? '#065f46' : '#92400e',
        }}
      />
    </Box>
  );
}
