export function generateBlacklistKey(jti: string) {
  return `revoked_token:${jti}`;
}
