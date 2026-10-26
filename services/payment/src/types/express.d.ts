import "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    user?: {
      id: string;
    };
  }
}

// express.json's verify hook receives the raw node request, not express's, so
// the property is declared here. express's Request extends IncomingMessage, so
// it is visible on both
declare module "node:http" {
  interface IncomingMessage {
    /** kept by express.json's verify hook so the webhook signature can be checked */
    rawBody?: Buffer;
  }
}
