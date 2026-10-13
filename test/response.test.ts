import { expect, test } from "bun:test";
import {
  BusinessError,
  InvalidResponseError,
  createClient,
  BaseService,
  errorMessage,
  isRequestCancelled,
  cancelled,
} from "@";
import {
  parseResponse,
  unwrapResponse,
  wrapRequest,
  getData,
  checkOk,
  createSendsCodec,
} from "@/response/sends";
import { fixture } from "./fixtures";

test("sends success requires data; code takes priority over msg", async () => {
  for (const value of [
    null,
    [],
    {},
    { msg: " " },
    { code: -1, msg: "bad" },
    { code: 1.5, msg: "bad" },
    { code: 0, msg: "ok" },
  ]) {
    expect(() => parseResponse(value)).toThrow(InvalidResponseError);
  }
  expect(
    unwrapResponse<boolean>({ code: 0, msg: "success", data: false }),
  ).toBe(false);
  expect(await getData(Promise.resolve({ msg: "ok", data: null }))).toBeNull();
  expect(await checkOk(Promise.resolve({ msg: "ok", data: 0 }))).toBe(true);
  expect(
    await wrapRequest(
      Promise.resolve({ msg: "ok", data: 4 }),
      async (response) => response.data * 2,
    ),
  ).toBe(8);
});

test("sends failure preserves business metadata and original observer errors", async () => {
  const codec = createSendsCodec({ 1001: { message: "denied", status: 403 } });
  const envelope = await codec.parse({ code: 1001, msg: "ok" });
  try {
    codec.unwrap(envelope);
    throw new Error("expected business failure");
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe(1001);
    expect(error).toMatchObject({ message: "denied", suggestedStatus: 403 });
  }
  await expect(
    checkOk(Promise.resolve({ msg: "denied" })),
  ).rejects.toBeInstanceOf(BusinessError);
  const failure = new Error("offline");
  const seen: unknown[] = [];
  await expect(
    getData(Promise.reject(failure), async (error) => {
      seen.push(error);
      throw new Error("observer failed");
    }),
  ).rejects.toBe(failure);
  expect(seen).toEqual([failure]);
  await expect(
    wrapRequest(Promise.resolve({ msg: "ok", data: 1 }), () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
});

test("service composition and convenience methods preserve verbs and HEAD semantics", async () => {
  const f = fixture("fetch");
  const client = createClient({ transport: f.transport });
  class Items extends BaseService {
    save() {
      return this.http.put("/items/1", { value: 2 });
    }
    remove() {
      return this.http.delete("/items/1");
    }
  }
  const service = new Items("items", client);
  expect(service.serviceName).toBe("items");
  await service.save();
  await service.remove();
  const head = await client.head("/items/1");
  expect(f.requests.map((request) => request.method)).toEqual([
    "PUT",
    "DELETE",
    "HEAD",
  ]);
  expect(JSON.parse(f.requests[0]!.body as string)).toEqual({ value: 2 });
  expect(head.status).toBe(200);
  expect(head.data).toBeUndefined();
  client.dispose();
});

test("cancellation helpers distinguish cancellation from ordinary failures", () => {
  expect(isRequestCancelled(cancelled())).toBe(true);
  expect(
    isRequestCancelled(Object.assign(new Error(), { code: "ERR_CANCELED" })),
  ).toBe(true);
  expect(isRequestCancelled(new Error("offline"))).toBe(false);
  expect(isRequestCancelled(null)).toBe(false);
  expect(errorMessage(cancelled())).toBe("");
  expect(errorMessage(new Error("offline"))).toBe("offline");
});
