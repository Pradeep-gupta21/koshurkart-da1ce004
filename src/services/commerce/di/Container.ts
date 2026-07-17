export class Container {
  private static instances = new Map<string, any>();

  static register<T>(key: string, instance: T): void {
    this.instances.set(key, instance);
  }

  static resolve<T>(key: string): T {
    const instance = this.instances.get(key);
    if (!instance) {
      throw new Error(`Service not found for key: ${key}`);
    }
    return instance as T;
  }

  static clear(): void {
    this.instances.clear();
  }
}
