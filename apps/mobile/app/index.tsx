import { Redirect } from "expo-router";

/** TODO(auth): redirect to the tabs when a session or account token exists. */
export default function Index() {
  return <Redirect href="/join" />;
}
