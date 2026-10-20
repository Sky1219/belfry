/**
 * Owns one closable model task. If the tool closes while a model is still
 * downloading, the task that arrives afterwards is closed immediately instead
 * of leaking its WASM instance and GPU context.
 */
export class TaskHolder<T extends { close(): void }> {
  private task: T | null = null;
  private disposed = false;

  async load(create: () => Promise<T>): Promise<void> {
    this.disposed = false;
    const t = await create();
    if (this.disposed) {
      t.close();
      throw new Error("disposed while loading");
    }
    this.task?.close();
    this.task = t;
  }

  get(): T | null {
    return this.task;
  }

  dispose(): void {
    this.disposed = true;
    this.task?.close();
    this.task = null;
  }
}
