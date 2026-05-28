// @ts-nocheck
import type { CSSProperties } from 'react';
import { Box, Typography } from '@mui/material';
import { Handle, Position } from 'reactflow';

import plcSvg from '../../assets/symbols/plc.svg';
import hmiSvg from '../../assets/symbols/hmi.svg';
import ioSvg from '../../assets/symbols/io.svg';
import powerSvg from '../../assets/symbols/power.svg';
import vfdSvg from '../../assets/symbols/vfd.svg';
import servoSvg from '../../assets/symbols/servo.svg';
import contactorSvg from '../../assets/symbols/contactor.svg';
import switchSvg from '../../assets/symbols/switch.svg';
import defaultSvg from '../../assets/symbols/default.svg';

const SYMBOL_MAP: Record<string, string> = {
  'plc': plcSvg,
  'hmi': hmiSvg,
  'io': ioSvg,
  'vfd': vfdSvg,
  'servo': servoSvg,
  'power': powerSvg,
  'switch': switchSvg,
  'contactor': contactorSvg,
  'circuit_breaker': contactorSvg, 
  'relay': contactorSvg, 
  'safety_relay': contactorSvg,
  'safety_plc': plcSvg,
  'estop': switchSvg,
  'sensor': switchSvg,
  'ipc': hmiSvg,
  'transformer': powerSvg,
  'fuse': contactorSvg,
  'signal_light': defaultSvg,
  'indicator_light': defaultSvg,
  'disconnect': contactorSvg
};

const HANDLE_COLOR = {
  power: '#f59e0b',    // amber  — power lines 
  network: '#3b82f6',  // blue   — bus/network 
  hardwired: '#10b981',// green  — hardwired/feedback
} as const;

type HandleCategory = keyof typeof HANDLE_COLOR;

function handleStyle(category: HandleCategory, selected?: boolean): CSSProperties {
  const color = HANDLE_COLOR[category] || '#737373';
  return {
    background: color,
    borderColor: selected ? '#ffffff' : '#171717',
    boxShadow: selected ? `0 0 10px ${color}` : `0 0 4px ${color}80`,
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'solid',
    transition: 'opacity 200ms, transform 200ms, box-shadow 200ms',
    opacity: selected ? 1 : 0.65,
    zIndex: 50,
  };
}

// 极其精简的 3 个物理连接点，满足电气图标准
// 顶端：电源 | 右端：总线/网络 | 底端：硬接线
export function NodeHandles({ selected }: { selected?: boolean }) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="pwr-tgt"
        style={{ ...handleStyle('power', selected), left: '45%' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="pwr-src"
        style={{ ...handleStyle('power', selected), left: '55%' }}
      />

      <Handle
        type="target"
        position={Position.Right}
        id="net-tgt"
        style={{ ...handleStyle('network', selected), top: '45%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="net-src"
        style={{ ...handleStyle('network', selected), top: '55%' }}
      />

      <Handle
        type="target"
        position={Position.Bottom}
        id="wired-tgt"
        style={{ ...handleStyle('hardwired', selected), left: '45%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="wired-src"
        style={{ ...handleStyle('hardwired', selected), left: '55%' }}
      />
    </>
  );
}

function nodeContainerSx(width: number) {
  return {
    width,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    '&:hover .react-flow__handle': {
      opacity: '1 !important',
      transform: 'scale(1.5) !important',
    },
  };
}

function nodeLabelSx(selected?: boolean) {
  return {
    mt: 1.5,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    fontSize: 12,
    letterSpacing: '0.05em',
    color: selected ? 'primary.light' : 'text.secondary',
    transition: 'color 200ms',
  };
}

export function GenericSymbolNode({ data, selected, typeKey }: { data: any; selected?: boolean; typeKey: string }) {
  const imgSrc = SYMBOL_MAP[typeKey] || defaultSvg;
  return (
    <Box sx={nodeContainerSx(100)}>
      <NodeHandles selected={selected} />
      <Box 
        sx={{ 
          width: 80, 
          height: 80, 
          p: 1, 
          bgcolor: '#1e1e1e', 
          borderRadius: 2, 
          border: 2, 
          borderColor: selected ? 'primary.main' : '#334155', 
          boxShadow: selected ? '0 0 15px rgba(99,102,241,0.5)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 200ms'
        }}
      >
        <img src={imgSrc} width="100%" height="100%" style={{ objectFit: 'contain' }} alt={typeKey} />
      </Box>
      <Typography sx={nodeLabelSx(selected)}>{data.label}</Typography>
    </Box>
  );
}

// 通用代理组件，取代之前的繁杂绘图代码
export const PLCNode = (props: any) => <GenericSymbolNode {...props} typeKey="plc" />;
export const HMINode = (props: any) => <GenericSymbolNode {...props} typeKey="hmi" />;
export const IONode = (props: any) => <GenericSymbolNode {...props} typeKey="io" />;
export const VFDNode = (props: any) => <GenericSymbolNode {...props} typeKey="vfd" />;
export const ServoNode = (props: any) => <GenericSymbolNode {...props} typeKey="servo" />;
export const PowerNode = (props: any) => <GenericSymbolNode {...props} typeKey="power" />;
export const SwitchNode = (props: any) => <GenericSymbolNode {...props} typeKey="switch" />;
export const SafetyRelayNode = (props: any) => <GenericSymbolNode {...props} typeKey="safety_relay" />;
export const SensorNode = (props: any) => <GenericSymbolNode {...props} typeKey="sensor" />;
export const IPCNode = (props: any) => <GenericSymbolNode {...props} typeKey="ipc" />;
export const SafetyPLCNode = (props: any) => <GenericSymbolNode {...props} typeKey="safety_plc" />;
export const CircuitBreakerNode = (props: any) => <GenericSymbolNode {...props} typeKey="circuit_breaker" />;
export const ContactorNode = (props: any) => <GenericSymbolNode {...props} typeKey="contactor" />;
export const RelayNode = (props: any) => <GenericSymbolNode {...props} typeKey="relay" />;
export const EStopNode = (props: any) => <GenericSymbolNode {...props} typeKey="estop" />;
export const TransformerNode = (props: any) => <GenericSymbolNode {...props} typeKey="transformer" />;
export const FuseNode = (props: any) => <GenericSymbolNode {...props} typeKey="fuse" />;
export const SignalLightNode = (props: any) => <GenericSymbolNode {...props} typeKey="signal_light" />;
export const IndicatorLightNode = (props: any) => <GenericSymbolNode {...props} typeKey="indicator_light" />;
export const DisconnectNode = (props: any) => <GenericSymbolNode {...props} typeKey="disconnect" />;
export const SafetyDoorNode = (props: any) => <GenericSymbolNode {...props} typeKey="switch" />;
