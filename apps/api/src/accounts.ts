import { digest, sessionCookie as cookie, sessionLifetime as lifetime } from "./session";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { AuthService } from "./reading/auth/auth.service";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { Database } from "./db/connection";
import { deviceResolver } from "./reporting/adguard";
import { accounts, devices, sessions } from "./db/schema";

const hashPassword = promisify(scrypt);
const token = () => randomBytes(32).toString("base64url");
const deviceFields = {
  id: devices.id,
  name: devices.name,
  lastCheck: devices.lastCheck,
  checkedAt: devices.checkedAt,
  pairingExpiresAt: devices.pairingExpiresAt,
};
function credentials(input: unknown) {
  const body = input as { username?: unknown; password?: unknown } | null;
  const username =
    typeof body?.username === "string"
      ? body.username.trim().toLowerCase()
      : "";
  if (
    !/^[a-z0-9_]{3,40}$/.test(username) ||
    typeof body?.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  )
    throw new BadRequestException(
      "Use a 3–40 character username (letters, numbers or underscore) and a 12–128 character password.",
    );
  return { username, password: body.password };
}
@Injectable()
export class AccountService {
  constructor(
    private readonly database: Database,
    private readonly hostedAuth: AuthService,
  ) {}
  private get db() {
    return this.database.db;
  }
  async authenticate(input: unknown, register: boolean) {
    const { username, password } = credentials(input);
    let owner: string;
    const secret = token();
    if (register) {
      const salt = randomBytes(16).toString("hex");
      const hash = (await hashPassword(password, salt, 64)) as Buffer;
      owner = randomUUID();
      await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(accounts)
          .values({
            id: owner,
            username,
            passwordHash: salt + ":" + hash.toString("hex"),
          })
          .onConflictDoNothing()
          .returning({ id: accounts.id });
        if (!inserted.length)
          throw new ConflictException("Username unavailable.");
        await tx.insert(sessions).values({
          owner,
          digest: digest(secret),
          expiresAt: Date.now() + lifetime,
        });
      });
      return { username, secret };
    } else {
      const [account] = await this.db
        .select()
        .from(accounts)
        .where(eq(accounts.username, username));
      const [salt, expected] = (
        account?.passwordHash ?? "dummy:" + "0".repeat(128)
      ).split(":");
      const hash = (await hashPassword(password, salt, 64)) as Buffer;
      if (!timingSafeEqual(hash, Buffer.from(expected, "hex")) || !account)
        throw new UnauthorizedException("Incorrect username or password.");
      owner = account.id;
    }
    await this.db.insert(sessions).values({
      owner,
      digest: digest(secret),
      expiresAt: Date.now() + lifetime,
    });
    return { username, secret };
  }
  async owner(req: Request) {
    if (req.headers.authorization) {
      const { id: subject, email } =
        await this.hostedAuth.authenticateBearerToken(
          req.headers.authorization,
        );
      return { id: "supabase:" + subject, username: email.toLowerCase() };
    }
    const secret = req.cookies.logos_session;
    if (typeof secret !== "string") throw new UnauthorizedException();
    const [owner] = await this.db
      .select({ id: accounts.id, username: accounts.username })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.owner, accounts.id))
      .where(
        and(
          eq(sessions.digest, digest(secret)),
          gt(sessions.expiresAt, Date.now()),
        ),
      );
    if (!owner) throw new UnauthorizedException();
    return owner;
  }
  async logout(secret: unknown) {
    if (typeof secret === "string")
      await this.db.delete(sessions).where(eq(sessions.digest, digest(secret)));
  }
  async inventory(owner: string) {
    const rows = await this.db
      .select({
        ...deviceFields,
        paired: devices.credentialDigest,
        installation: devices.installationId,
      })
      .from(devices)
      .where(eq(devices.owner, owner))
      .orderBy(desc(devices.pairingExpiresAt));
    return rows.map(({ paired, installation, ...row }) => ({
      ...row,
      state:
        paired || installation
          ? "paired"
          : row.pairingExpiresAt > Date.now()
            ? "pending"
            : "expired",
    }));
  }
  async connectInstallation(
    owner: string,
    installation: unknown,
    create: unknown,
    previous: unknown,
  ) {
    if (
      typeof installation !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(installation) ||
      typeof create !== "boolean"
    )
      throw new BadRequestException("Invalid installation.");
    const match = and(
      eq(devices.owner, owner),
      eq(devices.installationId, installation),
    );
    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, owner))
        .for("update");
      const [existing] = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(match);
      if (existing) return existing;
      if (!create) throw new NotFoundException("This iPhone was disconnected.");
      if (typeof previous === "string" && previous.length === 43) {
        const [legacy] = await tx
          .update(devices)
          .set({ installationId: installation })
          .where(
            and(
              eq(devices.owner, owner),
              eq(devices.credentialDigest, digest(previous)),
              isNull(devices.installationId),
            ),
          )
          .returning({ id: devices.id });
        if (legacy) return legacy;
      }
      const [added] = await tx
        .insert(devices)
        .values({
          id: randomUUID(),
          owner,
          name: "iPhone",
          installationId: installation,
          pairingExpiresAt: Date.now(),
        })
        .returning({ id: devices.id });
      return added;
    });
  }

  async checkInstallation(
    owner: string,
    installation: unknown,
    outcome: unknown,
  ) {
    if (
      typeof installation !== "string" ||
      typeof outcome !== "string" ||
      !["blocked", "open", "unknown"].includes(outcome)
    )
      throw new BadRequestException("Invalid device check.");
    const [saved] = await this.db
      .update(devices)
      .set({ lastCheck: outcome, checkedAt: Date.now() })
      .where(
        and(eq(devices.owner, owner), eq(devices.installationId, installation)),
      )
      .returning({ checkedAt: devices.checkedAt });
    if (!saved) throw new NotFoundException("This iPhone was disconnected.");
    return saved;
  }
  async enroll(owner: string, name: unknown) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
      throw new BadRequestException("Enter a device name up to 80 characters.");
    const code = token(),
      id = randomUUID(),
      expiresAt = Date.now() + 600000;
    await this.db.insert(devices).values({
      id,
      owner,
      name: name.trim(),
      pairingDigest: digest(code),
      pairingExpiresAt: expiresAt,
    });
    return { id, code, expiresAt };
  }
  async pair(code: unknown) {
    if (typeof code !== "string" || code.length !== 43)
      throw new UnauthorizedException("Invalid or expired pairing code.");
    const credential = token();
    const [device] = await this.db
      .update(devices)
      .set({ pairingDigest: null, credentialDigest: digest(credential) })
      .where(
        and(
          eq(devices.pairingDigest, digest(code)),
          gt(devices.pairingExpiresAt, Date.now()),
        ),
      )
      .returning({ name: devices.name });
    if (!device)
      throw new UnauthorizedException("Invalid or expired pairing code.");
    return { ...device, credential };
  }
  async check(auth: string | undefined, outcome: unknown) {
    if (
      typeof outcome !== "string" ||
      !["blocked", "open", "unknown"].includes(outcome)
    )
      throw new BadRequestException("Unknown check outcome.");
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const [record] = await this.db
      .update(devices)
      .set({ lastCheck: outcome, checkedAt: Date.now() })
      .where(eq(devices.credentialDigest, digest(auth.slice(7))))
      .returning({ checkedAt: devices.checkedAt });
    if (!record) throw new UnauthorizedException();
    return record;
  }
  async remove(owner: string, id: string) {
    const deleted = await this.db
      .delete(devices)
      .where(and(eq(devices.owner, owner), eq(devices.id, id)))
      .returning({ id: devices.id });
    if (!deleted.length) throw new NotFoundException();
  }
}
@Controller("api/account")
export class AccountController {
  constructor(private readonly service: AccountService) {}
  private async session(input: unknown, res: Response, register: boolean) {
    const { secret, username } = await this.service.authenticate(
      input,
      register,
    );
    res.cookie("logos_session", secret, { ...cookie, maxAge: lifetime });
    return { username };
  }
  @Post("register") register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.session(body, res, true);
  }
  @Post("login") @HttpCode(200) login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.session(body, res, false);
  }
  @Delete("session") @HttpCode(204) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.service.logout(req.cookies.logos_session);
    res.clearCookie("logos_session", cookie);
  }
  @Get() async account(@Req() req: Request) {
    const owner = await this.service.owner(req);
    return {
      username: owner.username,
      devices: await this.service.inventory(owner.id),
    };
  }
  @Post("devices/connect") async connect(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const device = await this.service.connectInstallation(
      (await this.service.owner(req)).id,
      body.installation,
      body.create,
      body.previous,
    );
    return { ...device, resolverURL: deviceResolver(device.id) };
  }
  @Post("devices/check") async check(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.checkInstallation(
      (await this.service.owner(req)).id,
      body.installation,
      body.outcome,
    );
  }
  @Post("devices") async enroll(
    @Req() req: Request,
    @Body("name") name: unknown,
  ) {
    return this.service.enroll((await this.service.owner(req)).id, name);
  }
  @Delete("devices/:id") @HttpCode(204) async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await this.service.remove((await this.service.owner(req)).id, id);
  }
}
@Controller("api/device")
export class DeviceController {
  constructor(private readonly service: AccountService) {}
  @Post("pair") pair(@Body("code") code: unknown) {
    return this.service.pair(code);
  }
  @Post("checks") check(
    @Headers("authorization") auth: string | undefined,
    @Body("outcome") outcome: unknown,
  ) {
    return this.service.check(auth, outcome);
  }
}
