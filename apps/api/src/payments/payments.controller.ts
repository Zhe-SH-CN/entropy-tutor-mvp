import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post("webhook")
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers("x-demo-signature") signature: string | undefined, @Body() _body: unknown) {
    return this.payments.handleWebhook(request.rawBody, signature);
  }
}
