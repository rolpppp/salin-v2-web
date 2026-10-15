import { describe, expect, it } from "vitest";
import { appRequestHref } from "./app-request";

describe("appRequestHref", () => {
  it("is a mailto to the Salin project address with a subject and body", () => {
    const u = new URL(appRequestHref());
    expect(u.protocol).toBe("mailto:");
    expect(u.pathname).toBe("proj.salin@gmail.com");
    expect(u.searchParams.get("subject")).toBe("Salin Android app (APK) request");
    expect(u.searchParams.get("body")).toContain("Android app (APK)");
  });
  it("adds the name and account email when known", () => {
    const body = new URL(appRequestHref({ name: " Mika ", accountEmail: "m@x.ph" })).searchParams.get("body");
    expect(body).toContain("Name: Mika");
    expect(body).toContain("Salin account: m@x.ph");
  });
});
