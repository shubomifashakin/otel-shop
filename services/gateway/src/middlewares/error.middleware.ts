import { ErrorRequestHandler, Request, Response } from "express";
import { type Socket } from "node:net";

import { LoggerPort } from "@shop/logger";

export function createErrorMiddleware(logger: LoggerPort): ErrorRequestHandler {
  return (error, req, res, _) => {
    logger.error("An error occurred", {
      path: req.path,
      stack: error.stack,
      method: req.method,
      errMessage: error.message,
    });

    res.status(500).json({ message: "Internal server error" });
  };
}

function statusCodeFor(code: string | undefined): number {
  switch (code) {
    case "ECONNRESET":
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "ETIMEDOUT":
      return 504;
    default:
      return 502;
  }
}

export function createProxyErrorHandler(logger: LoggerPort) {
  return (
    err: Error & { code?: string },
    req: Request,
    res: Response | Socket,
    target?: string | Partial<URL>,
  ) => {
    const statusCode = statusCodeFor(err.code);

    logger.error("Proxy request failed", {
      method: req.method,
      path: req.originalUrl,
      target: typeof target === "string" ? target : target?.href,
      code: err.code,
      statusCode,
      errMessage: err.message,
      stack: err.stack,
    });

    if (!("writeHead" in res)) {
      res.destroy();
      return;
    }

    // the proxy may already have streamed part of the response
    if (res.headersSent) {
      res.destroy();
      return;
    }

    res.status(statusCode).json({ message: "Upstream request failed" });
  };
}
