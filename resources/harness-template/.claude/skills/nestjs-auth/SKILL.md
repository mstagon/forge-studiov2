---
name: nestjs-auth
description: NestJS 인증 패턴. Passport JWT, OAuth, Guard, 토큰 관리.
globs: server/src/auth/**, server/src/**/guard/**, server/src/**/decorator/**
---

## NestJS 인증 패턴 가이드

### Passport JWT Strategy
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;    // userId
  email: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub) throw new UnauthorizedException();
    return payload;
  }
}
```

### JWT Auth Guard
```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

### Custom Decorators
```typescript
// @Public() - 인증 불필요 엔드포인트
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// @CurrentUser() - 현재 유저 추출
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? user[data] : user;
  },
);
```

### Auth Service (토큰 발급 + 갱신)
```typescript
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(provider: string, accessToken: string) {
    // 1. OAuth 토큰 검증 (카카오/네이버/애플)
    const profile = await this.verifyOAuthToken(provider, accessToken);

    // 2. 유저 조회/생성
    const user = await this.prisma.user.upsert({
      where: { providerId_provider: { providerId: profile.id, provider } },
      update: { lastLoginAt: new Date() },
      create: { provider, providerId: profile.id, nickname: profile.nickname },
    });

    // 3. JWT 발급
    const tokens = await this.generateTokens(user);

    // 4. Refresh Token 해시 저장
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hash(tokens.refreshToken) },
    });

    return tokens;
  }

  async refresh(refreshToken: string) {
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });

    // Refresh Token 해시 대조
    const isValid = await compare(refreshToken, user.refreshTokenHash);
    if (!isValid) throw new UnauthorizedException('Invalid refresh token');

    return this.generateTokens(user);
  }

  private async generateTokens(user: User) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: '15m',
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      }),
    };
  }
}
```

### Auth Module 등록
```typescript
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
```

### 규칙
- Access Token: 15분, Refresh Token: 30일
- Refresh Token은 DB에 해시 저장 (bcrypt)
- JWT Secret은 환경변수 (하드코딩 금지)
- 401 응답 시 클라이언트는 자동 refresh 시도
- refresh 실패 → 로그아웃 (모든 토큰 무효화)
- OAuth 토큰 검증은 서버에서 (클라이언트 신뢰 금지)
- `@Public()` 데코레이터로 공개 엔드포인트 명시
- Global Guard로 JwtAuthGuard 등록 (기본 인증 필수)
