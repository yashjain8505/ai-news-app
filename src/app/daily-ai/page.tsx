import { redirect } from "next/navigation";

// Daily lives at the home ("/"); keep the pretty slug working by redirecting.
export default function Page() {
  redirect("/");
}
