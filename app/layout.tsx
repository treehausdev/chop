import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CHOP — Sample Any Song",
  description: "Search any song, auto-chop it into pads, and finger-drum your own beats. Edit slices, preview loops, and play live — all in the browser.",
  openGraph: {
    title: "CHOP — Sample Any Song",
    description: "Search any song, auto-chop it into pads, and finger-drum your own beats.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0a0a0a" }}>
        {children}
      </body>
    </html>
  );
}
