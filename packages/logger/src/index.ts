import winston, { Logger } from "winston";

export type LogProps = Record<string, unknown> | Error;

export interface LoggerPort {
  info(message: string, props?: LogProps): void;
  error(message: string, props?: LogProps): void;
  warn(message: string, props?: LogProps): void;
  debug(message: string, props?: LogProps): void;
}

class WinstonLoggerAdapter implements LoggerPort {
  constructor(private readonly logger: Logger) {}

  debug(message: string, props?: LogProps): void {
    this.log("debug", message, props);
  }

  error(message: string, props?: LogProps): void {
    this.log("error", message, props);
  }

  info(message: string, props?: LogProps): void {
    this.log("info", message, props);
  }

  warn(message: string, props?: LogProps): void {
    this.log("warn", message, props);
  }

  private log(level: string, message: string, props?: LogProps): void {
    if (props === undefined) {
      this.logger.log(level, message);
      return;
    }

    this.logger.log(level, message, props);
  }
}

export function createLogger(
  serviceName: string,
  logLevel: string,
): LoggerPort {
  const client = winston.createLogger({
    defaultMeta: {
      serviceName,
    },
    level: logLevel,
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
  });

  return new WinstonLoggerAdapter(client);
}
