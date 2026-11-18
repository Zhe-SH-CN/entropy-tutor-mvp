import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser());
  const allowed = (process.env.APP_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim());
  app.enableCors({
    credentials: true,
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowed.includes(origin)) callback(null, true);
      else callback(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key"],
  });
  const config = new DocumentBuilder().setTitle("熵曦家教平台 API").setVersion("0.2.0").build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));
}
