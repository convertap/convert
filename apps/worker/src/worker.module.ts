import { Module } from '@nestjs/common';
import { InfraModule } from './composition/infra.module';

@Module({ imports: [InfraModule] })
export class WorkerModule {}
