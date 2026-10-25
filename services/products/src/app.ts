import express, { ErrorRequestHandler, Router } from "express";

type Config = {
  routers: { path: string; router: Router }[];
  errorMiddleware: ErrorRequestHandler;
};
export function createApp(cfg: Config) {
  const app = express();

  app.set("trust proxy", 1);

  app.use(express.json());

  app.get("/healthz", (_, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });

    return;
  });

  cfg.routers.forEach((r) => {
    app.use(r.path, r.router);
  });

  app.use((_, res) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use(cfg.errorMiddleware);

  return app;
}
