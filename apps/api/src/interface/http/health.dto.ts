import { ApiProperty } from '@nestjs/swagger';

/**
 * Every DTO carries an example (ADR 0015). A spec with types but no examples is half a
 * document, and gate G10 fails an endpoint with no typed response.
 *
 * Note the explicit `type` on every property. The generator runs under tsx/esbuild, which
 * does not emit decorator metadata, so Swagger cannot infer property types by reflection.
 * Declaring them is also the more honest option: the spec then says what we meant rather
 * than what a transpiler happened to record.
 */
export class HealthResponse {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: String, format: 'date-time', example: '2026-08-18T12:00:00.000Z' })
  time!: string;

  @ApiProperty({ type: String, example: '0.0.0' })
  version!: string;
}
