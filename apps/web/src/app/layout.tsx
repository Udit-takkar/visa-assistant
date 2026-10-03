import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import "./workspace.css";
import "./assistant.css";

export const metadata: Metadata = {
  title: "Visa Notes · Schengen research workspace",
  description:
    "Collect applicant experiences and preserve the evidence behind every observation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
