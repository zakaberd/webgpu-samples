export type SceneCleanup = void | (() => void | Promise<void>);

export interface SceneMountContext {
  root: HTMLElement;
}

export interface SandboxScene {
  id: string;
  title: string;
  mount(context: SceneMountContext): Promise<SceneCleanup> | SceneCleanup;
}
