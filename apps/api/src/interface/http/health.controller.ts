import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponse } from './health.dto';

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns ok when the API process is serving requests. No authentication.',
  })
  @ApiOkResponse({ type: HealthResponse })
  get(): HealthResponse {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.0.0',
    };
  }
}
