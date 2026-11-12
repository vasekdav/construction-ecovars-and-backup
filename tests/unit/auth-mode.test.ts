import { describe, expect, it } from "vitest";
import { authMode } from "@/lib/auth/mode";

describe("authMode (ADR-039)", () => {
  it("is open by default", () => {
    expect(authMode({})).toBe("open");
    expect(authMode({ AUTH_MODE: "" })).toBe("open");
    expect(authMode({ AUTH_MODE: "something" })).toBe("open");
  });

  it("is password only when explicitly requested", () => {
    expect(authMode({ AUTH_MODE: "password" })).toBe("password");
    expect(authMode({ AUTH_MODE: " Password " })).toBe("password");
  });
});
