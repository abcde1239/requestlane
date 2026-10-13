import { createClient, defineEndpoint } from "@";
import { createFetchTransport } from "@/adapters/fetch";
import { createAxiosTransport } from "@/adapters/axios";

async function browserContracts() {
  let assertions = 0;
  function check(value: boolean, label: string) {
    assertions++;
    if (!value) throw new Error(label);
  }
  for (const kind of ["fetch", "axios"] as const) {
    const transport =
      kind === "fetch" ? createFetchTransport() : createAxiosTransport();
    const client = createClient({ baseURL: location.origin, transport });
    const endpoint = defineEndpoint<{ data: { value: number; count: number } }>(
      { method: "GET", path: `/data/${kind}`, cache: true },
    );
    const values = await Promise.all(
      Array.from({ length: 10 }, () => client.call(endpoint, {})),
    );
    check(
      values.every((value) => value.value === 7 && value.count === 1),
      `${kind} shared cache`,
    );
    check((await client.call(endpoint, {})).count === 1, `${kind} cache hit`);
    client.invalidate({ endpoint });
    check(
      (await client.call(endpoint, {})).count === 2,
      `${kind} invalidation`,
    );
    const bytes = new Uint8Array(
      await client.get<ArrayBuffer>("/binary", { responseType: "arraybuffer" }),
    );
    check(bytes[0] === 1 && bytes[2] === 3, `${kind} binary`);
    check(
      (await client.get<Blob>("/binary", { responseType: "blob" })).size === 3,
      `${kind} blob`,
    );
    const saved = await client.patch<
      { body: { name: string } },
      { name: string }
    >("/write", { name: "browser" });
    check(saved.body.name === "browser", `${kind} JSON body`);
    const form = new FormData();
    form.set("name", "multipart");
    const upload = await client.post<{ contentType: string; text: string }>(
      "/form",
      form,
    );
    check(
      upload.contentType.includes("multipart/form-data; boundary=") &&
        upload.text.includes("multipart"),
      `${kind} multipart boundary`,
    );
    let rejected = false;
    try {
      await client.get("/unauthorized");
    } catch (error) {
      rejected = (error as { status: number }).status === 401;
    }
    check(rejected, `${kind} HTTP error`);
    client.dispose();
  }
  return assertions;
}
browserContracts().then(
  (assertions) => {
    document.body.dataset.result = "passed";
    document.body.textContent = JSON.stringify({ passed: true, assertions });
  },
  (error) => {
    document.body.dataset.result = "failed";
    document.body.textContent = String(
      error instanceof Error ? error.stack : error,
    );
  },
);
