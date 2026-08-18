import { ApiProperty } from '@nestjs/swagger';
import { ERROR_CODES } from '@convert/contracts';

/**
 * The error envelope, documented once and referenced by every endpoint (ADR 0015).
 * Consumers - the web app today, paying integrators later - need the code list in the
 * spec, because branching on a code is the contract and branching on a message is not.
 */
export class FieldErrorDto {
  @ApiProperty({ type: String, example: 'phone' })
  field!: string;

  @ApiProperty({ type: String, example: 'not a valid Ghanaian phone number' })
  message!: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: String, enum: ERROR_CODES, example: 'conversation_window_closed' })
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Technical summary. Do not show this to a user; use the code to pick copy.',
    example: 'free-form send refused: conversation window closed',
  })
  message!: string;

  @ApiProperty({ type: [FieldErrorDto], required: false })
  details?: FieldErrorDto[];

  @ApiProperty({ type: String, required: false, example: 'req-01JBQZ3K7X8V9WQ0R1S2T3V4W5' })
  requestId?: string;
}
