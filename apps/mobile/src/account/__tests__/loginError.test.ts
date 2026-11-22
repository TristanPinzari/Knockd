import { loginErrorMessage } from "../loginError";

describe("loginErrorMessage", () => {
  test("says nothing when the person closed the login page", () => {
    expect(
      loginErrorMessage(Object.assign(new Error("User cancelled"), { name: "a0.session.user_cancelled" })),
    ).toBeNull();
    expect(loginErrorMessage({ code: "USER_CANCELLED", message: "cancelled" })).toBeNull();
  });

  test("shows Auth0's reason when it has one", () => {
    const error = { name: "access_denied", message: "Service not found: https://api.knockd.rodeo" };
    expect(loginErrorMessage(error)).toBe("Couldn't log in: Service not found: https://api.knockd.rodeo");
  });

  test("falls back to a plain message for anything else", () => {
    expect(loginErrorMessage(undefined)).toBe("Couldn't log in. Try again.");
  });
});
