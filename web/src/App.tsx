import { RouterProvider } from "react-router";
import { router } from "./router/routes";
import { Toaster } from "./components/ui/sonner";
import { PageTransitionRipple } from "./components/PageTransitionRipple";

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <PageTransitionRipple />
    </>
  );
}
