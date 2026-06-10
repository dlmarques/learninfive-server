import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: string;
}

const getHttpExceptionMessage = (exception: HttpException) => {
  const response = exception.getResponse();

  if (typeof response === "string") {
    return response;
  }

  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response
  ) {
    return (response as { message: string | string[] }).message;
  }

  return exception.message;
};

const getHttpExceptionCode = (exception: HttpException) => {
  const response = exception.getResponse();

  if (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    typeof (response as { code?: unknown }).code === "string"
  ) {
    return (response as { code: string }).code;
  }

  return undefined;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();

    if (exception instanceof HttpException) {
      const body: ApiErrorBody = {
        statusCode: exception.getStatus(),
        message: getHttpExceptionMessage(exception),
      };
      const code = getHttpExceptionCode(exception);

      if (code) {
        body.code = code;
      }

      httpAdapter.reply(context.getResponse(), body, exception.getStatus());
      return;
    }

    httpAdapter.reply(
      context.getResponse(),
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal server error",
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
