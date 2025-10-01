import type { SandboxScene } from './types';
import { msdfTextScene } from './msdfTextScene';

export const scenes: SandboxScene[] = [msdfTextScene];

export const defaultSceneId = msdfTextScene.id;

export function getSceneById(id: string): SandboxScene | undefined {
  return scenes.find((scene) => scene.id === id);
}

export type { SandboxScene, SceneMountContext, SceneCleanup } from './types';
