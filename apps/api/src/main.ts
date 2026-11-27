import "reflect-metadata";
import { readFileSync } from "node:fs";
import type { NestApplicationOptions } from "@nestjs/common";
import { Agreements, AgreementsController } from "./agreements";
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { rateLimit } from "express-rate-limit";
import {
  AccountController,
  AccountService,
  DeviceController,
} from "./accounts";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { Partners } from "./partners";
import { Database } from "./db/connection";

import { AuthGuard } from "./reading/auth/auth.guard";
import { AuthService } from "./reading/auth/auth.service";
import { SupabaseJwtVerifier } from "./reading/auth/supabase-jwt.verifier";
import { SUPABASE_JWT_VERIFIER } from "./reading/auth/auth.constants";
import { DATABASE } from "./reading/database";
import { FeedController } from "./reading/feed/feed.controller";
import { FeedService } from "./reading/feed/feed.service";
import { TopicsController } from "./reading/onboarding/topics.controller";
import { OnboardingController } from "./reading/onboarding/onboarding.controller";
import { OnboardingService } from "./reading/onboarding/onboarding.service";
import { InteractionsController } from "./reading/interactions/interactions.controller";
import { InteractionsService } from "./reading/interactions/interactions.service";
import { AffinityService } from "./reading/recommendations/affinity.service";
import { ScoringService } from "./reading/recommendations/scoring.service";
import { UsersController } from "./reading/users/users.controller";
import { UsersService } from "./reading/users/users.service";
import { LibraryController } from "./reading/library.controller";

type DemoRequest = Request & { workspace: string };
@Controller("api/partners")
class PartnerController {
  constructor(private readonly partners: Partners) {}
  @Get() list(@Req() req: DemoRequest) {
    return this.partners.list(req.workspace);
  }
  @Post() invite(@Req() req: DemoRequest, @Body("email") email: unknown) {
    return this.partners.invite(req.workspace, email);
  }
  @Patch(":id") update(
    @Req() req: DemoRequest,
    @Param("id") id: string,
    @Body("action") action: unknown,
  ) {
    return this.partners.change(req.workspace, id, action);
  }
  @Delete() clear(@Req() req: DemoRequest) {
    return this.partners.clear(req.workspace);
  }
}
@Module({
  controllers: [
    FeedController, TopicsController, OnboardingController, InteractionsController, UsersController, LibraryController,
    PartnerController,
    AccountController,
    DeviceController,
    AgreementsController,
  ],
  providers: [Database, Partners, AccountService, Agreements, FeedService, OnboardingService,
    InteractionsService, UsersService, ScoringService, AffinityService, AuthGuard, AuthService,
    { provide: DATABASE, inject: [Database], useFactory: (database: Database) => database.db },
    { provide: SUPABASE_JWT_VERIFIER, useClass: SupabaseJwtVerifier }
  ],
})
class AppModule {}
export async function createApp(options: NestApplicationOptions = {}) {
  const app = await NestFactory.create(AppModule, options);
  app.enableShutdownHooks();
  app.use(cookieParser());
  app.use(
    ["/api/account/login", "/api/account/register", "/api/device/pair"],
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req: DemoRequest, res: Response, next: NextFunction) => {
    if (req.get("sec-fetch-site") === "cross-site") {
      res.sendStatus(403);
      return;
    }
    res.set("Cache-Control", "no-store");
    if (!req.path.startsWith("/partners")) {
      if (req.method === "POST" && !req.is("application/json")) {
        res.sendStatus(415);
        return;
      }
      next();
      return;
    }
    const existing = req.cookies.logos_demo;
    if (
      typeof existing === "string" &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(existing)
    )
      req.workspace = existing;
    else {
      req.workspace = randomUUID();
      res.cookie("logos_demo", req.workspace, {
        httpOnly: true,
        sameSite: "strict",
        path: "/api",
        maxAge: 30 * 86400000,
      });
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  return app;
}
async function main() {
  const app = await createApp(process.env.LOGOS_TLS_CERT && process.env.LOGOS_TLS_KEY ? { httpsOptions: { cert: readFileSync(process.env.LOGOS_TLS_CERT), key: readFileSync(process.env.LOGOS_TLS_KEY) } } : {});
  await app.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "127.0.0.1",
  );
}
if (require.main === module) void main();
