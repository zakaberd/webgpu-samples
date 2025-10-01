import {
  scenes,
  defaultSceneId,
  getSceneById,
  type SceneCleanup,
  type SceneMountContext,
} from './scenes';

let activeSceneId = defaultSceneId;
let activeCleanup: SceneCleanup | undefined;
let mountToken = 0;

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" was not found.`);
  }
  return element as T;
}

const sceneRoot = getRequiredElement<HTMLDivElement>('scene-root');
const sceneSelect = getRequiredElement<HTMLSelectElement>('scene-select');

function normaliseCleanup(result: SceneCleanup): (() => void | Promise<void>) | undefined {
  return typeof result === 'function' ? result : undefined;
}

function populateSceneSelect(selectedId: string) {
  sceneSelect.innerHTML = '';
  scenes.forEach((scene) => {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = scene.title;
    option.selected = scene.id === selectedId;
    sceneSelect.appendChild(option);
  });
  sceneSelect.disabled = scenes.length <= 1;
}

async function cleanupActiveScene() {
  if (activeCleanup) {
    const cleanup = activeCleanup;
    activeCleanup = undefined;
    await cleanup();
  }
  sceneRoot.innerHTML = '';
}

async function activateScene(id: string) {
  const scene = getSceneById(id) ?? getSceneById(defaultSceneId);
  if (!scene) {
    throw new Error(`Unable to resolve scene for id "${id}"`);
  }

  const token = ++mountToken;
  await cleanupActiveScene();

  activeSceneId = scene.id;
  sceneSelect.value = scene.id;

  const context: SceneMountContext = { root: sceneRoot };

  try {
    const result = await scene.mount(context);
    if (token !== mountToken) {
      const cleanup = normaliseCleanup(result);
      if (cleanup) {
        await cleanup();
      }
      return;
    }
    activeCleanup = normaliseCleanup(result);
  } catch (error) {
    console.error(`[mini-gfx] failed to mount scene \"${scene.id}\"`, error);
    sceneRoot.innerHTML = '';
  }
}

sceneSelect.addEventListener('change', () => {
  const selectedId = sceneSelect.value;
  void activateScene(selectedId);
});

populateSceneSelect(activeSceneId);
void activateScene(activeSceneId);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    mountToken += 1;
    if (activeCleanup) {
      const cleanup = activeCleanup;
      activeCleanup = undefined;
      return cleanup();
    }
    return undefined;
  });
}
