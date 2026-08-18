import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type ErrorCode,
  type ErrorEnvelope,
  httpStatusFor,
  isOurFault,
} from '@convert/contracts';
import { UseCaseError } from '@convert/application';

/**
 * The single place transport meets failure. Every error becomes the one envelope, and the
 * mapping from code to status lives in @convert/contracts rather than being restated per
 * controller (ADR 0018).
 *
 * Two rules this enforces that reviews keep having to catch otherwise:
 *   - no driver error, SQL fragment, or stack trace ever reaches a client
 *   - every response carries a requestId, so a rep saying "it failed" is diagnosable
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const requestId = request.id;

    const { code, message, status } = this.classify(exception);
    const envelope: ErrorEnvelope = { code, message, requestId };

    // Logged once, here, at the boundary. Layers below throw; they do not also log, or
    // one failure appears four times and none of them is the whole story.
    const context = {
      requestId,
      code,
      status,
      method: request.method,
      url: request.url,
    };

    if (isOurFault(code) || status >= 500) {
      this.logger.error({ ...context, err: exception }, message);
    } else {
      this.logger.warn(context, message);
    }

    void reply.status(status).send(envelope);
  }

  private classify(exception: unknown): { code: ErrorCode; message: string; status: number } {
    if (exception instanceof UseCaseError) {
      return {
        code: exception.code,
        message: exception.message,
        status: httpStatusFor(exception.code),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 401
          ? 'unauthenticated'
          : status === 403
            ? 'forbidden'
            : status === 404
              ? 'not_found'
              : status === 429
                ? 'rate_limited'
                : status >= 500
                  ? 'internal_error'
                  : 'validation_failed';
      return { code, message: exception.message, status };
    }

    // Anything unrecognised is ours until proven otherwise, and the detail stays in the
    // log rather than in the response body.
    return {
      code: 'internal_error',
      message: 'unhandled exception',
      status: 500,
    };
  }
}
