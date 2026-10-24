import cookieParser from "cookie-parser";
import express, {
  type Router,
  RequestHandler,
  ErrorRequestHandler,
} from "express";

type Config = {
  errorMiddleware: ErrorRequestHandler;
  globalRateLimitMiddleware: RequestHandler;
  routers: { path: string; router: Router }[];
};

export function createApp(config: Config) {
  const app = express();

  app.get("/healthz", (_, res) => {
    return res
      .status(200)
      .json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // setup global middlewares
  app.use(config.globalRateLimitMiddleware);
  app.use(cookieParser());

  // setup proxies
  config.routers.forEach((p) => {
    app.use(`/${p.path}`, p.router);
  });

  // unmatched routes
  app.use((_, res) => {
    return res.status(404).json({ message: "Not found" });
  });

  // setup global error handler
  app.use(config.errorMiddleware);

  return app;
}
