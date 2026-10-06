import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "./styles.css";
import { PickerPage } from "./pages/PickerPage";
import { ManagementPage } from "./pages/ManagementPage";
import { OverlayPage } from "./pages/OverlayPage";
import { LeavePage } from "./pages/LeavePage";

function Page() {
  switch (window.location.hash.slice(1)) {
    case "management":
      return <ManagementPage />;
    case "overlay":
      return <OverlayPage />;
    case "leave-warning":
      return <LeavePage mode="warning" />;
    case "leave-block":
      return <LeavePage mode="block" />;
    default:
      return <PickerPage />;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
