import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATN Catalyst",
  description: "All Things Network Catalyst — reseller portal on Cisco IoT Control Center",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
