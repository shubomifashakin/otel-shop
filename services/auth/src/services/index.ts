import { LoggerPort } from "@shop/logger";
import { generateBlacklistKey } from "@shop/utils";

import {
  CachePort,
  HasherPort,
  TokenSignerPort,
  UsersRepoPort,
} from "../infrastructure/ports/index.js";
import { loginDto, signUpDto } from "../validators/index.js";
import { NotFoundError, UnauthorizedError } from "../errors/index.js";

export class AuthService {
  constructor(
    private readonly userRepo: UsersRepoPort,
    private readonly hasherService: HasherPort,
    private readonly loggerService: LoggerPort,
    private readonly cacheService: CachePort,
    private readonly jwtService: TokenSignerPort,
    private readonly accessTokenTtlSeconds: number,
  ) {}

  async createUser(dto: signUpDto) {
    const passwordHash = await this.hasherService.hash(dto.password);

    if (!passwordHash.success) {
      this.loggerService.error(
        "Failed to hash the password",
        passwordHash.error,
      );

      throw new Error("Failed to hash the password");
    }

    await this.userRepo.create({
      email: dto.email,
      phone: dto.phone,
      passwordHash: passwordHash.data,
      lastName: dto.lastName.toLowerCase(),
      firstName: dto.firstName.toLowerCase(),
    });

    return;
  }

  async loginUser(dto: loginDto) {
    const userExists = await this.userRepo.findByEmail(dto.email);

    if (!userExists) {
      throw new NotFoundError("User does not exist");
    }

    const valid = await this.hasherService.verify(
      dto.password,
      userExists.passwordHash,
    );

    if (!valid.success) {
      this.loggerService.error("Failed to verify password", valid.error);

      throw new Error("Failed to verify password");
    }

    if (!valid.data) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAccessToken({
      email: userExists.email,
      sub: userExists.id,
    });

    if (!accessToken.success) {
      this.loggerService.error(
        "Failed to generate access token",
        accessToken.error,
      );

      throw new Error("Failed to generate access token");
    }
    return {
      accessToken: accessToken.data.token,
      expiresAt: accessToken.data.expiresAt,
    };
  }

  async logoutUser(token: string) {
    const decoded = this.jwtService.decodeAccessToken(token);

    if (!decoded.success) {
      this.loggerService.warn("Ignored an unreadable token on logout", {
        errMessage: decoded.error.message,
      });

      return;
    }

    const revoked = await this.cacheService.set(
      generateBlacklistKey(decoded.data.jti),
      JSON.stringify(decoded.data.sub),
      this.accessTokenTtlSeconds,
    );

    if (!revoked.success) {
      this.loggerService.error("Failed to revoke the token", revoked.error);

      throw new Error("Failed to revoke the token");
    }

    return;
  }
}
