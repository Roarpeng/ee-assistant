import { useEffect } from 'react';
import { AppLayout } from './views/components/AppLayout';
import { HeroLanding } from './views/components/HeroLanding';
import { useStore } from './models/store';

const EXAMPLES = [
  '恒温水箱 PLC 控制系统, 需 PLd 安全等级',
  '3 轴伺服定位平台, EtherCAT 总线',
  '传送带 VFD 调速 + 急停 + 接触器互锁',
  '注塑机温度多段 PID, 8 路热电偶',
  '立体仓库穿梭车, 安全光幕 + STO',
];

export default function App() {
  const project = useStore((s) => s.project);
  const newProject = useStore((s) => s.newProject);
  const loadChatHistory = useStore((s) => s.loadChatHistory);

  // M1: bootstrap (or restore) the organization identity exactly once
  // before any other API call goes out. `bootstrapOrg` is idempotent —
  // if a token already exists in localStorage it just hydrates `org`.
  useEffect(() => {
    void useStore.getState().bootstrapOrg();
  }, []);

  // Best-effort restore of the last project on cold boot so reloads don't kick
  // the user back to the hero screen.
  useEffect(() => {
    if (!project) void loadChatHistory();
  }, [project, loadChatHistory]);

  if (!project) {
    return (
      <HeroLanding
        examples={EXAMPLES}
        onSubmit={(prompt) => {
          void newProject({ preserveCanvas: false, seedPrompt: prompt });
        }}
      />
    );
  }
  return <AppLayout />;
}
