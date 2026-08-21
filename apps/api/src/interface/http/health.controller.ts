import { Controller, Get, Inject } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse, ReadinessResponse } from '@convert/contracts';
import { ZodResponse } from 'nestjs-zod';
import { DATABASE_READINESS } from '../../composition/tokens';
import type { DatabaseReadiness } from '../../composition/infra.module';
import { ErrorEnvelopeDto } from './error.dto';
import { HealthResponseDto, ReadinessResponseDto } from './health.dto';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(DATABASE_READINESS) private readonly databaseReadiness: DatabaseReadiness) {}

  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns ok when the API process is serving requests. No authentication.',
  })
  @ZodResponse({ status: 200, type: HealthResponseDto })
  @ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto })
  get(): HealthResponse {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.0.0',
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Returns ready only after the API can query its application database.',
  })
  @ZodResponse({ status: 200, type: ReadinessResponseDto })
  @ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto })
  async ready(): Promise<ReadinessResponse> {
    await this.databaseReadiness.check();
    return {
      status: 'ready',
      time: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.0.0',
    };
  }
}
