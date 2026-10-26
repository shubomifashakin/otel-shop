import type { RequestHandler } from "express";

import type { ZodError } from "zod";

import { AuthService } from "../services/index.js";
import { BadRequestError, type ErrorDetail } from "../errors/index.js";
import { loginValidator, signUpValidator } from "../validators/index.js";

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login: RequestHandler = async (req, res) => {
    const body = loginValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid request body", toDetails(body.error));
    }

    const dat = await this.authService.loginUser(body.data);

    res.cookie("access_token", dat.accessToken, {
      httpOnly: true,
      secure: false, // FIXME: DO NOT DO THIS IN REAL LIFE
      sameSite: "strict",
      expires: dat.expiresAt,
    });

    res.status(200).json({ message: "success" });

    return;
  };

  logout: RequestHandler = async (req, res) => {
    const accessToken = req.cookies["access_token"];

    if (!accessToken || typeof accessToken !== "string") {
      res.status(200).json({ message: "success" });

      return;
    }

    await this.authService.logoutUser(accessToken);

    res.clearCookie("access_token", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    });

    res.status(200).json({ message: "success" });

    return;
  };

  signup: RequestHandler = async (req, res) => {
    const body = signUpValidator.safeParse(req.body);

    if (!body.success) {
      throw new BadRequestError("Invalid request body", toDetails(body.error));
    }

    await this.authService.createUser(body.data);

    res.status(201).json({ message: "success" });

    return;
  };
}
