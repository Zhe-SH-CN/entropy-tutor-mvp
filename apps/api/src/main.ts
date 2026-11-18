import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { validateRuntimeEnv } from "./runtime-env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  validateRuntimeEnv();
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
