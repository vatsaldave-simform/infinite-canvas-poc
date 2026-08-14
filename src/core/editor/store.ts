export interface EditorStore {
  getSelectedId(): string | null;
  select(id: string | null): void;
  subscribe(listener: () => void): () => void;
}

export function createEditorStore(): EditorStore {
  let selectedId: string | null = null;
  const listeners = new Set<() => void>();

  return {
    getSelectedId() {
      return selectedId;
    },
    select(id) {
      selectedId = id;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
