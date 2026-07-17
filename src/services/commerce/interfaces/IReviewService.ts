import { Result, CommerceError } from '../types/Result';

export interface IReviewService {
  getReviewsByProductId(productId: string): Promise<Result<any[], CommerceError>>;
  getReviewById(id: string): Promise<Result<any, CommerceError>>;
  createReview(review: any): Promise<Result<any, CommerceError>>;
  updateReview(id: string, review: any): Promise<Result<any, CommerceError>>;
  deleteReview(id: string): Promise<Result<void, CommerceError>>;
}
