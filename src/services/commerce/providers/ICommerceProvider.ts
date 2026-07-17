export interface ICommerceProvider {
  get name(): string;
  initialize(): Promise<void>;
}
