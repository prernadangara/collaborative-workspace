import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    }
  }
}

export { };