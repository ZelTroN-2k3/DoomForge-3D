import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile.css";
import "./toolbar.css";
import "./drawing.css";
import "./modeling.css";
import "./offline.css";

const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const INSTALL_EVENTS = `window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.cadverixInstallPrompt=event;window.dispatchEvent(new Event("cadverix-install-available"));});window.addEventListener("appinstalled",function(){window.cadverixInstallPrompt=null;});`;

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export const metadata: Metadata = {
  title: "DoomForge 3D — Retro FPS Level Designer",
  description: "Create and playtest 3D worlds, levels and sectors for retro FPS games like Doom and Doom 2",
  ...(STATIC_EXPORT ? { manifest: "/manifest.webmanifest", applicationName: "DoomForge 3D", appleWebApp: { capable: true, title: "DoomForge 3D", statusBarStyle: "default" as const } } : {}),
  icons: {
    icon: [
      { url: "/assets/doomforge/doomforge-logo.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/assets/doomforge/doomforge-logo.svg" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body suppressHydrationWarning>{STATIC_EXPORT ? <script dangerouslySetInnerHTML={{ __html: INSTALL_EVENTS }} /> : null}{children}</body>
    </html>
  );
}
