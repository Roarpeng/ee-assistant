import { useStore } from '../models/store';
import { api } from './api';
import { wsClient } from './websocket';

export async function runFullAnalysis(userInput: string): Promise<void> {
  const store = useStore.getState();
  store.addMessage({ id: '', role: 'user', content: userInput, timestamp: 0 });

  let project = store.project;
  if (!project) {
    project = await api.createProject('New Project');
    store.setProject(project);
  }

  wsClient.connect(project.id);

  store.setStage('analyzing');
  const analyzed = await api.analyze(project.id, userInput);
  store.setProject(analyzed);
  store.setStage('ready');

  store.setStage('selecting');
  const selected = await api.runSelection(project.id);
  store.setProject(selected);

  store.setStage('generating_schematic');
  const withSchematic = await api.generateSchematic(project.id);
  store.setProject(withSchematic);

  store.setStage('generating_code');
  const withCode = await api.generateCode(project.id);
  store.setProject(withCode);

  store.setStage('done');
  store.addMessage({ id: '', role: 'assistant', content: 'All steps complete. Review the schematic, BOM, and ST code on the right.', timestamp: 0 });
}
