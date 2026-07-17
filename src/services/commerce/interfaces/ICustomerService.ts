import { Result, CommerceError } from '../types/Result';

export interface ICustomerService {
  getCustomer(id: string): Promise<Result<any, CommerceError>>;
  updateCustomer(id: string, data: any): Promise<Result<any, CommerceError>>;
  createCustomer(data: any): Promise<Result<any, CommerceError>>;
}
