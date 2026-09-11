import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATN Catalyst",
  description: "All Things Network Catalyst — reseller portal on Cisco IoT Control Center",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
