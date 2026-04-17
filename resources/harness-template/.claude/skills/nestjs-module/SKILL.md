---
name: nestjs-module
description: NestJS 모듈 패턴. Controller, Service, DTO, Module 구조.
globs: server/src/**/*.module.ts, server/src/**/*.controller.ts, server/src/**/*.service.ts, server/src/**/dto/**
---

## NestJS 모듈 패턴 가이드

### Module 정의
```typescript
import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService], // 다른 모듈에서 사용 시
})
export class GameModule {}
```

### Controller (얇게)
```typescript
import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GameService } from './game.service';
import { RollDiceResponseDto } from './dto/roll-dice-response.dto';

@ApiTags('Game')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('board')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('roll')
  @ApiOperation({ summary: '주사위 굴리기' })
  @ApiResponse({ status: 200, type: RollDiceResponseDto })
  async rollDice(@CurrentUser() user: JwtPayload): Promise<RollDiceResponseDto> {
    return this.gameService.rollDice(user.sub);
  }

  @Get(':boardId')
  @ApiOperation({ summary: '보드 상세 조회' })
  async getBoardDetail(
    @Param('boardId') boardId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gameService.getBoardDetail(boardId, user.sub);
  }
}
```

### Service (비즈니스 로직 집중)
```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async rollDice(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. 주사위 잔량 확인
      const participant = await tx.boardParticipant.findFirst({
        where: { participantId: userId, participantType: 'USER' },
      });
      if (!participant) throw new NotFoundException('보드 참가 정보 없음');

      const diceBalance = await this.getDiceBalance(tx, userId);
      if (diceBalance < 1) throw new BadRequestException('주사위 부족');

      // 2. 주사위 결과 (서버 랜덤)
      const dice = Math.floor(Math.random() * 6) + 1;

      // 3. 이동 처리
      const boardSize = 20;
      const newPosition = (participant.currentPosition + dice) % boardSize;
      const passedStart = participant.currentPosition + dice >= boardSize;

      // 4. 출발점 통과 보너스
      if (passedStart) {
        await this.addPoints(tx, userId, 200, 'START_BONUS');
      }

      // 5. 위치 업데이트 + 칸 이벤트 처리
      // ...

      return { dice, newPosition, passedStart };
    });
  }
}
```

### DTO (class-validator)
```typescript
import { IsString, IsNumber, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BuyLandDto {
  @ApiProperty({ description: '보드 타일 ID' })
  @IsString()
  tileId: string;
}

export class RollDiceResponseDto {
  @ApiProperty({ description: '주사위 결과', minimum: 1, maximum: 6 })
  @IsNumber()
  @Min(1)
  @Max(6)
  dice: number;

  @ApiProperty({ description: '새 위치' })
  @IsNumber()
  newPosition: number;

  @ApiProperty({ description: '출발점 통과 여부' })
  passedStart: boolean;

  @ApiPropertyOptional({ description: '도착 칸 이벤트' })
  @IsOptional()
  event?: TileEventDto;
}
```

### PrismaService (싱글턴)
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### 규칙
- Controller는 라우팅 + 검증만. 비즈니스 로직은 Service로
- 모든 Controller 메서드에 Swagger 데코레이터 필수
- DTO는 class-validator로 검증, class-transformer로 변환
- Service 의존성은 생성자 주입 (DI)
- ConfigModule로 환경변수 접근 (.env 직접 참조 금지)
- 에러는 NestJS HttpException 계열 사용
- 트랜잭션: Prisma `$transaction` (interactive 선호)
- 밸런스 수치 하드코딩 금지
