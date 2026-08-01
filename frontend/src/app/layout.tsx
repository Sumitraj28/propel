import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KSPDB Fault Detection & Localization System',
  description: 'Karnataka State Power Distribution Board Real-Time Fault Localization Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-cc-bg text-cc-text antialiased">
        {children}
      </body>
    </html>
  );
}
