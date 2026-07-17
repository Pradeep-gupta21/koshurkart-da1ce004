import { IKnowledgeDomain, KnowledgeNode } from '../types';

/**
 * Abstract base class for all Knowledge Domains.
 * Provides default implementations and enforces structure.
 */
export abstract class BaseDomain implements IKnowledgeDomain {
  public abstract readonly name: string;
  public abstract readonly description?: string;
  
  protected nodes: Map<string, KnowledgeNode> = new Map();

  /**
   * Register a node within this domain.
   */
  protected registerNode(node: KnowledgeNode): void {
    if (this.nodes.has(node.id)) {
      console.warn(`[KnowledgeEngine] Node ${node.id} is being overwritten in domain ${this.name}`);
    }
    this.nodes.set(node.id, node);
  }

  public getAll(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  public getById(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }
}
