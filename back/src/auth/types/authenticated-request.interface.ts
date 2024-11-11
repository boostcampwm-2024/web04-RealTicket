import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    login_id: string;
    SID: string;
  };
}
