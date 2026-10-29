import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { setLocale } from "@shared/i18n";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";
import { PickerPage } from "./pages/PickerPage";
import { ManagementPage } from "./pages/ManagementPage";
import { OverlayPage } from "./pages/OverlayPage";
import { LeavePage } from "./pages/LeavePage";
import { WelcomePage } from "./pages/WelcomePage";
import { EncryptionSetupPage } from "./pages/EncryptionSetupPage";
import { UnlockPage } from "./pages/UnlockPage";
import { EncryptionSettingsPage } from "./pages/EncryptionSettingsPage";

setLocale(window.api.locale);
document.documentElement.lang = window.api.locale;

const encryption = window.api.encryption;

/** The signed-in account, which the unlock and encryption pages show. */
function WithEmail({ children }: { children: (email: string) => ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void window.api.sync.get().then((info) => setEmail(info.email ?? ""));
  }, []);
  return email === null ? null : children(email);
}

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
    case "welcome":
      return (
        <WelcomePage
          onUseLocal={() => window.api.storage.useLocal()}
          onSignIn={() => window.api.auth.signIn()}
          onOpenPrivacy={() => void window.api.shell.openGuide("privacy")}
        />
      );
    case "encryption-setup":
      return (
        <EncryptionSetupPage
          onCreate={(passphrase) => encryption.create(passphrase)}
          onCopy={(key) => encryption.copyRecoveryKey(key)}
          onSaveToFile={(key) => encryption.saveRecoveryKeyToFile(key)}
          onDone={() => void encryption.finishSetup()}
          onSignOut={() => encryption.signOut()}
        />
      );
    case "unlock":
      return (
        <WithEmail>
          {(email) => (
            <UnlockPage
              email={email}
              onUnlock={(kind, secret) => encryption.unlock(kind, secret)}
              onSignOut={() => encryption.signOut()}
            />
          )}
        </WithEmail>
      );
    case "encryption":
      return (
        <WithEmail>
          {(email) => (
            <EncryptionSettingsPage
              email={email}
              onChangePassphrase={(kind, secret, passphrase) => encryption.changePassphrase(kind, secret, passphrase)}
              onCreateRecoveryKey={() => encryption.createRecoveryKey()}
              onCopy={(key) => encryption.copyRecoveryKey(key)}
              onSaveToFile={(key) => encryption.saveRecoveryKeyToFile(key)}
              onOpenHowItWorks={() => void window.api.shell.openGuide("privacy")}
              onClose={() => window.close()}
            />
          )}
        </WithEmail>
      );
    default:
      return <PickerPage />;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
