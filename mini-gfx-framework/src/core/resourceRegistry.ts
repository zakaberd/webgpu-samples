export type ResourceId = string;

export interface TrackedResource<T = unknown> {
  id: ResourceId;
  resource: T;
  label?: string;
  dispose?: () => void | Promise<void>;
}

export interface ResourceRegistry {
  add<T>(entry: TrackedResource<T>): void;
  get<T>(id: ResourceId): T | undefined;
  list(): TrackedResource[];
  disposeAll(): Promise<void>;
}

class InMemoryResourceRegistry implements ResourceRegistry {
  private readonly map = new Map<ResourceId, TrackedResource>();

  add<T>(entry: TrackedResource<T>): void {
    this.map.set(entry.id, entry);
  }

  get<T>(id: ResourceId): T | undefined {
    return this.map.get(id)?.resource as T | undefined;
  }

  list(): TrackedResource[] {
    return Array.from(this.map.values());
  }

  async disposeAll(): Promise<void> {
    for (const entry of this.map.values()) {
      await entry.dispose?.();
    }
    this.map.clear();
  }
}

export function createResourceRegistry(): ResourceRegistry {
  return new InMemoryResourceRegistry();
}
