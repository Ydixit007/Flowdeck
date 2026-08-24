import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody } from "@/lib/api";
import { pushSubscribeSchema } from "@/lib/validation";
import { PushSubscription } from "@/models/Social";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, pushSubscribeSchema);
    await connectDB();
    await PushSubscription.findOneAndUpdate(
      { endpoint: input.endpoint },
      {
        $set: {
          userId: user._id,
          keys: input.keys,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      },
      { upsert: true },
    );
    return ok({ subscribed: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    await connectDB();
    await PushSubscription.deleteMany({
      userId: user._id,
      ...(endpoint ? { endpoint } : {}),
    });
    return ok({ unsubscribed: true });
  } catch (error) {
    return handleError(error);
  }
}
