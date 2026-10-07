import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { readConfig } from '../config';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: Record<string, unknown> = {
      code: 'INTERNAL_ERROR',
      message: 'تعذر إتمام العملية. يرجى المحاولة لاحقاً',
    };
    if (error instanceof HttpException) {
      status = error.getStatus();
      const payload = error.getResponse();
      body =
        typeof payload === 'string' ? { message: payload } : { ...payload };
      const uploadErrors: Record<string, string> = {
        'File too large': 'حجم الملف يتجاوز الحد المسموح',
        'Too many fields': 'يحتوي الطلب حقولاً إضافية غير مسموحة',
        'Too many parts': 'يحتوي الطلب أجزاء إضافية غير مسموحة',
        'Too many files': 'يمكن رفع ملف واحد فقط',
        'Unexpected field': 'حقل الملف غير صحيح',
      };
      if (typeof body.message === 'string' && uploadErrors[body.message])
        body.message = uploadErrors[body.message];
      if (status >= 500)
        body = { message: 'تعذر إتمام العملية. يرجى المحاولة لاحقاً' };
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      status = 409;
      body = {
        code: 'CONFLICT',
        message: 'الاسم أو اسم المستخدم مستخدم مسبقاً',
      };
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      status = 409;
      body = {
        code: 'RETRY',
        message: 'تغيرت البيانات أثناء الحفظ. يرجى إعادة المحاولة',
      };
    } else if (
      error instanceof SyntaxError ||
      (typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 413)
    ) {
      status = error instanceof SyntaxError ? 400 : 413;
      body = { message: 'الطلب غير صحيح أو يتجاوز الحجم المسموح' };
    }
    res
      .status(status)
      .json({
        ...body,
        statusCode: status,
        code: body.code ?? 'HTTP_' + status,
      });
  }
}
export function configureHttp(app: INestApplication) {
  const config = readConfig();
  app.setGlobalPrefix('api');
  // The single trusted proxy is reachable only through a loopback-bound port.
  // Docker may present the host proxy as a bridge address. Production has one
  // Nginx hop, replaces incoming XFF, and publishes the API on loopback only.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.NODE_ENV === 'production' ? 1 : 'loopback');
  app.use(
    helmet({
      strictTransportSecurity:
        config.NODE_ENV === 'production' ? { maxAge: 31536000 } : false,
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== config.APP_ORIGIN ||
        req.headers['x-count-daraa'] !== '1')
    ) {
      res
        .status(403)
        .json({
          statusCode: 403,
          code: 'CSRF',
          message: 'الطلب غير مسموح. يرجى فتح المنصة من عنوانها المعتمد',
        });
      return;
    }
    next();
  });
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        statusCode: 429,
        code: 'RATE_LIMIT',
        message: 'محاولات دخول كثيرة. يرجى المحاولة بعد 15 دقيقة',
      },
    }),
  );
  app.use(json({ limit: '64kb' }));
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
}
