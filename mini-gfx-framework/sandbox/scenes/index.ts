import type { SandboxScene } from './types';
import { msdfTextScene } from './msdfTextScene';
import { multipleCanvasesScene } from './multipleCanvasesScene';
import { computeBoidsScene } from './computeBoidsScene';
import { pointsScene } from './pointsScene';
import { transparentCanvasScene } from './transparentCanvasScene';

export const scenes: SandboxScene[] = [
  msdfTextScene,
  computeBoidsScene,
  pointsScene,
  transparentCanvasScene,
  multipleCanvasesScene,
];

export const defaultSceneId = msdfTextScene.id;

export function getSceneById(id: string): SandboxScene | undefined {
  return scenes.find((scene) => scene.id === id);
}

export type { SandboxScene, SceneMountContext, SceneCleanup } from './types';
