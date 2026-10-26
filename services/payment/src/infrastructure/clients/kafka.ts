import { Kafka, logLevel } from "kafkajs";

export function createKafka(brokers: string, serviceName: string) {
  return new Kafka({
    clientId: serviceName,
    connectionTimeout: 10 * 1000,
    brokers: brokers
      .split(",")
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0),
    logLevel: logLevel.WARN,
    retry: {
      retries: 8,
      initialRetryTime: 300,
    },
  });
}
