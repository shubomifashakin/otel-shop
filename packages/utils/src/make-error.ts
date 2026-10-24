export function makeError(err: unknown) {
  if (err instanceof Error) {
    return err;
  }

  if (typeof err === "string") {
    return new Error(err);
  }

  if (err && typeof err === "object" && "message" in err) {
    const er = new Error(String(err.message));

    if ("name" in err && err.name) {
      er.name = String(err.name);
    }

    if ("stack" in err && err.stack) {
      er.stack = String(err.stack);
    }

    return er;
  }

  return new Error(String(err));
}
