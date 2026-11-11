import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/safe-redirect";

describe("safeCallbackUrl", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["admin", "/"],
    ["/admin/users", "/admin/users"],
    ["/projects?x=1", "/projects?x=1"],
  ])("%s -> %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });
});
