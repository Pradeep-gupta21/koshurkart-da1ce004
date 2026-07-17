/**
 * Represents the fundamental structure of a knowledge piece within the system.
 */
export interface KnowledgeNode<T = any> {
  id: string;
  title: string;
  content: T;
  metadata?: KnowledgeMetadata;
}

/**
 * Metadata associated with a knowledge node.
 * Future-ready for RAG: tags and keywords will aid search, while 
 * 'context' can be extended to support embedding context.
 */
export interface KnowledgeMetadata {
  tags?: string[];
  keywords?: string[];
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  // Future RAG extensions can be added here without breaking existing types
  // embeddingId?: string;
}

/**
 * The contract that all Knowledge Domains must fulfill.
 */
export interface IKnowledgeDomain {
  /**
   * The unique identifier for this domain (e.g., 'products', 'faqs').
   */
  readonly name: string;
  
  /**
   * Optional description of what this domain covers.
   */
  readonly description?: string;

  /**
   * Retrieves all knowledge nodes within this domain.
   */
  getAll(): KnowledgeNode[];

  /**
   * Retrieves a specific knowledge node by ID.
   */
  getById(id: string): KnowledgeNode | undefined;
}
