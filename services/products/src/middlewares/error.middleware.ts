import { ErrorRequestHandler } from "express";

import { LoggerPort } from "@shop/logger";
import { AppError } from "@shop/types";
import { totalErrors } from "../telemetry/index.js";

export function createErrorMiddleware(logger: LoggerPort): ErrorRequestHandler {
  return (error, req, res, _) => {
    if (error instanceof AppError) {
      logger.warn("An error occurred", {
        path: req.path,
        method: req.method,
        errMessage: error.message,
      });

      res.status(error.statusCode).json({
        message: error.message,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    totalErrors.add(1, {
      route: req.route?.path ?? "unmatched",
      type: error instanceof Error ? error.name : "unknown",
    });

    logger.error("An error occurred", {
      path: req.path,
      stack: error.stack,
      method: req.method,
      errMessage: error.message,
    });

    res.status(500).json({ message: "Internal server error" });
  };
}
