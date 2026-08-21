import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, createZodValidationPipe } from 'nestjs-zod';
import { InfraModule } from './composition/infra.module';
import { HealthController } from './interface/http/health.controller';

/**
 * Root module. Controllers are thin: they resolve a Principal, call a use case, and map
 * the result. Business rules live in @convert/application and @convert/core, which is
 * enforced by tools/check_boundaries.py rather than by convention.
 */
@Module({
  imports: [InfraModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useClass: createZodValidationPipe({ strictSchemaDeclaration: true }),
    },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
