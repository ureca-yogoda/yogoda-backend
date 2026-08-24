declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        nickname: string;
        role: string;
      };
    }
  }
}

export {};
